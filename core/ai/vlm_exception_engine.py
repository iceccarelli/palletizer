"""VLM exception engine: the asynchronous, non-deterministic correction path.

This process is deliberately decoupled from the 50-100 Hz edge control loop.
It watches the cell over OPC UA, and when the cell reports an EXCEPTION
(mispick, skewed box, occluded fiducial), it analyses the offending camera
frame with a vision-language model and — only if confidence clears the
threshold — writes a strictly validated ``SpatialCorrection`` back into the
cell. Inference latency (hundreds of ms to seconds) therefore never touches
the deterministic motion path: the robot holds its safe exception pose while
this engine thinks.

The ``analyze_frame`` hook is pluggable. The default implementation is a
deterministic simulation so the full loop runs hardware-free and offline;
swap in a real VLM client (Claude, Llama-Vision, local ONNX head) without
touching the safety plumbing.

Run against the mock cell:

    python -m core.ai.vlm_exception_engine
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from collections.abc import Awaitable, Callable

from asyncua import Client, ua
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger("palletizer.vlm")

ENDPOINT = os.getenv("PALLETIZER_OPCUA_ENDPOINT", "opc.tcp://127.0.0.1:4840/palletizer/")
NAMESPACE_URI = "http://palletizer.dev/cell"
CELL_OBJECT = "PalletizerCell_1"

STATUS_EXCEPTION = 2
CONFIDENCE_THRESHOLD = float(os.getenv("PALLETIZER_VLM_CONFIDENCE", "0.95"))
POLL_INTERVAL_S = 0.25  # exception polling; NOT the motion loop
MAX_CORRECTION_MM = 50.0  # hard physical clamp on any single-axis correction


class VlmCorrection(BaseModel):
    """Spatial offset proposed by the VLM. Every field is range-checked
    before it can reach the industrial protocol layer."""

    dx: float = Field(ge=-MAX_CORRECTION_MM, le=MAX_CORRECTION_MM)
    dy: float = Field(ge=-MAX_CORRECTION_MM, le=MAX_CORRECTION_MM)
    dz: float = Field(ge=-MAX_CORRECTION_MM, le=MAX_CORRECTION_MM)
    confidence_score: float = Field(ge=0.0, le=1.0)
    execute_override: bool


class FrameAnalysisRequest(BaseModel):
    """What the engine hands the model: current pose + a frame reference."""

    frame_id: str
    current_pose: list[float] = Field(min_length=6, max_length=6)
    gripper_pressure_kpa: float


AnalyzeFn = Callable[[FrameAnalysisRequest], Awaitable[VlmCorrection]]


async def simulate_vlm_analysis(request: FrameAnalysisRequest) -> VlmCorrection:
    """Deterministic stand-in for a real VLM call.

    Derives a small, repeatable offset from the frame id hash so tests are
    stable, and simulates realistic inference latency.
    """
    await asyncio.sleep(0.4)  # token latency lives HERE, not in the control loop
    digest = hashlib.sha256(request.frame_id.encode()).digest()
    # Map two hash bytes to +/- 12 mm offsets — a plausible skew correction.
    dx = (digest[0] / 255.0 - 0.5) * 24.0
    dy = (digest[1] / 255.0 - 0.5) * 24.0
    confidence = 0.90 + (digest[2] / 255.0) * 0.10  # 0.90-1.00
    return VlmCorrection(
        dx=round(dx, 2),
        dy=round(dy, 2),
        dz=0.0,
        confidence_score=round(confidence, 4),
        execute_override=True,
    )


class VlmExceptionEngine:
    """Async OPC UA client that resolves cell exceptions with VLM output."""

    def __init__(
        self,
        endpoint: str = ENDPOINT,
        analyze: AnalyzeFn = simulate_vlm_analysis,
        confidence_threshold: float = CONFIDENCE_THRESHOLD,
    ) -> None:
        self.endpoint = endpoint
        self.analyze = analyze
        self.confidence_threshold = confidence_threshold
        self.client: Client | None = None
        self._nodes: dict[str, object] = {}
        self._stop = asyncio.Event()
        self.corrections_applied = 0
        self.corrections_rejected = 0

    async def connect(self) -> None:
        self.client = Client(url=self.endpoint)
        await self.client.connect()
        ns = await self.client.get_namespace_index(NAMESPACE_URI)
        cell = await self.client.nodes.objects.get_child([f"{ns}:{CELL_OBJECT}"])
        for name in (
            "RobotStatus",
            "CurrentPose",
            "GripperPressure",
            "SpatialCorrection",
            "ExecuteMove",
        ):
            self._nodes[name] = await cell.get_child([f"{ns}:{name}"])
        logger.info("VLM engine connected to %s", self.endpoint)

    async def disconnect(self) -> None:
        if self.client is not None:
            await self.client.disconnect()
            self.client = None

    async def _read(self, name: str):
        return await self._nodes[name].read_value()

    async def _write(self, name: str, value, vtype: ua.VariantType) -> None:
        await self._nodes[name].write_value(ua.Variant(value, vtype))

    # ------------------------------------------------------------------
    # Correction pipeline
    # ------------------------------------------------------------------
    async def handle_exception(self) -> bool:
        """Analyse the anomalous frame; apply the correction only if it
        validates AND clears the confidence gate. Returns True if applied."""
        pose = [float(v) for v in await self._read("CurrentPose")]
        pressure = float(await self._read("GripperPressure"))
        request = FrameAnalysisRequest(
            frame_id=f"frame-{int(time.time() * 1000)}",
            current_pose=pose,
            gripper_pressure_kpa=pressure,
        )

        started = time.monotonic()
        try:
            raw = await self.analyze(request)
            correction = VlmCorrection.model_validate(raw.model_dump())
        except ValidationError:
            logger.exception("VLM output failed schema validation — rejected")
            self.corrections_rejected += 1
            return False
        latency_ms = (time.monotonic() - started) * 1000.0

        if not correction.execute_override:
            logger.info("VLM declined override (latency %.0f ms)", latency_ms)
            self.corrections_rejected += 1
            return False

        if correction.confidence_score <= self.confidence_threshold:
            logger.warning(
                "Confidence %.4f <= threshold %.2f — escalating to operator, "
                "no autonomous write",
                correction.confidence_score,
                self.confidence_threshold,
            )
            self.corrections_rejected += 1
            return False

        await self._write(
            "SpatialCorrection",
            [correction.dx, correction.dy, correction.dz],
            ua.VariantType.Float,
        )
        # Re-arm the move so the cell retries the placement with the offset.
        await self._write("ExecuteMove", True, ua.VariantType.Boolean)
        self.corrections_applied += 1
        logger.info(
            "Applied correction dx=%.2f dy=%.2f dz=%.2f (conf %.4f, %.0f ms)",
            correction.dx,
            correction.dy,
            correction.dz,
            correction.confidence_score,
            latency_ms,
        )
        return True

    # ------------------------------------------------------------------
    # Watch loop
    # ------------------------------------------------------------------
    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                status = int(await self._read("RobotStatus"))
                if status == STATUS_EXCEPTION:
                    logger.warning("Cell EXCEPTION detected — invoking VLM")
                    await self.handle_exception()
            except Exception:
                logger.exception("VLM watch tick failed — retrying")
            await asyncio.sleep(POLL_INTERVAL_S)

    def stop(self) -> None:
        self._stop.set()


async def _main() -> None:
    engine = VlmExceptionEngine()
    await engine.connect()
    try:
        await engine.run()
    finally:
        await engine.disconnect()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        logger.info("VLM engine stopped")


if __name__ == "__main__":
    main()
