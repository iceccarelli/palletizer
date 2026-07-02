"""Minimal FastAPI bridge exposing the real Python optimizer to the web demos.

The Next.js API routes (web/app/api/*) proxy here when PALLETIZER_BACKEND_URL
is set, making the Python core the authoritative engine end-to-end. Without
this service, the routes fall back to the TypeScript port of the same
algorithm, so results are identical either way.

Run:
    pip install fastapi uvicorn
    uvicorn gateway.demo_api:app --port 8100

Then in web/.env.local:
    PALLETIZER_BACKEND_URL=http://localhost:8100
"""

from __future__ import annotations

import math
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from palletizer_full.optimizer import (
    DEFAULT_MAX_HEIGHT_MM,
    DEFAULT_MAX_WEIGHT_KG,
    DEFAULT_PALLET_LENGTH_MM,
    DEFAULT_PALLET_WIDTH_MM,
    Box,
    Pallet,
    Placement,
    _baseline_density,
    _overlap_area,
    _pack_layer,
    _stability,
    optimize_pallet,
)

app = FastAPI(title="Palletizer Demo API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo bridge; restrict in production deployments
    allow_methods=["POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Schemas (mirror web/lib/palletizer/types.ts)
# ---------------------------------------------------------------------------


class SkuIn(BaseModel):
    sku_id: str
    length_mm: float
    width_mm: float
    height_mm: float
    weight_kg: float = 0.0
    fragility: float | None = None


class PalletIn(BaseModel):
    length_mm: float = DEFAULT_PALLET_LENGTH_MM
    width_mm: float = DEFAULT_PALLET_WIDTH_MM
    max_height_mm: float = DEFAULT_MAX_HEIGHT_MM
    max_weight_kg: float = DEFAULT_MAX_WEIGHT_KG


class ConstraintsIn(BaseModel):
    max_height_mm: float | None = None
    max_weight_kg: float | None = None
    heavy_low: bool = False
    fragile_high: bool = False
    fragile_threshold: float = 0.6
    protect_sku_ids: list[str] = Field(default_factory=list)
    speed_mode: bool = False


class OptimizeIn(BaseModel):
    skus: list[SkuIn]
    constraints: ConstraintsIn = Field(default_factory=ConstraintsIn)
    pallet: PalletIn = Field(default_factory=PalletIn)


class PlacementIn(BaseModel):
    sku_id: str
    x_mm: float
    y_mm: float
    z_mm: float
    length_mm: float
    width_mm: float
    height_mm: float
    weight_kg: float = 0.0
    rot_deg: float = 0.0
    layer: int = 0
    fragility: float | None = None


class ValidateIn(BaseModel):
    placements: list[PlacementIn]
    pallet: PalletIn = Field(default_factory=PalletIn)


CYCLE_BASE_S = 7.5
CYCLE_ROT_S = 1.8


def _is_fragile(sku: SkuIn, c: ConstraintsIn) -> bool:
    if sku.sku_id in c.protect_sku_ids:
        return True
    return (sku.fragility or 0.0) >= c.fragile_threshold


def _optimize_with_constraints(skus: list[SkuIn], c: ConstraintsIn, pallet: Pallet):
    """Constraint-aware packing mirroring the TS extensions exactly:
    deterministic re-ordering of the same shelf packer in optimizer.py."""
    boxes = [Box(s.sku_id, s.length_mm, s.width_mm, s.height_mm, s.weight_kg) for s in skus]
    frag_map = {s.sku_id: (s.fragility or 0.0) for s in skus}

    if not (c.heavy_low or c.fragile_high or c.speed_mode):
        return optimize_pallet(boxes, pallet), frag_map

    def order_key(b: Box):
        return (b.weight_kg, b.height_mm) if c.heavy_low else (b.height_mm, 0.0)

    fragile_pool: list[Box] = []
    if c.fragile_high:
        fragile_ids = {s.sku_id for s in skus if _is_fragile(s, c)}
        fragile_pool = sorted([b for b in boxes if b.sku_id in fragile_ids], key=order_key, reverse=True)
        remaining = sorted([b for b in boxes if b.sku_id not in fragile_ids], key=order_key, reverse=True)
    else:
        remaining = sorted(boxes, key=order_key, reverse=True)

    from palletizer_full.optimizer import PalletPlan

    plan = PalletPlan()
    z = 0.0
    weight = 0.0
    layer_index = 0
    placed_all: list[Placement] = []

    while remaining or fragile_pool:
        if not remaining and fragile_pool:
            remaining, fragile_pool = fragile_pool, []
        if not remaining:
            break
        min_h = min(b.height_mm for b in remaining)
        if z + min_h > pallet.max_height_mm:
            break

        if c.speed_mode:
            # single orientation: temporarily square the orientation choice by
            # packing with a wrapper that filters rotation — reuse _pack_layer
            # then drop rotated placements' rotation? Simpler: emulate by
            # swapping dims is not valid; instead pack normally and reject
            # rotated candidates by pre-filtering via monkey approach below.
            placed, leftover = _pack_layer_single_orientation(remaining, pallet, z, layer_index)
        else:
            placed, leftover = _pack_layer(remaining, pallet, z, layer_index)

        if not placed:
            break
        layer_height = max(p.height_mm for p in placed)
        if z + layer_height > pallet.max_height_mm:
            break
        layer_weight = sum(p.weight_kg for p in placed)
        if weight + layer_weight > pallet.max_weight_kg and placed_all:
            break
        placed_all.extend(placed)
        z += layer_height
        weight += layer_weight
        layer_index += 1
        remaining = leftover

    plan.placements = placed_all
    plan.unplaced = [b.sku_id for b in remaining] + [b.sku_id for b in fragile_pool]
    plan.num_layers = layer_index
    plan.stack_height_mm = round(z, 2)
    plan.total_weight_kg = round(weight, 2)

    placed_vol = sum(p.length_mm * p.width_mm * p.height_mm for p in placed_all)
    bounding = pallet.footprint_mm2 * z if z > 0 else 0.0
    plan.volume_density = round(placed_vol / bounding, 4) if bounding else 0.0
    base = _baseline_density(boxes, pallet)
    plan.baseline_density = round(base, 4)
    plan.density_uplift_pct = round((plan.volume_density - base) / base * 100, 1) if base > 0 else 0.0
    support, com, stab = _stability(placed_all, pallet)
    plan.support_score = round(support, 3)
    plan.com_score = round(com, 3)
    plan.stability_score = round(stab, 3)
    plan.is_valid = bool(placed_all) and plan.stability_score >= 0.6 and plan.com_score >= 0.5
    return plan, frag_map


def _pack_layer_single_orientation(boxes: list[Box], pallet: Pallet, z_mm: float, layer_index: int):
    """Shelf-pack with rotation disabled (speed_mode)."""
    placed: list[Placement] = []
    leftover: list[Box] = []
    ordered = sorted(boxes, key=lambda b: b.footprint_mm2, reverse=True)
    x_cursor = y_cursor = shelf_depth = 0.0
    for box in ordered:
        fp_l, fp_w = box.length_mm, box.width_mm
        if fp_l > pallet.length_mm or fp_w > pallet.width_mm:
            leftover.append(box)
            continue
        if x_cursor + fp_l <= pallet.length_mm + 1e-6 and y_cursor + fp_w <= pallet.width_mm + 1e-6:
            placed.append(Placement(box.sku_id, x_cursor, y_cursor, z_mm, fp_l, fp_w, box.height_mm, box.weight_kg, 0.0, layer_index))
            x_cursor += fp_l
            shelf_depth = max(shelf_depth, fp_w)
            continue
        new_y = y_cursor + shelf_depth
        if new_y + fp_w <= pallet.width_mm + 1e-6:
            y_cursor, x_cursor, shelf_depth = new_y, 0.0, fp_w
            placed.append(Placement(box.sku_id, x_cursor, y_cursor, z_mm, fp_l, fp_w, box.height_mm, box.weight_kg, 0.0, layer_index))
            x_cursor += fp_l
        else:
            leftover.append(box)
    return placed, leftover


def _to_web_plan(plan, frag_map: dict[str, float], plan_id: str):
    rotations = sum(1 for p in plan.placements if p.rot_deg != 0)
    cycle_s = len(plan.placements) * CYCLE_BASE_S + rotations * CYCLE_ROT_S
    boxes = []
    for p in plan.placements:
        d = {
            "sku_id": p.sku_id, "x_mm": p.x_mm, "y_mm": p.y_mm, "z_mm": p.z_mm,
            "length_mm": p.length_mm, "width_mm": p.width_mm, "height_mm": p.height_mm,
            "weight_kg": p.weight_kg, "rot_deg": p.rot_deg, "layer": p.layer,
        }
        if p.sku_id in frag_map:
            d["fragility"] = frag_map[p.sku_id]
        boxes.append(d)
    return {
        "plan_id": plan_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "engine": "python-core",
        "metrics": {
            "num_boxes": len(plan.placements),
            "unique_skus": len({p.sku_id for p in plan.placements}),
            "num_layers": plan.num_layers,
            "volume_density": plan.volume_density,
            "density_uplift_pct": plan.density_uplift_pct,
            "stability_score": plan.stability_score,
            "support_score": plan.support_score,
            "com_score": plan.com_score,
            "total_weight_kg": plan.total_weight_kg,
            "stack_height_mm": plan.stack_height_mm,
            "est_build_time_min": round(cycle_s / 60, 1),
            "est_robot_cycle_s": round(cycle_s, 1),
            "rotations_90": rotations,
        },
        "validation_report": {
            "is_valid": plan.is_valid,
            "stability_pass": plan.stability_score >= 0.6,
            "recommendations": plan.recommendations,
        },
        "boxes": boxes,
        "unplaced": plan.unplaced,
    }


@app.post("/optimize")
def optimize(body: OptimizeIn):
    pallet = Pallet(
        body.pallet.length_mm,
        body.pallet.width_mm,
        body.constraints.max_height_mm or body.pallet.max_height_mm,
        body.constraints.max_weight_kg or body.pallet.max_weight_kg,
    )
    plan, frag_map = _optimize_with_constraints(body.skus, body.constraints, pallet)
    return _to_web_plan(plan, frag_map, f"plan_py_{int(time.time() * 1000)}")


@app.post("/validate-stability")
def validate_stability(body: ValidateIn):
    """Geometry-based validation of arbitrary placements (z-height support)."""
    pallet = Pallet(body.pallet.length_mm, body.pallet.width_mm, body.pallet.max_height_mm, body.pallet.max_weight_kg)
    P = [
        Placement(p.sku_id, p.x_mm, p.y_mm, p.z_mm, p.length_mm, p.width_mm, p.height_mm, p.weight_kg, p.rot_deg, p.layer)
        for p in body.placements
    ]
    if not P:
        return {"is_stable": True, "stability_score": 1.0, "support_score": 1.0, "com_score": 1.0,
                "center_of_gravity": {"x_mm": pallet.length_mm / 2, "y_mm": pallet.width_mm / 2, "z_mm": 0},
                "com_offset_norm": 0.0, "per_box": [], "warnings": [], "suggestions": []}

    Z_TOL = 8.0
    per_box, warnings, suggestions = [], [], []
    for i, box in enumerate(P):
        if box.z_mm <= Z_TOL:
            ratio = 1.0
        else:
            supported = sum(
                _overlap_area(box, o)
                for j, o in enumerate(P)
                if j != i and abs(o.z_mm + o.height_mm - box.z_mm) <= Z_TOL
            )
            area = box.length_mm * box.width_mm
            ratio = min(1.0, supported / area) if area else 0.0
        overhang = (
            box.x_mm < -Z_TOL or box.y_mm < -Z_TOL
            or box.x_mm + box.length_mm > pallet.length_mm + Z_TOL
            or box.y_mm + box.width_mm > pallet.width_mm + Z_TOL
        )
        status = "critical" if (ratio < 0.5 or overhang) else ("warn" if ratio < 0.8 else "ok")
        per_box.append({"index": i, "sku_id": box.sku_id, "layer": box.layer,
                        "support_ratio": round(ratio, 3), "overhangs_pallet": overhang, "status": status})
        if status == "critical":
            warnings.append(f"{box.sku_id} (L{box.layer}) has only {ratio*100:.0f}% base support — tipping risk."
                            if not overhang else f"{box.sku_id} (L{box.layer}) overhangs the pallet footprint.")

    support = sum(b["support_ratio"] for b in per_box) / len(per_box)
    total_w = sum(max(p.weight_kg, 1e-6) for p in P)
    cog_x = sum((p.x_mm + p.length_mm / 2) * max(p.weight_kg, 1e-6) for p in P) / total_w
    cog_y = sum((p.y_mm + p.width_mm / 2) * max(p.weight_kg, 1e-6) for p in P) / total_w
    cog_z = sum((p.z_mm + p.height_mm / 2) * max(p.weight_kg, 1e-6) for p in P) / total_w
    cx, cy = pallet.length_mm / 2, pallet.width_mm / 2
    offset = math.hypot(cog_x - cx, cog_y - cy) / math.hypot(cx, cy)
    com = max(0.0, 1.0 - offset)
    stability = 0.6 * support + 0.4 * com
    critical = any(b["status"] == "critical" for b in per_box)
    is_stable = (not critical) and stability >= 0.6 and com >= 0.5
    if not is_stable and not suggestions:
        suggestions.append("Re-run the optimizer to restore a validated layout.")

    return {
        "is_stable": is_stable,
        "stability_score": round(stability, 3),
        "support_score": round(support, 3),
        "com_score": round(com, 3),
        "center_of_gravity": {"x_mm": round(cog_x), "y_mm": round(cog_y), "z_mm": round(cog_z)},
        "com_offset_norm": round(offset, 3),
        "per_box": per_box,
        "warnings": warnings,
        "suggestions": suggestions,
    }
