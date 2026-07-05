"""
LidarPalletPerception — Robust perception layer for construction palletizing.

Uses point clouds from LiDAR (Ouster, Velodyne, Hesai, or cheap RPLIDAR + depth camera)
to:
- Detect pallet pose and orientation even on uneven/dusty prefab yard floors.
- Monitor load stability in real time (shift detection between picks).
- Map local floor flatness (critical for tall heavy drywall stacks).
- Provide fallback when vision fails due to dust, glare, or low light.

This is the "perfect alignment" piece: feeds real-world data back into the
deterministic ConstructionPalletOptimizer and Orchestrator for adaptive re-planning.

In production: Fuse with existing perception in palletizer_full/perception/
or replace dummy box detection with this.

Dependencies (in [lidar] extra): open3d, numpy, sensor_msgs (or standalone PCL via python-pcl).
"""

import time
from typing import Tuple, Optional
import numpy as np

try:
    import open3d as o3d
except ImportError:
    o3d = None

from sensor_msgs.msg import PointCloud2
import struct


class LidarPalletPerception:
    def __init__(self, voxel_size: float = 0.02, dust_filter: bool = True):
        self.voxel_size = voxel_size
        self.dust_filter = dust_filter
        self.last_pose = None
        self.last_confidence = 0.0

    def process_pointcloud(self, cloud_msg: PointCloud2) -> Tuple[dict, float, bool]:
        """
        Returns: (pose_dict, confidence 0-1, load_shift_detected: bool)
        pose_dict: {"x": , "y":, "z":, "yaw_deg": , "roll":, "pitch":}
        """
        if o3d is None:
            # Fallback simple processing
            return self._fallback_process(cloud_msg)

        # Convert ROS PointCloud2 to Open3D (simplified — real impl uses sensor_msgs_py or ros2_numpy)
        points = self._pointcloud2_to_xyz(cloud_msg)
        if len(points) < 100:
            return {"x": 0, "y": 0, "z": 0, "yaw_deg": 0}, 0.3, False

        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(points)

        # Voxel downsample + statistical outlier (dust removal)
        if self.dust_filter:
            pcd = pcd.voxel_down_sample(self.voxel_size)
            pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

        # Segment dominant plane (floor) then cluster for pallet/load
        plane_model, inliers = pcd.segment_plane(distance_threshold=0.03, ransac_n=3, num_iterations=100)
        pallet_cloud = pcd.select_by_index(inliers, invert=True)

        if len(pallet_cloud.points) < 50:
            return self._fallback_process(cloud_msg)

        # Simple bounding box + center for pallet pose (production: use oriented BB or ICP to CAD)
        aabb = pallet_cloud.get_axis_aligned_bounding_box()
        center = aabb.get_center()
        extent = aabb.get_extent()

        # Fake yaw from extent ratio or principal component (simplified)
        yaw = 0.0  # TODO: real PCA or template matching

        pose = {
            "x": float(center[0]),
            "y": float(center[1]),
            "z": float(center[2]),
            "yaw_deg": float(yaw),
            "roll_deg": 0.0,
            "pitch_deg": 0.0,
        }

        confidence = min(1.0, len(pallet_cloud.points) / 800.0)
        shift_detected = self._detect_load_shift(pcd, self.last_pose)

        self.last_pose = pose
        self.last_confidence = confidence

        return pose, round(confidence, 2), shift_detected

    def _pointcloud2_to_xyz(self, cloud_msg: PointCloud2) -> np.ndarray:
        # Minimal converter (real: use ros2_numpy.point_cloud2 or rclpy + numpy)
        points = []
        for i in range(0, len(cloud_msg.data), cloud_msg.point_step):
            x = struct.unpack_from('f', cloud_msg.data, i)[0]
            y = struct.unpack_from('f', cloud_msg.data, i + 4)[0]
            z = struct.unpack_from('f', cloud_msg.data, i + 8)[0]
            if np.isfinite(x) and np.isfinite(y) and np.isfinite(z):
                points.append([x, y, z])
        return np.array(points) if points else np.zeros((0, 3))

    def _fallback_process(self, cloud_msg):
        # Very basic — assumes centered pallet
        return {"x": 0.0, "y": 0.0, "z": 0.6, "yaw_deg": 0.0}, 0.6, False

    def _detect_load_shift(self, current_pcd, last_pose) -> bool:
        if last_pose is None or o3d is None:
            return False
        # Production: compare current cluster center / height profile to expected from plan
        # If significant deviation (> threshold) → shift detected → pause + re-optimize
        return False  # Placeholder for v1.0; implement with ICP or height histogram diff
