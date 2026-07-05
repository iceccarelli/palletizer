## [Unreleased] — Construction vertical + ROS 2 / LiDAR reference (additive)

### Added
- `construction/` optimizer, SKU library, and stability constraints for
  construction materials (drywall, lumber, bagged goods, flooring). Reference
  heuristic — reported stability/cycle figures are illustrative, not validated.
- `ros2_integration/` ROS 2 node, LiDAR perception, and vendor-neutral bridge
  examples. Package imports without ROS 2 installed (lazy loading).
- Website routes `/construction`, `/hardware`, `/integrations`, `/about`, plus a
  browser optimizer (`web/lib/construction-optimizer.ts`) and an "Industries"
  nav menu. New pages reuse the global Navbar/Footer.
- `construction` pip extra, `palletize-construction` console script, and
  `tests/test_construction.py` (5 tests).

### Fixed (in the incoming construction pack, before merge)
- Two circular imports that prevented `construction` from importing at all.
- Wrong browser-engine import path and duplicated page-level navigation.
- Removed fabricated metrics and unverifiable claims (e.g. "8–14 month payback",
  "60% injury reduction", "certified / production-proven", OEM-partner and
  ISO-certification implications). Copy is now honest pre-launch positioning.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-08

### Added

- Complete palletiser control stack with six modular packages (core, control, perception, planning, power, orchestrator).
- Hardware-agnostic `RobotInterface` abstraction for connecting any robot arm SDK.
- `GripperController` with retry logic and vacuum pressure feedback.
- `PatternManager` for defining and persisting pallet stacking layouts.
- `MissionPlanner` for order sequencing and task dispatch.
- `HazardManager` aggregating proximity, voltage, gas, radiation and fault signals.
- `FaultDetector` for registering, clearing and querying system faults.
- `BatteryManager` with state-of-charge tracking and low-battery alerts.
- `ThermalManager` with hysteresis-based cooling control.
- `MemoryManager` for deterministic buffer allocation.
- `ExecutionStack` for fixed-rate deterministic control loops.
- `CommunicationInterface` for telemetry publishing.
- Environment-variable-driven configuration via `Config` and `RobotConfig`.
- Comprehensive test suite with 40+ tests.
- Three working examples: basic palletising, custom gripper, monitoring telemetry.
- Docker and docker-compose support.
- GitHub Actions CI/CD with ruff linting and pytest.
- Enterprise and gateway directory placeholders for future extensions.
