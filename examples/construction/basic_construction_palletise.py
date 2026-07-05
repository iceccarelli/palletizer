#!/usr/bin/env python3
"""
Basic Construction Palletizing Example

Demonstrates the ConstructionPalletOptimizer on realistic drywall + lumber mix.
Run after integration: python examples/construction/basic_construction_palletise.py
"""

from construction import ConstructionPalletOptimizer, get_construction_sku_library


def main():
    print("Palletizer OS — Construction Materials Example")
    print("=" * 50)

    lib = get_construction_sku_library()
    drywall = lib["DRY-4x8-HALF"]
    lumber = lib["LUM-2x4-8FT-BDL"]

    opt = ConstructionPalletOptimizer(pallet_length_mm=1200, pallet_width_mm=1000)
    plan = opt.optimize_for_skus([drywall, lumber], quantities=[48, 10], prioritize="stability")

    print(f"\nOptimized {len(plan.layers)} layers")
    print(f"Overall Stability: {plan.overall_stability} (target ≥0.93)")
    print(f"Total Height: {plan.total_height_mm} mm")
    print(f"Volume Utilization: {plan.volume_utilization*100:.1f}%")
    print(f"Est. Cycle Time: {plan.estimated_cycle_time_s} s")
    print(f"\nNotes: {plan.construction_notes}")

    print("\n--- Robot Export (ROS 2 ready) ---")
    print(opt.export_to_robot_json(plan)[:800] + "...")

if __name__ == "__main__":
    main()
