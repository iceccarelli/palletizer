// TypeScript port of palletizer_full/optimizer.py.
//
// This is NOT a simulation of the Python engine — it is the same algorithm,
// ported function-for-function (same shelf packing, same baseline, same
// stability model: 0.6 * base-support + 0.4 * center-of-mass score).
// Given the same boxes it produces the same placements and the same metrics
// as `palletize-optimize --json`.
//
// The Python core remains the source of truth in deployed cells; this port
// exists so the web demos give instant, honest feedback with identical math.
// Deterministic constraint extensions (heavy_low / fragile_high / speed_mode)
// are additive re-orderings of the same packer and are mirrored in
// gateway/demo_api.py.

import {
  BoxSpec,
  CorePlan,
  DEFAULT_PALLET,
  OptimizeConstraints,
  PalletSpec,
  Placement,
  PlanMetrics,
  ValidationReport,
  WebPlan,
} from './types';

const EPS = 1e-6;

function footprint(b: BoxSpec): number {
  return b.length_mm * b.width_mm;
}
function volume(b: BoxSpec): number {
  return b.length_mm * b.width_mm * b.height_mm;
}

/** Footprint overlap area (mm^2) between two placements. Port of _overlap_area. */
export function overlapArea(a: Placement, b: Placement): number {
  const ax2 = a.x_mm + a.length_mm;
  const ay2 = a.y_mm + a.width_mm;
  const bx2 = b.x_mm + b.length_mm;
  const by2 = b.y_mm + b.width_mm;
  const dx = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x_mm, b.x_mm));
  const dy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y_mm, b.y_mm));
  return dx * dy;
}

/** Shelf-pack a single layer. Port of _pack_layer (greedy FFD by footprint, both orientations). */
function packLayer(
  boxes: BoxSpec[],
  pallet: PalletSpec,
  z_mm: number,
  layerIndex: number,
  speedMode: boolean,
): { placed: Placement[]; leftover: BoxSpec[] } {
  const placed: Placement[] = [];
  const leftover: BoxSpec[] = [];

  const ordered = [...boxes].sort((a, b) => footprint(b) - footprint(a));

  let xCursor = 0;
  let yCursor = 0;
  let shelfDepth = 0;

  for (const box of ordered) {
    let placedThis = false;
    const orientations: Array<[number, number, number]> = speedMode
      ? [[box.length_mm, box.width_mm, 0]]
      : [
          [box.length_mm, box.width_mm, 0],
          [box.width_mm, box.length_mm, 90],
        ];

    for (const [fpL, fpW, rot] of orientations) {
      if (fpL > pallet.length_mm || fpW > pallet.width_mm) continue;

      if (xCursor + fpL <= pallet.length_mm + EPS && yCursor + fpW <= pallet.width_mm + EPS) {
        placed.push({
          sku_id: box.sku_id,
          x_mm: xCursor,
          y_mm: yCursor,
          z_mm,
          length_mm: fpL,
          width_mm: fpW,
          height_mm: box.height_mm,
          weight_kg: box.weight_kg,
          rot_deg: rot,
          layer: layerIndex,
          fragility: box.fragility,
        });
        xCursor += fpL;
        shelfDepth = Math.max(shelfDepth, fpW);
        placedThis = true;
        break;
      }
      const newY = yCursor + shelfDepth;
      if (newY + fpW <= pallet.width_mm + EPS && fpL <= pallet.length_mm + EPS) {
        yCursor = newY;
        xCursor = 0;
        shelfDepth = fpW;
        placed.push({
          sku_id: box.sku_id,
          x_mm: xCursor,
          y_mm: yCursor,
          z_mm,
          length_mm: fpL,
          width_mm: fpW,
          height_mm: box.height_mm,
          weight_kg: box.weight_kg,
          rot_deg: rot,
          layer: layerIndex,
          fragility: box.fragility,
        });
        xCursor += fpL;
        placedThis = true;
        break;
      }
    }
    if (!placedThis) leftover.push(box);
  }

  return { placed, leftover };
}

/** Port of _baseline_density: naive single-orientation row stacking. */
function baselineDensity(boxes: BoxSpec[], pallet: PalletSpec): number {
  if (boxes.length === 0) return 0;
  let placedVol = 0;
  let x = 0,
    y = 0,
    z = 0;
  let rowDepth = 0;
  let layerH = 0;
  for (const box of boxes) {
    if (box.length_mm > pallet.length_mm || box.width_mm > pallet.width_mm) continue;
    if (x + box.length_mm > pallet.length_mm) {
      x = 0;
      y += rowDepth;
      rowDepth = 0;
    }
    if (y + box.width_mm > pallet.width_mm) {
      x = 0;
      y = 0;
      rowDepth = 0;
      z += layerH;
      layerH = 0;
      if (z >= pallet.max_height_mm) break;
    }
    x += box.length_mm;
    rowDepth = Math.max(rowDepth, box.width_mm);
    layerH = Math.max(layerH, box.height_mm);
    placedVol += volume(box);
  }
  const stackH = z + layerH;
  if (stackH <= 0) return 0;
  return placedVol / (pallet.length_mm * pallet.width_mm * stackH);
}

/** Port of _stability: (support_score, com_score, stability_score) in [0,1]. */
export function stabilityFromGeometry(
  placements: Placement[],
  pallet: PalletSpec,
): { support: number; com: number; stability: number } {
  if (placements.length === 0) return { support: 0, com: 0, stability: 0 };

  const byLayer = new Map<number, Placement[]>();
  for (const p of placements) {
    const arr = byLayer.get(p.layer) ?? [];
    arr.push(p);
    byLayer.set(p.layer, arr);
  }

  const supportRatios: number[] = [];
  byLayer.forEach((layer, layerIdx) => {
    const below = layerIdx > 0 ? byLayer.get(layerIdx - 1) ?? [] : null;
    for (const box of layer) {
      if (below === null) {
        supportRatios.push(1.0);
        continue;
      }
      const supported = below.reduce((s, b) => s + overlapArea(box, b), 0);
      const area = box.length_mm * box.width_mm;
      supportRatios.push(area ? Math.min(1, supported / area) : 0);
    }
  });
  const support = supportRatios.reduce((a, b) => a + b, 0) / supportRatios.length;

  const totalW = placements.reduce((s, p) => s + Math.max(p.weight_kg, 1e-6), 0);
  const comX =
    placements.reduce((s, p) => s + (p.x_mm + p.length_mm / 2) * Math.max(p.weight_kg, 1e-6), 0) / totalW;
  const comY =
    placements.reduce((s, p) => s + (p.y_mm + p.width_mm / 2) * Math.max(p.weight_kg, 1e-6), 0) / totalW;
  const cx = pallet.length_mm / 2;
  const cy = pallet.width_mm / 2;
  const halfDiag = Math.hypot(cx, cy);
  const offset = Math.hypot(comX - cx, comY - cy) / halfDiag;
  const com = Math.max(0, 1 - offset);

  return { support, com, stability: 0.6 * support + 0.4 * com };
}

function isFragile(b: BoxSpec, c: OptimizeConstraints): boolean {
  const thr = c.fragile_threshold ?? 0.6;
  if (c.protect_sku_ids?.includes(b.sku_id)) return true;
  return (b.fragility ?? 0) >= thr;
}

/**
 * Port of optimize_pallet, with deterministic constraint extensions.
 *
 * Base behaviour (no constraints) matches the Python core exactly: boxes are
 * grouped into height-similar layers (tallest first) and shelf-packed.
 *
 * Extensions (all deterministic re-orderings of the same packer):
 *  - heavy_low: pack in weight-descending order so mass concentrates in lower layers.
 *  - fragile_high: fragile boxes are withheld until all non-fragile boxes are
 *    packed, so nothing is stacked on top of them.
 *  - speed_mode: single orientation only (no 90° wrist rotations).
 */
export function optimizePallet(
  boxes: BoxSpec[],
  palletIn?: Partial<PalletSpec>,
  constraints: OptimizeConstraints = {},
): CorePlan {
  const pallet: PalletSpec = {
    ...DEFAULT_PALLET,
    ...palletIn,
    ...(constraints.max_height_mm ? { max_height_mm: constraints.max_height_mm } : {}),
    ...(constraints.max_weight_kg ? { max_weight_kg: constraints.max_weight_kg } : {}),
  };

  const plan: CorePlan = {
    placements: [],
    unplaced: [],
    num_layers: 0,
    stack_height_mm: 0,
    total_weight_kg: 0,
    volume_density: 0,
    baseline_density: 0,
    density_uplift_pct: 0,
    support_score: 0,
    com_score: 0,
    stability_score: 0,
    is_valid: false,
    recommendations: [],
  };
  if (boxes.length === 0) return plan;

  // Packing order. Default = height desc (Python core). heavy_low = weight desc, height as tiebreak.
  const orderKey = (b: BoxSpec) =>
    constraints.heavy_low ? [b.weight_kg, b.height_mm] : [b.height_mm, 0];
  const sortDesc = (arr: BoxSpec[]) =>
    [...arr].sort((a, b) => {
      const ka = orderKey(a);
      const kb = orderKey(b);
      return kb[0] - ka[0] || kb[1] - ka[1];
    });

  let fragilePool: BoxSpec[] = [];
  let remaining: BoxSpec[];
  if (constraints.fragile_high) {
    fragilePool = sortDesc(boxes.filter((b) => isFragile(b, constraints)));
    remaining = sortDesc(boxes.filter((b) => !isFragile(b, constraints)));
  } else {
    remaining = sortDesc(boxes);
  }

  let z = 0;
  let weight = 0;
  let layerIndex = 0;
  const placedAll: Placement[] = [];
  let phase: 'base' | 'fragile' = 'base';

  while (remaining.length > 0 || (constraints.fragile_high && fragilePool.length > 0)) {
    if (remaining.length === 0 && fragilePool.length > 0) {
      remaining = fragilePool;
      fragilePool = [];
      phase = 'fragile';
    }
    if (remaining.length === 0) break;

    const minH = Math.min(...remaining.map((b) => b.height_mm));
    if (z + minH > pallet.max_height_mm) break;

    const { placed, leftover } = packLayer(remaining, pallet, z, layerIndex, !!constraints.speed_mode);
    if (placed.length === 0) break;

    const layerHeight = Math.max(...placed.map((p) => p.height_mm));
    if (z + layerHeight > pallet.max_height_mm) break;

    const layerWeight = placed.reduce((s, p) => s + p.weight_kg, 0);
    if (weight + layerWeight > pallet.max_weight_kg && placedAll.length > 0) break;

    placedAll.push(...placed);
    z += layerHeight;
    weight += layerWeight;
    layerIndex += 1;
    remaining = leftover;
  }

  const unplacedIds = [...remaining.map((b) => b.sku_id), ...fragilePool.map((b) => b.sku_id)];

  plan.placements = placedAll;
  plan.unplaced = unplacedIds;
  plan.num_layers = layerIndex;
  plan.stack_height_mm = Math.round(z * 100) / 100;
  plan.total_weight_kg = Math.round(weight * 100) / 100;

  const placedVol = placedAll.reduce((s, p) => s + p.length_mm * p.width_mm * p.height_mm, 0);
  const boundingVol = z > 0 ? pallet.length_mm * pallet.width_mm * z : 0;
  plan.volume_density = boundingVol ? Math.round((placedVol / boundingVol) * 10000) / 10000 : 0;

  const base = baselineDensity(boxes, pallet);
  plan.baseline_density = Math.round(base * 10000) / 10000;
  plan.density_uplift_pct = base > 0 ? Math.round(((plan.volume_density - base) / base) * 1000) / 10 : 0;

  const { support, com, stability } = stabilityFromGeometry(placedAll, pallet);
  plan.support_score = Math.round(support * 1000) / 1000;
  plan.com_score = Math.round(com * 1000) / 1000;
  plan.stability_score = Math.round(stability * 1000) / 1000;

  const recs: string[] = [];
  if (plan.unplaced.length > 0) {
    recs.push(`${plan.unplaced.length} box(es) did not fit; consider a second pallet or larger footprint.`);
  }
  if (plan.support_score < 0.85) {
    recs.push('Low base support on upper layers; reorder so larger footprints sit lower.');
  }
  if (plan.com_score < 0.8) {
    recs.push('Load is off-center; redistribute heavy SKUs toward the pallet center.');
  }
  if (phase === 'fragile' && constraints.fragile_high) {
    recs.push('Fragile SKUs isolated on top layers — nothing is stacked above them.');
  }
  plan.recommendations = recs;

  plan.is_valid = placedAll.length > 0 && plan.stability_score >= 0.6 && plan.com_score >= 0.5;
  return plan;
}

// ---------------------------------------------------------------------------
// Web plan wrapper: derived metrics only (no invented numbers).
// ---------------------------------------------------------------------------

/** Robot cycle estimate: per-pick base + wrist-rotation penalty. Both parameters are stated, not hidden. */
export const CYCLE_BASE_S_PER_BOX = 7.5;
export const CYCLE_ROT_PENALTY_S = 1.8;

export function toWebPlan(
  core: CorePlan,
  opts: { planId?: string; engine?: WebPlan['engine']; constraints?: OptimizeConstraints } = {},
): WebPlan {
  const rotations = core.placements.filter((p) => p.rot_deg !== 0).length;
  const cycleS = core.placements.length * CYCLE_BASE_S_PER_BOX + rotations * CYCLE_ROT_PENALTY_S;

  const metrics: PlanMetrics = {
    num_boxes: core.placements.length,
    unique_skus: new Set(core.placements.map((p) => p.sku_id)).size,
    num_layers: core.num_layers,
    volume_density: core.volume_density,
    density_uplift_pct: core.density_uplift_pct,
    stability_score: core.stability_score,
    support_score: core.support_score,
    com_score: core.com_score,
    total_weight_kg: core.total_weight_kg,
    stack_height_mm: core.stack_height_mm,
    est_build_time_min: Math.round((cycleS / 60) * 10) / 10,
    est_robot_cycle_s: Math.round(cycleS * 10) / 10,
    rotations_90: rotations,
  };

  const validation: ValidationReport = {
    is_valid: core.is_valid,
    stability_pass: core.stability_score >= 0.6,
    recommendations: core.recommendations,
  };

  return {
    plan_id: opts.planId ?? `plan_${Date.now()}`,
    created_at: new Date().toISOString(),
    engine: opts.engine ?? 'ts-port',
    constraints: opts.constraints,
    metrics,
    validation_report: validation,
    boxes: core.placements,
    unplaced: core.unplaced,
  };
}

export function planFromBoxes(
  boxes: BoxSpec[],
  constraints: OptimizeConstraints = {},
  pallet?: Partial<PalletSpec>,
  planId?: string,
): WebPlan {
  return toWebPlan(optimizePallet(boxes, pallet, constraints), { planId, constraints });
}
