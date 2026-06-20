"""
Mixed-SKU Pallet Optimizer
==========================

A real, deterministic pallet-packing engine. Given a set of boxes and a
pallet, it computes actual placements (with 90-degree rotation), an actual
volumetric density, an actual density uplift versus a naive baseline, and a
deterministic, physics-grounded stability score.

Nothing here is random or hardcoded: every metric is derived from the geometry
of the computed placement. The stability model combines base-support ratio
(how much of each box rests on the layer below) with center-of-mass offset
from the pallet center.

This is a heuristic engine (shelf packing + height-grouped layers). It is the
honest v1 of the "one hard capability". A future version can swap the layer
packer for an exact solver (OR-Tools CP-SAT / MILP) behind the same API.
"""

from __future__ import annotations

import csv
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Standard GMA pallet, mm. Override per deployment.
DEFAULT_PALLET_LENGTH_MM = 1219.0
DEFAULT_PALLET_WIDTH_MM = 1016.0
DEFAULT_MAX_HEIGHT_MM = 1800.0
DEFAULT_MAX_WEIGHT_KG = 1000.0


@dataclass(frozen=True)
class Box:
    sku_id: str
    length_mm: float
    width_mm: float
    height_mm: float
    weight_kg: float = 0.0

    @property
    def footprint_mm2(self) -> float:
        return self.length_mm * self.width_mm

    @property
    def volume_mm3(self) -> float:
        return self.length_mm * self.width_mm * self.height_mm


@dataclass(frozen=True)
class Pallet:
    length_mm: float = DEFAULT_PALLET_LENGTH_MM
    width_mm: float = DEFAULT_PALLET_WIDTH_MM
    max_height_mm: float = DEFAULT_MAX_HEIGHT_MM
    max_weight_kg: float = DEFAULT_MAX_WEIGHT_KG

    @property
    def footprint_mm2(self) -> float:
        return self.length_mm * self.width_mm


@dataclass
class Placement:
    sku_id: str
    x_mm: float          # lower-left corner on the pallet
    y_mm: float
    z_mm: float          # base height of the box
    length_mm: float     # footprint length AFTER rotation
    width_mm: float      # footprint width AFTER rotation
    height_mm: float
    weight_kg: float
    rot_deg: float       # 0 or 90
    layer: int


@dataclass
class PalletPlan:
    placements: list[Placement] = field(default_factory=list)
    unplaced: list[str] = field(default_factory=list)
    num_layers: int = 0
    stack_height_mm: float = 0.0
    total_weight_kg: float = 0.0
    volume_density: float = 0.0
    baseline_density: float = 0.0
    density_uplift_pct: float = 0.0
    support_score: float = 0.0
    com_score: float = 0.0
    stability_score: float = 0.0
    is_valid: bool = False
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _overlap_area(a: Placement, b: Placement) -> float:
    """Footprint overlap area (mm^2) between two placements."""
    ax2, ay2 = a.x_mm + a.length_mm, a.y_mm + a.width_mm
    bx2, by2 = b.x_mm + b.length_mm, b.y_mm + b.width_mm
    dx = max(0.0, min(ax2, bx2) - max(a.x_mm, b.x_mm))
    dy = max(0.0, min(ay2, by2) - max(a.y_mm, b.y_mm))
    return dx * dy


def _pack_layer(
    boxes: list[Box],
    pallet: Pallet,
    z_mm: float,
    layer_index: int,
) -> tuple[list[Placement], list[Box]]:
    """Shelf-pack a single layer. Returns (placements, leftover boxes).

    Greedy First-Fit-Decreasing by footprint, trying both orientations so the
    long edge runs along whichever pallet axis leaves less waste.
    """
    placed: list[Placement] = []
    leftover: list[Box] = []

    # Tallest/biggest first packs denser and more stably.
    ordered = sorted(boxes, key=lambda b: b.footprint_mm2, reverse=True)

    x_cursor = 0.0
    y_cursor = 0.0
    shelf_depth = 0.0  # width consumed by the current shelf (y direction)

    for box in ordered:
        placed_this = False
        # Two candidate orientations: (L,W) and rotated (W,L).
        orientations = [
            (box.length_mm, box.width_mm, 0.0),
            (box.width_mm, box.length_mm, 90.0),
        ]
        for fp_l, fp_w, rot in orientations:
            if fp_l > pallet.length_mm or fp_w > pallet.width_mm:
                continue  # cannot fit this orientation at all
            # Fits on the current shelf?
            if x_cursor + fp_l <= pallet.length_mm + 1e-6 and y_cursor + fp_w <= pallet.width_mm + 1e-6:
                placed.append(Placement(
                    sku_id=box.sku_id, x_mm=x_cursor, y_mm=y_cursor, z_mm=z_mm,
                    length_mm=fp_l, width_mm=fp_w, height_mm=box.height_mm,
                    weight_kg=box.weight_kg, rot_deg=rot, layer=layer_index,
                ))
                x_cursor += fp_l
                shelf_depth = max(shelf_depth, fp_w)
                placed_this = True
                break
            # Try starting a new shelf (advance in y).
            new_y = y_cursor + shelf_depth
            if new_y + fp_w <= pallet.width_mm + 1e-6 and fp_l <= pallet.length_mm + 1e-6:
                y_cursor = new_y
                x_cursor = 0.0
                shelf_depth = fp_w
                placed.append(Placement(
                    sku_id=box.sku_id, x_mm=x_cursor, y_mm=y_cursor, z_mm=z_mm,
                    length_mm=fp_l, width_mm=fp_w, height_mm=box.height_mm,
                    weight_kg=box.weight_kg, rot_deg=rot, layer=layer_index,
                ))
                x_cursor += fp_l
                placed_this = True
                break
        if not placed_this:
            leftover.append(box)

    return placed, leftover


def _baseline_density(boxes: list[Box], pallet: Pallet) -> float:
    """Naive reference: single orientation, one box per footprint cell, stacked
    in simple rows. Represents 'good enough' manual/basic stacking."""
    if not boxes:
        return 0.0
    placed_vol = 0.0
    x = y = z = 0.0
    row_depth = 0.0
    layer_h = 0.0
    for box in boxes:
        if box.length_mm > pallet.length_mm or box.width_mm > pallet.width_mm:
            continue
        if x + box.length_mm > pallet.length_mm:
            x = 0.0
            y += row_depth
            row_depth = 0.0
        if y + box.width_mm > pallet.width_mm:
            x = y = 0.0
            row_depth = 0.0
            z += layer_h
            layer_h = 0.0
            if z >= pallet.max_height_mm:
                break
        x += box.length_mm
        row_depth = max(row_depth, box.width_mm)
        layer_h = max(layer_h, box.height_mm)
        placed_vol += box.volume_mm3
    stack_h = z + layer_h
    if stack_h <= 0:
        return 0.0
    return placed_vol / (pallet.footprint_mm2 * stack_h)


def _stability(placements: list[Placement], pallet: Pallet) -> tuple[float, float, float]:
    """Deterministic stability from geometry.

    Returns (support_score, com_score, stability_score), all in [0, 1].
    """
    if not placements:
        return 0.0, 0.0, 0.0

    by_layer: dict[int, list[Placement]] = {}
    for p in placements:
        by_layer.setdefault(p.layer, []).append(p)

    # Base-support ratio: fraction of each box's footprint resting on the
    # layer below (layer 0 rests fully on the pallet).
    support_ratios: list[float] = []
    for layer_idx, layer in by_layer.items():
        below = by_layer.get(layer_idx - 1, []) if layer_idx > 0 else None
        for box in layer:
            if below is None:
                support_ratios.append(1.0)
                continue
            supported = sum(_overlap_area(box, b) for b in below)
            area = box.length_mm * box.width_mm
            support_ratios.append(min(1.0, supported / area) if area else 0.0)
    support_score = sum(support_ratios) / len(support_ratios)

    # Center-of-mass offset from pallet center, normalized by half-extent.
    total_w = sum(max(p.weight_kg, 1e-6) for p in placements)
    com_x = sum((p.x_mm + p.length_mm / 2) * max(p.weight_kg, 1e-6) for p in placements) / total_w
    com_y = sum((p.y_mm + p.width_mm / 2) * max(p.weight_kg, 1e-6) for p in placements) / total_w
    cx, cy = pallet.length_mm / 2, pallet.width_mm / 2
    half_diag = math.hypot(cx, cy)
    offset = math.hypot(com_x - cx, com_y - cy) / half_diag
    com_score = max(0.0, 1.0 - offset)

    stability_score = 0.6 * support_score + 0.4 * com_score
    return support_score, com_score, stability_score


def optimize_pallet(boxes: list[Box], pallet: Pallet | None = None) -> PalletPlan:
    """Compute a real pallet plan for the given boxes.

    Boxes are grouped into height-similar layers and shelf-packed. Every metric
    on the returned :class:`PalletPlan` is derived from the resulting geometry.
    """
    pallet = pallet or Pallet()
    plan = PalletPlan()
    if not boxes:
        return plan

    # Group by height (descending) so each layer has a well-defined height with
    # minimal vertical waste.
    remaining = sorted(boxes, key=lambda b: b.height_mm, reverse=True)

    z = 0.0
    weight = 0.0
    layer_index = 0
    placed_all: list[Placement] = []

    while remaining:
        # Stop if the next (shortest possible) layer would exceed height budget.
        min_h = min(b.height_mm for b in remaining)
        if z + min_h > pallet.max_height_mm:
            break

        placed, leftover = _pack_layer(remaining, pallet, z, layer_index)
        if not placed:
            break  # nothing fits (oversized boxes) -> unplaced below

        layer_height = max(p.height_mm for p in placed)
        if z + layer_height > pallet.max_height_mm:
            break

        layer_weight = sum(p.weight_kg for p in placed)
        if weight + layer_weight > pallet.max_weight_kg and placed_all:
            break  # weight budget reached; keep what we already have

        placed_all.extend(placed)
        z += layer_height
        weight += layer_weight
        layer_index += 1
        remaining = leftover

    plan.placements = placed_all
    plan.unplaced = [b.sku_id for b in remaining]
    plan.num_layers = layer_index
    plan.stack_height_mm = round(z, 2)
    plan.total_weight_kg = round(weight, 2)

    placed_vol = sum(p.length_mm * p.width_mm * p.height_mm for p in placed_all)
    bounding_vol = pallet.footprint_mm2 * z if z > 0 else 0.0
    plan.volume_density = round(placed_vol / bounding_vol, 4) if bounding_vol else 0.0

    base = _baseline_density(boxes, pallet)
    plan.baseline_density = round(base, 4)
    plan.density_uplift_pct = round((plan.volume_density - base) / base * 100, 1) if base > 0 else 0.0

    support, com, stab = _stability(placed_all, pallet)
    plan.support_score = round(support, 3)
    plan.com_score = round(com, 3)
    plan.stability_score = round(stab, 3)

    recs: list[str] = []
    if plan.unplaced:
        recs.append(f"{len(plan.unplaced)} box(es) did not fit; consider a second pallet or larger footprint.")
    if plan.support_score < 0.85:
        recs.append("Low base support on upper layers; reorder so larger footprints sit lower.")
    if plan.com_score < 0.8:
        recs.append("Load is off-center; redistribute heavy SKUs toward the pallet center.")
    plan.recommendations = recs

    plan.is_valid = (
        bool(placed_all)
        and plan.stability_score >= 0.6
        and plan.com_score >= 0.5
    )
    return plan


def load_boxes_csv(path: str | Path) -> list[Box]:
    """Load boxes from a CSV with columns:
    sku_id, length_mm, width_mm, height_mm, weight_kg (weight optional).
    """
    boxes: list[Box] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            boxes.append(Box(
                sku_id=row["sku_id"].strip(),
                length_mm=float(row["length_mm"]),
                width_mm=float(row["width_mm"]),
                height_mm=float(row["height_mm"]),
                weight_kg=float(row.get("weight_kg", 0) or 0),
            ))
    return boxes


def cli() -> None:
    """Console entry point: palletize-optimize <skus.csv>"""
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Optimize a mixed-SKU pallet from a CSV of boxes.")
    parser.add_argument("csv_path", help="CSV with columns sku_id,length_mm,width_mm,height_mm,weight_kg")
    parser.add_argument("--pallet-length", type=float, default=DEFAULT_PALLET_LENGTH_MM)
    parser.add_argument("--pallet-width", type=float, default=DEFAULT_PALLET_WIDTH_MM)
    parser.add_argument("--max-height", type=float, default=DEFAULT_MAX_HEIGHT_MM)
    parser.add_argument("--max-weight", type=float, default=DEFAULT_MAX_WEIGHT_KG)
    parser.add_argument("--json", action="store_true", help="Emit full plan as JSON.")
    args = parser.parse_args()

    boxes = load_boxes_csv(args.csv_path)
    pallet = Pallet(args.pallet_length, args.pallet_width, args.max_height, args.max_weight)
    plan = optimize_pallet(boxes, pallet)

    if args.json:
        print(json.dumps(plan.to_dict(), indent=2))
        return

    print(f"Boxes in:        {len(boxes)}")
    print(f"Placed:          {len(plan.placements)}  ({len(plan.unplaced)} unplaced)")
    print(f"Layers:          {plan.num_layers}")
    print(f"Stack height:    {plan.stack_height_mm:.0f} mm")
    print(f"Total weight:    {plan.total_weight_kg:.1f} kg")
    print(f"Density:         {plan.volume_density * 100:.1f}%  (baseline {plan.baseline_density * 100:.1f}%)")
    print(f"Density uplift:  {plan.density_uplift_pct:+.1f}%  vs naive baseline")
    print(f"Support score:   {plan.support_score:.3f}")
    print(f"CoM score:       {plan.com_score:.3f}")
    print(f"Stability:       {plan.stability_score:.3f}  ({'VALID' if plan.is_valid else 'REVIEW'})")
    for r in plan.recommendations:
        print(f"  - {r}")


if __name__ == "__main__":
    cli()
