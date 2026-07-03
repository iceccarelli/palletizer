"""Universal Robots bridge: abstract poses in, native URScript out.

This is the hardware-agnostic layer's UR-specific tail. Upstream planning
works in millimetres and radians against an abstract 6-DOF pose; this module
compiles those poses into URScript (``movel``/``movej``) and streams the
compiled program to the controller's secondary client interface on TCP port
30002. UR controllers execute each complete script received on that port,
which is exactly the fire-and-forget contract a palletising dispatch needs.

Notes for the real cell:
- The secondary interface accepts programs but returns a binary state stream,
  not an ack protocol. Motion completion is confirmed out-of-band (RTDE or
  the OPC UA layer), never assumed here.
- All translational units are converted mm -> m and clamped before compile;
  a bad upstream pose must fail loudly in software, not on the arm.
"""

from __future__ import annotations

import logging
import math
import socket
import time
from dataclasses import dataclass
from typing import Iterable, Optional

logger = logging.getLogger("palletizer.ur")

UR_SECONDARY_PORT = 30002
DEFAULT_TIMEOUT_S = 5.0
SEND_RETRIES = 3
RETRY_BACKOFF_S = 0.5

# Physical envelope clamps (UR10e-class reach, conservative).
MAX_REACH_M = 1.30
MIN_Z_M = 0.0
MAX_Z_M = 1.30
MAX_JOINT_RAD = 2.0 * math.pi

DEFAULT_ACCEL_MSS = 1.2
DEFAULT_SPEED_MS = 0.25
DEFAULT_JOINT_ACCEL = 1.4
DEFAULT_JOINT_SPEED = 1.05


class PoseValidationError(ValueError):
    """Raised when a pose falls outside the safe physical envelope."""


@dataclass(frozen=True)
class CartesianPose:
    """Abstract TCP pose. Translations in millimetres, rotation vector in
    radians — the internal convention across the palletizer stack."""

    x_mm: float
    y_mm: float
    z_mm: float
    rx: float
    ry: float
    rz: float

    def to_ur_meters(self) -> tuple[float, float, float, float, float, float]:
        x, y, z = self.x_mm / 1000.0, self.y_mm / 1000.0, self.z_mm / 1000.0
        reach = math.sqrt(x * x + y * y)
        if reach > MAX_REACH_M:
            raise PoseValidationError(
                f"XY reach {reach:.3f} m exceeds {MAX_REACH_M} m envelope"
            )
        if not (MIN_Z_M <= z <= MAX_Z_M):
            raise PoseValidationError(f"Z {z:.3f} m outside [{MIN_Z_M}, {MAX_Z_M}] m")
        for name, angle in (("rx", self.rx), ("ry", self.ry), ("rz", self.rz)):
            if abs(angle) > MAX_JOINT_RAD:
                raise PoseValidationError(f"{name}={angle:.3f} rad exceeds 2*pi")
        return (x, y, z, self.rx, self.ry, self.rz)


@dataclass(frozen=True)
class JointTarget:
    """Six joint angles in radians for movej dispatch."""

    q: tuple[float, float, float, float, float, float]

    def validated(self) -> tuple[float, ...]:
        if len(self.q) != 6:
            raise PoseValidationError(f"Expected 6 joints, got {len(self.q)}")
        for i, angle in enumerate(self.q):
            if abs(angle) > MAX_JOINT_RAD:
                raise PoseValidationError(f"Joint {i} = {angle:.3f} rad exceeds 2*pi")
        return self.q


# ---------------------------------------------------------------------------
# URScript compilation
# ---------------------------------------------------------------------------
def _fmt(value: float) -> str:
    return f"{value:.6f}"


def compile_movel(
    pose: CartesianPose,
    accel_mss: float = DEFAULT_ACCEL_MSS,
    speed_ms: float = DEFAULT_SPEED_MS,
    blend_radius_m: float = 0.0,
) -> str:
    x, y, z, rx, ry, rz = pose.to_ur_meters()
    return (
        f"movel(p[{_fmt(x)},{_fmt(y)},{_fmt(z)},{_fmt(rx)},{_fmt(ry)},{_fmt(rz)}],"
        f"a={_fmt(accel_mss)},v={_fmt(speed_ms)},r={_fmt(blend_radius_m)})"
    )


def compile_movej(
    target: JointTarget,
    accel: float = DEFAULT_JOINT_ACCEL,
    speed: float = DEFAULT_JOINT_SPEED,
) -> str:
    q = target.validated()
    joints = ",".join(_fmt(a) for a in q)
    return f"movej([{joints}],a={_fmt(accel)},v={_fmt(speed)})"


def compile_program(
    statements: Iterable[str], program_name: str = "palletizer_dispatch"
) -> str:
    """Wrap statements in a named URScript program block. The controller
    executes the block as one unit when it arrives on port 30002."""
    body = "\n".join(f"  {stmt}" for stmt in statements)
    return f"def {program_name}():\n{body}\nend\n"


def compile_placement_sequence(
    approach: CartesianPose,
    place: CartesianPose,
    retreat: CartesianPose,
    speed_ms: float = DEFAULT_SPEED_MS,
    gripper_release_output: int = 0,
) -> str:
    """Standard approach -> place -> release -> retreat palletising motion."""
    statements = [
        compile_movel(approach, speed_ms=speed_ms, blend_radius_m=0.02),
        compile_movel(place, speed_ms=speed_ms * 0.4),
        f"set_digital_out({int(gripper_release_output)}, False)",
        "sleep(0.15)",
        compile_movel(retreat, speed_ms=speed_ms),
    ]
    return compile_program(statements)


# ---------------------------------------------------------------------------
# Transport: secondary client interface (TCP 30002)
# ---------------------------------------------------------------------------
class URSecondaryClient:
    """Raw TCP client streaming compiled URScript to a UR controller."""

    def __init__(
        self,
        host: str,
        port: int = UR_SECONDARY_PORT,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.host = host
        self.port = port
        self.timeout_s = timeout_s
        self._sock: Optional[socket.socket] = None
        self.scripts_sent = 0

    def connect(self) -> None:
        self.close()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout_s)
        sock.connect((self.host, self.port))
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock = sock
        logger.info("Connected to UR controller %s:%d", self.host, self.port)

    def close(self) -> None:
        if self._sock is not None:
            try:
                self._sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self._sock.close()
            self._sock = None

    def send_script(self, script: str) -> None:
        """Stream a complete URScript program. Retries with reconnect on
        transient socket failures; raises after exhausting retries."""
        if not script.endswith("\n"):
            script += "\n"
        payload = script.encode("utf-8")

        last_error: Optional[Exception] = None
        for attempt in range(1, SEND_RETRIES + 1):
            try:
                if self._sock is None:
                    self.connect()
                assert self._sock is not None
                self._sock.sendall(payload)
                self.scripts_sent += 1
                logger.info(
                    "URScript sent (%d bytes, attempt %d)", len(payload), attempt
                )
                return
            except OSError as exc:
                last_error = exc
                logger.warning(
                    "Send attempt %d/%d failed: %s — reconnecting",
                    attempt,
                    SEND_RETRIES,
                    exc,
                )
                self.close()
                time.sleep(RETRY_BACKOFF_S * attempt)
        raise ConnectionError(
            f"Failed to stream URScript to {self.host}:{self.port} "
            f"after {SEND_RETRIES} attempts"
        ) from last_error

    def __enter__(self) -> "URSecondaryClient":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


# ---------------------------------------------------------------------------
# High-level bridge API
# ---------------------------------------------------------------------------
class URBridge:
    """Translate abstract placements into executed UR motions."""

    def __init__(self, host: str, port: int = UR_SECONDARY_PORT) -> None:
        self.client = URSecondaryClient(host=host, port=port)

    def dispatch_placement(
        self,
        place: CartesianPose,
        approach_clearance_mm: float = 120.0,
        speed_ms: float = DEFAULT_SPEED_MS,
    ) -> str:
        """Compile and stream a full placement motion. Returns the script
        that was sent (also logged upstream into the telemetry moat)."""
        approach = CartesianPose(
            place.x_mm, place.y_mm, place.z_mm + approach_clearance_mm,
            place.rx, place.ry, place.rz,
        )
        script = compile_placement_sequence(
            approach=approach, place=place, retreat=approach, speed_ms=speed_ms
        )
        self.client.send_script(script)
        return script

    def close(self) -> None:
        self.client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Offline compile check — prints the exact bytes a controller would run.
    demo_pose = CartesianPose(x_mm=420.0, y_mm=310.0, z_mm=150.0, rx=0.0, ry=3.1416, rz=0.0)
    print(
        compile_placement_sequence(
            approach=CartesianPose(420.0, 310.0, 270.0, 0.0, 3.1416, 0.0),
            place=demo_pose,
            retreat=CartesianPose(420.0, 310.0, 270.0, 0.0, 3.1416, 0.0),
        )
    )
