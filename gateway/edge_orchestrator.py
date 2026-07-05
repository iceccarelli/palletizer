"""Edge orchestrator: the deterministic control-side brain of a palletiser cell.

Runs a 50-100 Hz asyncio control loop against the cell's OPC UA server
(mock or real — same address space) and enforces three guarantees:

1. **Determinism** — no AI inference, no network round-trips inside the loop.
   The loop only reads/writes OPC UA nodes and steps a local state machine.
2. **Edge autonomy** — pallet patterns pulled from the cloud are cached to
   local disk. If connectivity drops mid-pallet, the active layer is finished
   from cache; the cell never freezes with a box in the air.
3. **Watchdog safety** — if the cell's Heartbeat node stalls beyond the
   timeout, the orchestrator latches ``FAULT_ESTOP`` and stops commanding.

Run against the mock cell:

    python -m core.simulation.opcua_robot_mock      # terminal 1
    python -m gateway.edge_orchestrator             # terminal 2
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Callable
from enum import Enum
from pathlib import Path

from asyncua import Client, ua
from pydantic import BaseModel, Field, ValidationError

from core.runtime_paths import resolve_data_dir

logger = logging.getLogger("palletizer.edge")

ENDPOINT = os.getenv("PALLETIZER_OPCUA_ENDPOINT", "opc.tcp://127.0.0.1:4840/palletizer/")
NAMESPACE_URI = "http://palletizer.dev/cell"
CELL_OBJECT = "PalletizerCell_1"

CONTROL_HZ = float(os.getenv("PALLETIZER_CONTROL_HZ", "100"))
CONTROL_PERIOD_S = 1.0 / max(50.0, min(100.0, CONTROL_HZ))
HEARTBEAT_TIMEOUT_S = float(os.getenv("PALLETIZER_HEARTBEAT_TIMEOUT_S", "2.5"))
CACHE_DIR: Path | None = None  # resolved lazily via core.runtime_paths

STATUS_IDLE = 0
STATUS_MOVING = 1
STATUS_EXCEPTION = 2
STATUS_FAULT = 3


class EdgeState(str, Enum):  # noqa: UP042 - keep (str, Enum) to preserve string formatting used in telemetry/logs
    IDLE = "IDLE"
    MOVING = "MOVING"
    EXCEPTION_HANDLING = "EXCEPTION_HANDLING"
    FAULT_ESTOP = "FAULT_ESTOP"


# ---------------------------------------------------------------------------
# Pattern schema — strictly validated before anything reaches the robot
# ---------------------------------------------------------------------------
class PlacementStep(BaseModel):
    """One pick-and-place target within a layer."""

    sku: str
    x_mm: float = Field(ge=-5000, le=5000)
    y_mm: float = Field(ge=-5000, le=5000)
    z_mm: float = Field(ge=0, le=3000)
    rz_rad: float = Field(default=0.0, ge=-3.1416, le=3.1416)


class PalletLayer(BaseModel):
    layer_index: int = Field(ge=0)
    placements: list[PlacementStep] = Field(min_length=1)


class PalletPattern(BaseModel):
    pattern_id: str
    pallet_length_mm: float = Field(gt=0, le=3000)
    pallet_width_mm: float = Field(gt=0, le=3000)
    layers: list[PalletLayer] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Local cache — the autonomy layer
# ---------------------------------------------------------------------------
class PatternCache:
    """Disk-backed cache so an in-flight pallet survives a cloud outage."""

    def __init__(self, cache_dir: Path | None = CACHE_DIR) -> None:
        self.cache_dir = cache_dir or resolve_data_dir(
            "PALLETIZER_CACHE_DIR", "pattern_cache"
        )
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, pattern_id: str) -> Path:
        safe = "".join(c for c in pattern_id if c.isalnum() or c in "-_")
        return self.cache_dir / f"{safe}.json"

    def store(self, pattern: PalletPattern) -> None:
        tmp = self._path(pattern.pattern_id).with_suffix(".tmp")
        tmp.write_text(pattern.model_dump_json())
        tmp.replace(self._path(pattern.pattern_id))
        logger.info("Cached pattern %s (%d layers)", pattern.pattern_id, len(pattern.layers))

    def load(self, pattern_id: str) -> PalletPattern | None:
        path = self._path(pattern_id)
        if not path.exists():
            return None
        try:
            return PalletPattern.model_validate_json(path.read_text())
        except (ValidationError, json.JSONDecodeError):
            logger.exception("Corrupt cache entry %s — discarding", path)
            path.unlink(missing_ok=True)
            return None


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
class EdgeOrchestrator:
    """Deterministic control loop + pattern execution engine."""

    def __init__(
        self,
        endpoint: str = ENDPOINT,
        cloud_fetch: Callable[[str], PalletPattern | None] | None = None,
    ) -> None:
        self.endpoint = endpoint
        self.cache = PatternCache()
        self.cloud_fetch = cloud_fetch
        self.state = EdgeState.IDLE
        self.client: Client | None = None
        self._nodes: dict[str, object] = {}
        self._last_heartbeat_value: int | None = None
        self._last_heartbeat_change = time.monotonic()
        self._active_pattern: PalletPattern | None = None
        self._layer_idx = 0
        self._step_idx = 0
        self._stop = asyncio.Event()

    # ------------------------------------------------------------------
    # Connection / node resolution
    # ------------------------------------------------------------------
    async def connect(self) -> None:
        self.client = Client(url=self.endpoint)
        await self.client.connect()
        ns = await self.client.get_namespace_index(NAMESPACE_URI)
        root = self.client.nodes.objects
        cell = await root.get_child([f"{ns}:{CELL_OBJECT}"])
        for name in (
            "RobotStatus",
            "CurrentPose",
            "TargetPose",
            "SpatialCorrection",
            "GripperPressure",
            "Heartbeat",
            "ExecuteMove",
        ):
            self._nodes[name] = await cell.get_child([f"{ns}:{name}"])
        logger.info("Connected to cell at %s (ns=%d)", self.endpoint, ns)

    async def disconnect(self) -> None:
        if self.client is not None:
            await self.client.disconnect()
            self.client = None

    async def _read(self, name: str):
        return await self._nodes[name].read_value()

    async def _write(self, name: str, value, vtype: ua.VariantType) -> None:
        await self._nodes[name].write_value(ua.Variant(value, vtype))

    # ------------------------------------------------------------------
    # Pattern acquisition — cloud first, cache fallback
    # ------------------------------------------------------------------
    def acquire_pattern(self, pattern_id: str) -> PalletPattern | None:
        if self.cloud_fetch is not None:
            try:
                pattern = self.cloud_fetch(pattern_id)
                if pattern is not None:
                    self.cache.store(pattern)
                    return pattern
            except Exception:
                logger.warning("Cloud fetch failed for %s — falling back to cache", pattern_id)
        cached = self.cache.load(pattern_id)
        if cached is not None:
            logger.info("Serving pattern %s from local cache", pattern_id)
        return cached

    def load_pattern(self, pattern: PalletPattern) -> None:
        """Arm a validated pattern for execution and cache it immediately."""
        self.cache.store(pattern)
        self._active_pattern = pattern
        self._layer_idx = 0
        self._step_idx = 0
        logger.info(
            "Pattern %s armed: %d layers, %d placements total",
            pattern.pattern_id,
            len(pattern.layers),
            sum(len(layer.placements) for layer in pattern.layers),
        )

    # ------------------------------------------------------------------
    # Watchdog
    # ------------------------------------------------------------------
    def _check_heartbeat(self, hb: int) -> bool:
        now = time.monotonic()
        if hb != self._last_heartbeat_value:
            self._last_heartbeat_value = hb
            self._last_heartbeat_change = now
        return (now - self._last_heartbeat_change) <= HEARTBEAT_TIMEOUT_S

    # ------------------------------------------------------------------
    # Control loop
    # ------------------------------------------------------------------
    async def run(self) -> None:
        """The deterministic loop. One OPC UA read/write set per tick, no more."""
        next_tick = time.monotonic()
        while not self._stop.is_set():
            try:
                hb = int(await self._read("Heartbeat"))
                if not self._check_heartbeat(hb):
                    if self.state is not EdgeState.FAULT_ESTOP:
                        logger.error(
                            "Heartbeat stalled > %.1fs — latching FAULT_ESTOP",
                            HEARTBEAT_TIMEOUT_S,
                        )
                    self.state = EdgeState.FAULT_ESTOP
                else:
                    await self._step_state_machine()
            except Exception:
                logger.exception("Control tick failed — latching FAULT_ESTOP")
                self.state = EdgeState.FAULT_ESTOP

            next_tick += CONTROL_PERIOD_S
            delay = next_tick - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            else:
                # Loop overran: resync rather than accumulating drift.
                next_tick = time.monotonic()

    async def _step_state_machine(self) -> None:
        robot_status = int(await self._read("RobotStatus"))

        if self.state is EdgeState.FAULT_ESTOP:
            return  # latched; requires external reset()

        if robot_status == STATUS_FAULT:
            logger.error("Cell reported FAULT — latching FAULT_ESTOP")
            self.state = EdgeState.FAULT_ESTOP
            return

        if robot_status == STATUS_EXCEPTION:
            if self.state is not EdgeState.EXCEPTION_HANDLING:
                logger.warning("Cell in EXCEPTION — deferring to VLM correction path")
            self.state = EdgeState.EXCEPTION_HANDLING
            return

        if self.state is EdgeState.EXCEPTION_HANDLING and robot_status in (
            STATUS_IDLE,
            STATUS_MOVING,
        ):
            logger.info("Exception cleared — resuming")
            self.state = EdgeState.MOVING if robot_status == STATUS_MOVING else EdgeState.IDLE

        if self.state is EdgeState.MOVING:
            if robot_status == STATUS_IDLE and not bool(await self._read("ExecuteMove")):
                self._step_idx += 1
                self.state = EdgeState.IDLE
            return

        # IDLE: dispatch the next placement if a pattern is armed.
        if self._active_pattern is None:
            return
        layers = self._active_pattern.layers
        if self._layer_idx >= len(layers):
            logger.info("Pattern %s complete", self._active_pattern.pattern_id)
            self._active_pattern = None
            return
        layer = layers[self._layer_idx]
        if self._step_idx >= len(layer.placements):
            logger.info("Layer %d complete", layer.layer_index)
            self._layer_idx += 1
            self._step_idx = 0
            return

        step = layer.placements[self._step_idx]
        await self._write(
            "TargetPose",
            [step.x_mm, step.y_mm, step.z_mm, 0.0, 0.0, step.rz_rad],
            ua.VariantType.Float,
        )
        await self._write("ExecuteMove", True, ua.VariantType.Boolean)
        self.state = EdgeState.MOVING
        logger.info(
            "Dispatch layer=%d step=%d sku=%s -> (%.1f, %.1f, %.1f)",
            self._layer_idx,
            self._step_idx,
            step.sku,
            step.x_mm,
            step.y_mm,
            step.z_mm,
        )

    def reset_fault(self) -> None:
        """Operator-acknowledged fault reset."""
        if self.state is EdgeState.FAULT_ESTOP:
            self._last_heartbeat_change = time.monotonic()
            self.state = EdgeState.IDLE
            logger.info("FAULT_ESTOP reset by operator")

    def stop(self) -> None:
        self._stop.set()


# ---------------------------------------------------------------------------
# Standalone demo entrypoint
# ---------------------------------------------------------------------------
def _demo_pattern() -> PalletPattern:
    return PalletPattern(
        pattern_id="demo-euro-mixed-001",
        pallet_length_mm=1200,
        pallet_width_mm=800,
        layers=[
            PalletLayer(
                layer_index=0,
                placements=[
                    PlacementStep(sku="BOX-A", x_mm=200, y_mm=200, z_mm=150),
                    PlacementStep(sku="BOX-A", x_mm=600, y_mm=200, z_mm=150),
                    PlacementStep(sku="BOX-B", x_mm=1000, y_mm=200, z_mm=150, rz_rad=1.5708),
                ],
            ),
            PalletLayer(
                layer_index=1,
                placements=[
                    PlacementStep(sku="BOX-B", x_mm=200, y_mm=600, z_mm=300, rz_rad=1.5708),
                    PlacementStep(sku="BOX-A", x_mm=600, y_mm=600, z_mm=300),
                ],
            ),
        ],
    )


async def _main() -> None:
    orch = EdgeOrchestrator()
    await orch.connect()
    orch.load_pattern(_demo_pattern())
    try:
        await orch.run()
    finally:
        await orch.disconnect()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("Edge orchestrator stopped")


if __name__ == "__main__":
    main()
