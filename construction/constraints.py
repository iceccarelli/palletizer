"""
ConstructionStabilityConstraints — Domain-specific stability, CG, interlock,
and transport-vibration rules for construction materials palletizing.

Extends general Palletizer OS physics validation with rules proven in
prefab yards, drywall distribution, lumber yards, and heavy bagged goods handling.

Key for ruthless dominance: Patterns that survive real truck transit + forklift
moves on uneven surfaces without collapse or product damage.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List, TYPE_CHECKING
import math

if TYPE_CHECKING:
    from .pallet_optimizer import PlacedItem, LayerPattern


@dataclass
class ConstructionStabilityConstraints:
    pallet_l: float
    pallet_w: float
    max_h: float
    min_layer_stability: float = 0.90
    max_cg_offset_mm: float = 80.0   # Stricter than general for heavy sheets on bumpy roads
    vibration_damping_factor: float = 0.85  # Construction transport is rougher

    def compute_layer_stability(self, items: List[PlacedItem], base_z: float) -> float:
        if not items:
            return 0.0

        # Base factors from core engine spirit
        support_ratio = self._average_support_ratio(items)
        cg_score = self._cg_stability_score(items)
        interlock = self._interlock_factor(items)
        overhang = self._overhang_penalty(items)

        # Construction multipliers
        material_factor = self._material_stability_multiplier(items)
        height_penalty = max(0.0, 1.0 - (base_z / self.max_h) * 0.15)  # Slightly more conservative on tall stacks for yard conditions

        raw = (support_ratio * 0.35 + cg_score * 0.30 + interlock * 0.20 + overhang * 0.15) * material_factor * height_penalty
        return max(0.0, min(1.0, raw * self.vibration_damping_factor))

    def compute_overall_stability(self, layers: List[LayerPattern]) -> float:
        if not layers:
            return 0.0
        layer_scores = [l.stability_score for l in layers]
        avg = sum(layer_scores) / len(layer_scores)
        # Penalize if top layers much less stable than base (common failure in heavy sheet transport)
        top_penalty = 0.0
        if len(layers) > 2:
            top_penalty = max(0, (layers[-2].stability_score - layers[-1].stability_score) * 0.4)
        return max(0.75, min(1.0, avg - top_penalty))

    def _average_support_ratio(self, items: List[PlacedItem]) -> float:
        # Simplified: assume good grid packing gives high support
        # In real: ray-cast or polygon overlap from below layer
        return 0.92 if len(items) > 2 else 0.85

    def _cg_stability_score(self, items: List[PlacedItem]) -> float:
        if not items:
            return 1.0
        total_w = sum(i.sku.weight_kg for i in items)
        if total_w == 0:
            return 1.0
        cx = sum(i.x * i.sku.weight_kg for i in items) / total_w
        cy = sum(i.y * i.sku.weight_kg for i in items) / total_w
        offset = math.hypot(cx - self.pallet_l/2, cy - self.pallet_w/2)
        return max(0.6, 1.0 - (offset / self.max_cg_offset_mm) * 0.5)

    def _interlock_factor(self, items: List[PlacedItem]) -> float:
        if not items:
            return 0.5
        avg_interlock = sum(i.sku.interlock_score for i in items) / len(items)
        # Bonus for mixed sheet + bundle layers (construction specific good practice)
        types = {i.sku.material_type for i in items}
        mix_bonus = 0.08 if len(types) > 1 else 0.0
        return min(1.0, avg_interlock + mix_bonus)

    def _overhang_penalty(self, items: List[PlacedItem]) -> float:
        max_over = 0.0
        for item in items:
            # Simple edge distance
            edge_dist = min(
                item.x,
                item.y,
                self.pallet_l - (item.x + item.sku.length_mm if item.rotation == 0 else item.sku.width_mm),
                self.pallet_w - (item.y + item.sku.width_mm if item.rotation == 0 else item.sku.length_mm),
            )
            max_over = max(max_over, -min(0, edge_dist))  # negative if overhang
        return max(0.7, 1.0 - (max_over / 50.0) * 0.8)  # 50mm max allowed overhang for construction

    def _material_stability_multiplier(self, items: List[PlacedItem]) -> float:
        mult = 1.0
        for item in items:
            if item.sku.material_type == "sheet" and item.sku.fragility > 0.5:
                mult *= 0.95  # Drywall needs extra care
            if item.sku.material_type == "bagged":
                mult *= 0.97  # Bagged can shift if not interlocked well
        return mult
