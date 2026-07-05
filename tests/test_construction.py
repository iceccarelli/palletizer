"""Smoke + behavior tests for the construction vertical optimizer.

These verify the module imports cleanly (no circular imports), the SKU library is
well-formed, and the optimizer produces a self-consistent, JSON-exportable plan.
They deliberately do NOT assert specific stability/ROI numbers — those are
illustrative heuristics, not validated performance.
"""

import json

import pytest

from construction import (
    ConstructionPalletOptimizer,
    ConstructionSKU,
    get_construction_sku_library,
)


def test_import_surface_has_no_circular_import():
    # If the package had the original circular imports, this line would fail.
    from construction import constraints, pallet_optimizer, sku_library  # noqa: F401


def test_sku_library_is_wellformed():
    lib = get_construction_sku_library()
    assert len(lib) >= 5
    for sku_id, sku in lib.items():
        assert isinstance(sku, ConstructionSKU)
        assert sku.sku_id == sku_id
        assert sku.length_mm > 0 and sku.width_mm > 0 and sku.height_mm > 0
        assert sku.weight_kg > 0
        assert 0.0 <= sku.fragility <= 1.0
        assert 0.0 <= sku.interlock_score <= 1.0


def test_optimizer_produces_consistent_plan():
    lib = get_construction_sku_library()
    drywall = lib["DRY-4x8-HALF"]
    lumber = lib["LUM-2x4-8FT-BDL"]

    opt = ConstructionPalletOptimizer(pallet_length_mm=1200, pallet_width_mm=1000)
    plan = opt.optimize_for_skus([drywall, lumber], quantities=[20, 6], prioritize="stability")

    assert plan.layers, "expected at least one layer"
    # Every requested item is placed exactly once across the plan.
    placed = sum(len(layer.items) for layer in plan.layers)
    assert placed == 26
    # Scores stay in their declared [0, 1] ranges.
    assert 0.0 <= plan.overall_stability <= 1.0
    for layer in plan.layers:
        assert 0.0 <= layer.stability_score <= 1.0
        assert 0.0 <= layer.density_utilization <= 1.0
    assert plan.total_height_mm > 0
    assert plan.estimated_cycle_time_s > 0


def test_export_to_robot_json_is_valid_json():
    lib = get_construction_sku_library()
    opt = ConstructionPalletOptimizer()
    plan = opt.optimize_for_skus([lib["BAG-CEM-80LB"]], quantities=[12], prioritize="stability")
    payload = json.loads(opt.export_to_robot_json(plan))
    assert "palletizer_version" in payload


def test_ros2_integration_imports_without_ros():
    # Package must import even where rclpy is absent (lazy loading).
    import ros2_integration

    assert "PalletizerROS2Node" in ros2_integration.__all__
    # Accessing a ROS-dependent class without rclpy should raise a clear ImportError.
    with pytest.raises(ImportError):
        _ = ros2_integration.PalletizerROS2Node
