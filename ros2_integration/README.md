# ROS 2 + LiDAR Integration for Palletizer OS (Construction)

This package provides **production-ready examples** of perfect software-hardware alignment
for robotic palletizing in construction materials supply chain.

## Quick Start (ROS 2 Jazzy/Humble on Ubuntu 24.04/22.04)

```bash
# 1. Install ROS 2 (official instructions)
sudo apt install ros-jazzy-desktop-full  # or humble

# 2. Create overlay workspace (recommended)
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src
git clone https://github.com/iceccarelli/palletizer.git  # or your fork with this integration applied
cd ~/ros2_ws
colcon build --packages-select ros2_integration  # or python setup if pure Python node

# 3. Source
source /opt/ros/jazzy/setup.bash
source install/setup.bash

# 4. Run the node (with mock hardware first)
ros2 run ros2_integration palletizer_construction_node --ros-args -p robot_type:=kuka -p use_lidar:=false

# 5. In another terminal, trigger a construction plan
ros2 topic pub /palletizer/command std_msgs/String "data: '{\"action\":\"optimize_and_execute\",\"skus\":[{\"sku_id\":\"DRY-4x8-HALF\"}],\"quantities\":[24]}'" --once
```

The node will publish optimized plans to `/palletizer/plan_json` and drive the robot via the bridge.

## LiDAR Setup Recommendations for Construction

- **Primary**: Ouster OS1-64 or Hesai Pandar64 (dust penetrating, long range for yard mapping)
- **Budget / Mobile**: Velodyne VLP-16 + Intel RealSense D435i depth for close-range pallet detail
- **2D Safety**: SICK or Hokuyo for light curtain + floor monitoring around cell

Point cloud → `LidarPalletPerception` → real-time pose + shift detection → adaptive re-plan or safety pause.

## Hardware Integration Notes (Construction Specific)

- **Heavy Payload Arms**: KUKA KR 120-210 R3200, FANUC M-710iC/50, ABB IRB 760 — perfect for  drywall stacks (up to 1.2t/pallet) and lumber.
- **Grippers**: Large custom vacuum (multiple zones for 4x8 sheets), mechanical bag clamps, lumber bundle forks. All supported via existing Gripper abstraction + pressure/force feedback.
- **Mobile Hybrid**: Mount arm on OTTO 1500 or MiR 1350 AMR + ROS 2 nav2. Use palletizer planning for "go to staging area, build pallet, deliver to trade zone".
- **Safety**: written with ISO 10218 / TS 15066 collaborative-safety concepts in mind, using LiDAR + force-torque for human detection. This is reference code, not a certified safety system — any real deployment needs its own safety assessment.

## What this gives you

The idea is to avoid rebuilding perception + planning for every cell:
- The same optimizer that runs the website demos can drive the ROS 2 node.
- LiDAR-based perception tends to tolerate dust and uneven floors better than pure vision.
- One codebase spans browser simulation → edge orchestrator → ROS 2 cell.

No ROI or payback figures are claimed here — there are no deployments yet to measure.

## Roadmap (not available today)

- Connectors hardened and tested for specific KUKA/FANUC controller versions.
- Digital-twin sync (Gazebo / Isaac Sim) with LiDAR in the loop.
- Fleet orchestration across multiple cells + mobile units via the existing gateway.

Contributions and pilot partners welcome.
