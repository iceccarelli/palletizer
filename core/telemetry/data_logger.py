"""Telemetry data logger: the data-moat pipeline.

Every joint position, torque sample, gripper reading, and camera-frame flag
that flows through the cell is appended as one JSON line to rotating files in
``/data/telemetry_queue/``. Downstream, these files feed the offline
fine-tuning machine (Llama-Vision heads, anomaly classifiers) — the corpus of
real mixed-SKU exception data is the asset competitors cannot clone.

Design points:
- Non-blocking: producers put records on an ``asyncio.Queue``; a single
  writer task owns the file handle. Control loops never touch disk directly.
- Bounded: if the queue fills (disk stall, IO storm), the oldest record is
  dropped and counted — telemetry must never back-pressure the control path.
- Rotating: files roll at ``max_bytes`` with a monotonic sequence suffix so
  the uploader can ship-and-delete safely.
- Crash-safe enough: line-oriented JSONL; a torn final line is skipped by any
  sane reader.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger("palletizer.telemetry")

QUEUE_DIR = Path(os.getenv("PALLETIZER_TELEMETRY_DIR", "/data/telemetry_queue"))
MAX_FILE_BYTES = int(os.getenv("PALLETIZER_TELEMETRY_MAX_BYTES", str(8 * 1024 * 1024)))
MAX_QUEUE_DEPTH = int(os.getenv("PALLETIZER_TELEMETRY_QUEUE_DEPTH", "10000"))
SCHEMA_VERSION = 1


@dataclass
class TelemetryRecord:
    """One sample of cell state. All fields optional except identity/time so
    partial sensor sets still log cleanly."""

    cell_id: str
    ts_unix: float = field(default_factory=time.time)
    joint_positions_rad: Optional[list[float]] = None
    joint_torques_nm: Optional[list[float]] = None
    tcp_pose: Optional[list[float]] = None
    gripper_pressure_kpa: Optional[float] = None
    robot_status: Optional[int] = None
    edge_state: Optional[str] = None
    camera_frame_id: Optional[str] = None
    anomaly_flag: bool = False
    vlm_correction: Optional[dict] = None
    schema_version: int = SCHEMA_VERSION

    def to_json_line(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"), ensure_ascii=False)


class DataLogger:
    """Async JSONL writer with rotation and drop-oldest overflow policy."""

    def __init__(
        self,
        cell_id: str,
        queue_dir: Path = QUEUE_DIR,
        max_file_bytes: int = MAX_FILE_BYTES,
        max_queue_depth: int = MAX_QUEUE_DEPTH,
    ) -> None:
        self.cell_id = cell_id
        self.queue_dir = queue_dir
        self.max_file_bytes = max_file_bytes
        self.queue: asyncio.Queue[TelemetryRecord] = asyncio.Queue(maxsize=max_queue_depth)
        self._writer_task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()
        self._file_seq = 0
        self._current_path: Optional[Path] = None
        self._current_bytes = 0
        self.records_written = 0
        self.records_dropped = 0

    # ------------------------------------------------------------------
    # Producer API — safe to call from any coroutine, never blocks
    # ------------------------------------------------------------------
    def log(self, record: TelemetryRecord) -> None:
        try:
            self.queue.put_nowait(record)
        except asyncio.QueueFull:
            # Shed the OLDEST record: recent state is worth more offline.
            try:
                self.queue.get_nowait()
                self.records_dropped += 1
            except asyncio.QueueEmpty:
                pass
            try:
                self.queue.put_nowait(record)
            except asyncio.QueueFull:
                self.records_dropped += 1

    def log_sample(
        self,
        joint_positions_rad: Optional[list[float]] = None,
        joint_torques_nm: Optional[list[float]] = None,
        tcp_pose: Optional[list[float]] = None,
        gripper_pressure_kpa: Optional[float] = None,
        robot_status: Optional[int] = None,
        edge_state: Optional[str] = None,
        camera_frame_id: Optional[str] = None,
        anomaly_flag: bool = False,
        vlm_correction: Optional[dict] = None,
    ) -> None:
        self.log(
            TelemetryRecord(
                cell_id=self.cell_id,
                joint_positions_rad=joint_positions_rad,
                joint_torques_nm=joint_torques_nm,
                tcp_pose=tcp_pose,
                gripper_pressure_kpa=gripper_pressure_kpa,
                robot_status=robot_status,
                edge_state=edge_state,
                camera_frame_id=camera_frame_id,
                anomaly_flag=anomaly_flag,
                vlm_correction=vlm_correction,
            )
        )

    # ------------------------------------------------------------------
    # File management
    # ------------------------------------------------------------------
    def _new_file_path(self) -> Path:
        self._file_seq += 1
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        return self.queue_dir / f"{self.cell_id}_{stamp}_{self._file_seq:05d}.jsonl"

    def _rotate_if_needed(self) -> Path:
        if self._current_path is None or self._current_bytes >= self.max_file_bytes:
            self._current_path = self._new_file_path()
            self._current_bytes = 0
            logger.info("Telemetry rotated to %s", self._current_path.name)
        return self._current_path

    # ------------------------------------------------------------------
    # Writer task
    # ------------------------------------------------------------------
    async def _writer(self) -> None:
        while not (self._stop.is_set() and self.queue.empty()):
            try:
                record = await asyncio.wait_for(self.queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            line = record.to_json_line() + "\n"
            data = line.encode("utf-8")
            path = self._rotate_if_needed()
            try:
                # Blocking write moved off the event loop.
                await asyncio.to_thread(self._append, path, data)
                self._current_bytes += len(data)
                self.records_written += 1
            except OSError:
                logger.exception("Telemetry write failed — record dropped")
                self.records_dropped += 1

    @staticmethod
    def _append(path: Path, data: bytes) -> None:
        with open(path, "ab") as fh:
            fh.write(data)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        self.queue_dir.mkdir(parents=True, exist_ok=True)
        self._stop.clear()
        self._writer_task = asyncio.create_task(self._writer(), name="telemetry-writer")
        logger.info("Telemetry logger started -> %s", self.queue_dir)

    async def stop(self) -> None:
        """Flush the queue and stop. Waits for the writer to drain."""
        self._stop.set()
        if self._writer_task is not None:
            await self._writer_task
            self._writer_task = None
        logger.info(
            "Telemetry logger stopped (written=%d dropped=%d)",
            self.records_written,
            self.records_dropped,
        )


async def _demo() -> None:
    logging.basicConfig(level=logging.INFO)
    dl = DataLogger(cell_id="cell-demo", queue_dir=Path("./telemetry_queue"))
    await dl.start()
    for i in range(100):
        dl.log_sample(
            joint_positions_rad=[0.1 * i, -0.2, 1.57, 0.0, 1.2, 0.0],
            joint_torques_nm=[12.5, 44.1, 30.2, 4.4, 3.1, 1.0],
            tcp_pose=[400.0 + i, 200.0, 150.0, 0.0, 0.0, 0.0],
            gripper_pressure_kpa=62.5,
            robot_status=1,
            edge_state="MOVING",
            anomaly_flag=(i % 25 == 0),
        )
        await asyncio.sleep(0.005)
    await dl.stop()


if __name__ == "__main__":
    asyncio.run(_demo())
