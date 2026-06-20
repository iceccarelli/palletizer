# Palletizer Full Stack — Open-Source Industrial Palletising Software
# https://github.com/iceccarelli/palletizer

"""
Palletizer Full Stack
=====================

A modular software stack for high-throughput end-of-line palletising cells:
control logic, perception pipeline, task planning, power management, and a
real mixed-SKU pallet optimizer.

The optimizer is the core capability and is dependency-free:

    from palletizer_full import optimize_pallet, Box
    plan = optimize_pallet([Box("A", 400, 300, 250, 8.5), ...])
    print(plan.volume_density, plan.stability_score)
"""

from .optimizer import (
    Box,
    Pallet,
    Placement,
    PalletPlan,
    optimize_pallet,
    load_boxes_csv,
)

__version__ = "0.2.0"
__all__ = [
    "__version__",
    "Box",
    "Pallet",
    "Placement",
    "PalletPlan",
    "optimize_pallet",
    "load_boxes_csv",
]
