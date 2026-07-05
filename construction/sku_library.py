"""
SKU Library for Construction Materials Palletizing

Pre-loaded realistic SKUs for drywall, lumber, bagged goods, flooring, paint.
Used by ConstructionPalletOptimizer and website interactive demos.

Easy to extend with real customer master data (CSV/JSON import ready).
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .pallet_optimizer import ConstructionSKU


def get_construction_sku_library() -> "dict[str, ConstructionSKU]":
    """Return a dict of common construction SKUs ready for optimization."""
    from .pallet_optimizer import ConstructionSKU
    return {
        "DRY-4x8-HALF": ConstructionSKU(
            sku_id="DRY-4x8-HALF",
            name="Drywall Sheet 4x8 ft 1/2\"",
            length_mm=1219.0,
            width_mm=2438.0,
            height_mm=12.7,
            weight_kg=22.5,
            material_type="sheet",
            fragility=0.65,
            moisture_sensitive=True,
            preferred_orientation="flat",
            interlock_score=0.88,
        ),
        "DRY-4x8-THREEQ": ConstructionSKU(
            sku_id="DRY-4x8-THREEQ",
            name="Drywall Sheet 4x8 ft 5/8\"",
            length_mm=1219.0,
            width_mm=2438.0,
            height_mm=15.9,
            weight_kg=28.0,
            material_type="sheet",
            fragility=0.55,
            moisture_sensitive=True,
            preferred_orientation="flat",
            interlock_score=0.85,
        ),
        "PLY-4x8-3/4": ConstructionSKU(
            sku_id="PLY-4x8-3/4",
            name="Plywood 4x8 ft 3/4\"",
            length_mm=1219.0,
            width_mm=2438.0,
            height_mm=19.0,
            weight_kg=32.0,
            material_type="sheet",
            fragility=0.25,
            preferred_orientation="flat",
            interlock_score=0.92,
        ),
        "LUM-2x4-8FT-BDL": ConstructionSKU(
            sku_id="LUM-2x4-8FT-BDL",
            name="2x4x8ft Lumber Bundle (12 pcs)",
            length_mm=2438.0,
            width_mm=305.0,
            height_mm=203.0,
            weight_kg=52.0,
            material_type="lumber_bundle",
            fragility=0.15,
            preferred_orientation="any",
            interlock_score=0.70,
        ),
        "LUM-2x6-10FT-BDL": ConstructionSKU(
            sku_id="LUM-2x6-10FT-BDL",
            name="2x6x10ft Lumber Bundle (8 pcs)",
            length_mm=3048.0,
            width_mm=305.0,
            height_mm=254.0,
            weight_kg=68.0,
            material_type="lumber_bundle",
            fragility=0.12,
            preferred_orientation="any",
            interlock_score=0.68,
        ),
        "BAG-CEM-80LB": ConstructionSKU(
            sku_id="BAG-CEM-80LB",
            name="80 lb Portland Cement Bag",
            length_mm=508.0,
            width_mm=356.0,
            height_mm=152.0,
            weight_kg=36.3,
            material_type="bagged",
            fragility=0.35,
            moisture_sensitive=True,
            preferred_orientation="any",
            interlock_score=0.78,
        ),
        "BAG-GRT-50LB": ConstructionSKU(
            sku_id="BAG-GRT-50LB",
            name="50 lb Tile Grout Bag",
            length_mm=457.0,
            width_mm=305.0,
            height_mm=127.0,
            weight_kg=22.7,
            material_type="bagged",
            fragility=0.40,
            moisture_sensitive=True,
            preferred_orientation="any",
            interlock_score=0.82,
        ),
        "PAINT-5GAL": ConstructionSKU(
            sku_id="PAINT-5GAL",
            name="5 Gallon Paint Bucket",
            length_mm=305.0,
            width_mm=305.0,
            height_mm=381.0,
            weight_kg=22.0,
            material_type="cylindrical",
            fragility=0.45,
            preferred_orientation="any",
            interlock_score=0.55,
        ),
        "FLOOR-12x12-CTN": ConstructionSKU(
            sku_id="FLOOR-12x12-CTN",
            name=" Luxury Vinyl Tile Carton (24 sq ft)",
            length_mm=610.0,
            width_mm=610.0,
            height_mm=76.0,
            weight_kg=18.5,
            material_type="case",
            fragility=0.50,
            preferred_orientation="flat",
            interlock_score=0.75,
        ),
    }


def load_skus_from_csv(csv_path: str) -> "list[ConstructionSKU]":
    """Future: Import real customer SKU master (CSV with columns matching dataclass)."""
    # Placeholder — implement with pandas or csv in production
    raise NotImplementedError("CSV import coming in v1.1 — use get_construction_sku_library() for now")
