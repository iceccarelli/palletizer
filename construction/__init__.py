"""
Palletizer OS Construction Niche Module
Specialized palletizing intelligence for construction materials:
drywall sheets, lumber, flooring, bagged goods, paint, prefab components.

Perfect alignment with ROS 2 + LiDAR perception for real-world job sites,
prefab yards, and distribution centers handling heavy/variable loads.

Extends the Palletizer OS core with domain-specific constraints, optimizers,
and hardware integration examples.

STATUS: Early reference implementation. The optimizer is a greedy layered
heuristic intended for demonstration and as a foundation to build on. Stability,
density, and cycle-time figures it reports are illustrative and have NOT been
validated against physical cells or real transport testing. Do not present them
as measured performance.
"""

from .pallet_optimizer import ConstructionPalletOptimizer, ConstructionSKU, LayerPattern
from .constraints import ConstructionStabilityConstraints
from .sku_library import get_construction_sku_library

__version__ = "1.0.0-construction"
__all__ = [
    "ConstructionPalletOptimizer",
    "ConstructionSKU",
    "LayerPattern",
    "ConstructionStabilityConstraints",
    "get_construction_sku_library",
]
