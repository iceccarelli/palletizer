"""OPC UA mock of a physical palletising robot cell.

Spins up a local ``asyncua`` server on ``opc.tcp://0.0.0.0:4840`` exposing the
same address space a real cell PLC would publish. The edge orchestrator and
the VLM exception engine develop and test against this server with zero
hardware, then point at the real endpoint URL in production — the node paths
are identical.

Address space (Namespace 2, object ``PalletizerCell_1``):

    RobotStatus        Int32        0=Idle 1=Moving 2=Exception 3=Fault
    CurrentPose        Float[6]     x, y, z (mm), rx, ry, rz (rad)
    TargetPose         Float[6]     commanded pose, written by orchestrator
    SpatialCorrection  Float[3]     dx, dy, dz (mm), written by VLM engine
    GripperPressure    Float        kPa
    Heartbeat          Int32        increments every 500 ms
    ExecuteMove        Boolean      rising edge starts interpolation

Run standalone:

    python -m core.simulation.opcua_robot_mock
"""

from __future__ import annotations

import asyncio
import logging
import math
import os

from asyncua import Server, ua

logger = logging.getLogger("palletizer.mock_cell")

ENDPOINT = os.getenv("PALLETIZER_OPCUA_ENDPOINT", "opc.tcp://0.0.0.0:4840/palletizer/")
NAMESPACE_URI = "http://palletizer.dev/cell"
CELL_OBJECT_NAME = "PalletizerCell_1"

# Robot state codes shared with the orchestrator.
STATUS_IDLE = 0
STATUS_MOVING = 1
STATUS_EXCEPTION = 2
STATUS_FAULT = 3

HEARTBEAT_INTERVAL_S = 0.5
SIM_TICK_S = 0.02  # 50 Hz physics tick
MAX_LINEAR_SPEED_MM_S = 800.0  # conservative TCP speed for a payload move
MAX_ANGULAR_SPEED_RAD_S = 1.5
POSE_EPSILON_MM = 0.5
ANGLE_EPSILON_RAD = 0.005


class MockRobotCell:
    """Simulated cell: owns the OPC UA server and the motion model."""

    def __init__(self, endpoint: str = ENDPOINT) -> None:
        self.endpoint = endpoint
        self.server = Server()
        self.ns_idx: int = 0
        self.nodes: dict[str, ua.NodeId] = {}
        self._node_objs: dict[str, object] = {}
        self._heartbeat = 0
        self._running = False

    # ------------------------------------------------------------------
    # Address space construction
    # ------------------------------------------------------------------
    async def init(self) -> None:
        await self.server.init()
        self.server.set_endpoint(self.endpoint)
        self.server.set_server_name("Palletizer Mock Cell")
        self.server.set_security_policy([ua.SecurityPolicyType.NoSecurity])

        self.ns_idx = await self.server.register_namespace(NAMESPACE_URI)
        objects = self.server.nodes.objects
        cell = await objects.add_object(self.ns_idx, CELL_OBJECT_NAME)

        specs: list[tuple[str, object, ua.VariantType]] = [
            ("RobotStatus", STATUS_IDLE, ua.VariantType.Int32),
            ("CurrentPose", [0.0] * 6, ua.VariantType.Float),
            ("TargetPose", [0.0] * 6, ua.VariantType.Float),
            ("SpatialCorrection", [0.0] * 3, ua.VariantType.Float),
            ("GripperPressure", 0.0, ua.VariantType.Float),
            ("Heartbeat", 0, ua.VariantType.Int32),
            ("ExecuteMove", False, ua.VariantType.Boolean),
        ]
        for name, initial, vtype in specs:
            node = await cell.add_variable(
                self.ns_idx, name, ua.Variant(initial, vtype)
            )
            await node.set_writable()
            self._node_objs[name] = node
            self.nodes[name] = node.nodeid

        logger.info("Address space ready at ns=%d, object=%s", self.ns_idx, CELL_OBJECT_NAME)

    # ------------------------------------------------------------------
    # Node helpers
    # ------------------------------------------------------------------
    async def _read(self, name: str):
        return await self._node_objs[name].read_value()

    async def _write(self, name: str, value, vtype: ua.VariantType) -> None:
        await self._node_objs[name].write_value(ua.Variant(value, vtype))

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------
    async def _heartbeat_loop(self) -> None:
        while self._running:
            self._heartbeat = (self._heartbeat + 1) % 2_147_483_647
            await self._write("Heartbeat", self._heartbeat, ua.VariantType.Int32)
            await asyncio.sleep(HEARTBEAT_INTERVAL_S)

    async def _motion_loop(self) -> None:
        """50 Hz interpolation of CurrentPose toward TargetPose + SpatialCorrection."""
        while self._running:
            try:
                execute = bool(await self._read("ExecuteMove"))
                if not execute:
                    status = int(await self._read("RobotStatus"))
                    if status == STATUS_MOVING:
                        await self._write("RobotStatus", STATUS_IDLE, ua.VariantType.Int32)
                    await asyncio.sleep(SIM_TICK_S)
                    continue

                current = [float(v) for v in await self._read("CurrentPose")]
                target = [float(v) for v in await self._read("TargetPose")]
                corr = [float(v) for v in await self._read("SpatialCorrection")]
                goal = [
                    target[0] + corr[0],
                    target[1] + corr[1],
                    target[2] + corr[2],
                    target[3],
                    target[4],
                    target[5],
                ]

                lin_step = MAX_LINEAR_SPEED_MM_S * SIM_TICK_S
                ang_step = MAX_ANGULAR_SPEED_RAD_S * SIM_TICK_S

                # Translational axes move along the straight line to goal.
                dx = goal[0] - current[0]
                dy = goal[1] - current[1]
                dz = goal[2] - current[2]
                dist = math.sqrt(dx * dx + dy * dy + dz * dz)

                arrived_lin = dist <= POSE_EPSILON_MM
                if arrived_lin:
                    current[0], current[1], current[2] = goal[0], goal[1], goal[2]
                else:
                    scale = min(1.0, lin_step / dist)
                    current[0] += dx * scale
                    current[1] += dy * scale
                    current[2] += dz * scale

                # Rotational axes converge independently.
                arrived_ang = True
                for i in (3, 4, 5):
                    da = goal[i] - current[i]
                    if abs(da) <= ANGLE_EPSILON_RAD:
                        current[i] = goal[i]
                    else:
                        arrived_ang = False
                        current[i] += math.copysign(min(ang_step, abs(da)), da)

                await self._write("CurrentPose", current, ua.VariantType.Float)

                if arrived_lin and arrived_ang:
                    # Move complete: drop ExecuteMove, consume correction, go idle.
                    await self._write("ExecuteMove", False, ua.VariantType.Boolean)
                    await self._write(
                        "SpatialCorrection", [0.0, 0.0, 0.0], ua.VariantType.Float
                    )
                    await self._write("RobotStatus", STATUS_IDLE, ua.VariantType.Int32)
                    logger.info("Move complete at pose %s", [round(v, 2) for v in current])
                else:
                    await self._write("RobotStatus", STATUS_MOVING, ua.VariantType.Int32)
                    # Gripper pressure ramps while carrying.
                    await self._write("GripperPressure", 62.5, ua.VariantType.Float)
            except Exception:
                logger.exception("Motion loop tick failed")
                await self._write("RobotStatus", STATUS_FAULT, ua.VariantType.Int32)
            await asyncio.sleep(SIM_TICK_S)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def run(self) -> None:
        await self.init()
        self._running = True
        async with self.server:
            logger.info("Mock cell serving at %s", self.endpoint)
            await asyncio.gather(self._heartbeat_loop(), self._motion_loop())

    async def start_background(self) -> list[asyncio.Task]:
        """Start server + loops as tasks (used by tests and the demo runner)."""
        await self.init()
        self._running = True
        await self.server.start()
        return [
            asyncio.create_task(self._heartbeat_loop(), name="mock-heartbeat"),
            asyncio.create_task(self._motion_loop(), name="mock-motion"),
        ]

    async def stop(self) -> None:
        self._running = False
        await self.server.stop()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    try:
        asyncio.run(MockRobotCell().run())
    except KeyboardInterrupt:
        logger.info("Mock cell stopped")


if __name__ == "__main__":
    main()
