"""
ROS 2 + LiDAR integration for Palletizer OS — construction vertical.

Reference layer that wraps the deterministic core (PalletiserOrchestrator +
ConstructionPalletOptimizer) in a ROS 2 node, with a LiDAR perception module and
vendor-neutral hardware-bridge examples (KUKA, FANUC, mobile bases via nav2).

STATUS: reference / example code. It requires a ROS 2 environment (rclpy and
sensor drivers) to actually run, and has not been validated on a physical cell.

Importing this package does NOT require ROS 2. The rclpy-dependent classes are
loaded lazily on attribute access, so `import ros2_integration` works anywhere;
accessing e.g. `ros2_integration.PalletizerROS2Node` will raise a clear error if
rclpy is not installed.
"""

from importlib import import_module

_LAZY = {
    "PalletizerROS2Node": ".palletizer_ros2_node",
    "LidarPalletPerception": ".lidar_perception",
    "KUKAConstructionBridge": ".hardware_bridge",
    "FANUCConstructionBridge": ".hardware_bridge",
}

__all__ = list(_LAZY)


def __getattr__(name):  # PEP 562 lazy attribute loading
    module_path = _LAZY.get(name)
    if module_path is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    try:
        module = import_module(module_path, __name__)
    except ImportError as exc:  # typically missing rclpy outside a ROS 2 env
        raise ImportError(
            f"{name} requires a ROS 2 environment (rclpy and sensor drivers). "
            f"See ros2_integration/README.md. Original error: {exc}"
        ) from exc
    return getattr(module, name)
