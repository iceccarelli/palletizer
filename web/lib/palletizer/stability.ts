// Live stability validation for ARBITRARY placements (e.g. after the user
// drags a box). The optimizer's layer-indexed model assumes a clean layered
// plan; once a box has been moved freely we validate by geometry (z heights),
// using the same primitives: footprint-overlap support and weighted CoM.
//
// This runs every frame during drag (< 0.1 ms for 100 boxes), so feedback is
// instant. In deployed systems the Python core re-validates authoritatively;
// /api/validate-stability provides the same check server-side.

import { overlapArea } from './optimizer';
import {
  BoxStability,
  DEFAULT_PALLET,
  PalletSpec,
  Placement,
  StabilityValidation,
} from './types';

const Z_TOL_MM = 8; // surfaces within this tolerance count as touching

/** Boxes whose top surface is at (or just under) this box's base. */
function supportersOf(box: Placement, index: number, all: Placement[]): Placement[] {
  if (box.z_mm <= Z_TOL_MM) return []; // rests on the pallet deck
  return all.filter(
    (p, i) =>
      i !== index &&
      Math.abs(p.z_mm + p.height_mm - box.z_mm) <= Z_TOL_MM &&
      overlapArea(box, p) > 0,
  );
}

export function supportRatio(box: Placement, index: number, all: Placement[]): number {
  const area = box.length_mm * box.width_mm;
  if (area <= 0) return 0;
  if (box.z_mm <= Z_TOL_MM) return 1; // fully on the deck
  const supported = supportersOf(box, index, all).reduce((s, p) => s + overlapArea(box, p), 0);
  return Math.min(1, supported / area);
}

/**
 * Given a box hovering at (x, y), find the z it would rest at: the highest
 * top surface it overlaps, or the pallet deck. Deterministic "settle".
 */
export function settleZ(box: Placement, index: number, all: Placement[]): number {
  let z = 0;
  all.forEach((p, i) => {
    if (i === index) return;
    if (overlapArea(box, p) > 0) {
      z = Math.max(z, p.z_mm + p.height_mm);
    }
  });
  return z;
}

/** Re-derive layer index from z after free movement (for labels/exports). */
export function layerFromZ(z_mm: number, all: Placement[]): number {
  const levels = Array.from(new Set(all.map((p) => Math.round(p.z_mm / Z_TOL_MM) * Z_TOL_MM))).sort(
    (a, b) => a - b,
  );
  const idx = levels.findIndex((l) => Math.abs(l - z_mm) <= Z_TOL_MM);
  return idx >= 0 ? idx : levels.length;
}

export function validatePlacements(
  placements: Placement[],
  palletIn?: Partial<PalletSpec>,
): StabilityValidation {
  const pallet: PalletSpec = { ...DEFAULT_PALLET, ...palletIn };

  if (placements.length === 0) {
    return {
      is_stable: true,
      stability_score: 1,
      support_score: 1,
      com_score: 1,
      center_of_gravity: { x_mm: pallet.length_mm / 2, y_mm: pallet.width_mm / 2, z_mm: 0 },
      com_offset_norm: 0,
      per_box: [],
      warnings: [],
      suggestions: [],
    };
  }

  const perBox: BoxStability[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  placements.forEach((box, i) => {
    const ratio = supportRatio(box, i, placements);
    const overhang =
      box.x_mm < -Z_TOL_MM ||
      box.y_mm < -Z_TOL_MM ||
      box.x_mm + box.length_mm > pallet.length_mm + Z_TOL_MM ||
      box.y_mm + box.width_mm > pallet.width_mm + Z_TOL_MM;

    let status: BoxStability['status'] = 'ok';
    if (ratio < 0.5 || overhang) status = 'critical';
    else if (ratio < 0.8) status = 'warn';

    perBox.push({
      index: i,
      sku_id: box.sku_id,
      layer: box.layer,
      support_ratio: Math.round(ratio * 1000) / 1000,
      overhangs_pallet: overhang,
      status,
    });

    if (status === 'critical') {
      if (overhang) {
        warnings.push(`${box.sku_id} (L${box.layer}) overhangs the pallet footprint.`);
        suggestions.push(`Move ${box.sku_id} back inside the ${pallet.length_mm}x${pallet.width_mm} mm deck.`);
      } else {
        warnings.push(
          `${box.sku_id} (L${box.layer}) has only ${(ratio * 100).toFixed(0)}% base support — tipping risk.`,
        );
        suggestions.push(`Shift ${box.sku_id} onto a fully supporting surface or drop it to a lower layer.`);
      }
    } else if (status === 'warn') {
      warnings.push(`${box.sku_id} (L${box.layer}) support at ${(ratio * 100).toFixed(0)}% (target ≥ 80%).`);
    }
  });

  const support = perBox.reduce((s, b) => s + b.support_ratio, 0) / perBox.length;

  const totalW = placements.reduce((s, p) => s + Math.max(p.weight_kg, 1e-6), 0);
  const cog = {
    x_mm: placements.reduce((s, p) => s + (p.x_mm + p.length_mm / 2) * Math.max(p.weight_kg, 1e-6), 0) / totalW,
    y_mm: placements.reduce((s, p) => s + (p.y_mm + p.width_mm / 2) * Math.max(p.weight_kg, 1e-6), 0) / totalW,
    z_mm: placements.reduce((s, p) => s + (p.z_mm + p.height_mm / 2) * Math.max(p.weight_kg, 1e-6), 0) / totalW,
  };
  const cx = pallet.length_mm / 2;
  const cy = pallet.width_mm / 2;
  const halfDiag = Math.hypot(cx, cy);
  const offset = Math.hypot(cog.x_mm - cx, cog.y_mm - cy) / halfDiag;
  const com = Math.max(0, 1 - offset);

  const stability = 0.6 * support + 0.4 * com; // same weights as the Python core

  if (offset > 0.25) {
    warnings.push(
      `Load centre of mass is ${Math.hypot(cog.x_mm - cx, cog.y_mm - cy).toFixed(0)} mm off pallet centre.`,
    );
    suggestions.push('Redistribute heavy SKUs toward the pallet centre to recentre the load.');
  }

  const critical = perBox.some((b) => b.status === 'critical');
  const isStable = !critical && stability >= 0.6 && com >= 0.5;

  if (!isStable && suggestions.length === 0) {
    suggestions.push('Re-run the optimizer to restore a validated layout.');
  }

  return {
    is_stable: isStable,
    stability_score: Math.round(stability * 1000) / 1000,
    support_score: Math.round(support * 1000) / 1000,
    com_score: Math.round(com * 1000) / 1000,
    center_of_gravity: {
      x_mm: Math.round(cog.x_mm),
      y_mm: Math.round(cog.y_mm),
      z_mm: Math.round(cog.z_mm),
    },
    com_offset_norm: Math.round(offset * 1000) / 1000,
    per_box: perBox,
    warnings,
    suggestions,
  };
}

/**
 * Deterministic auto-fix: take the worst-supported box and search the deck +
 * existing top surfaces for the position that maximises its support ratio
 * while keeping the CoM offset small. Returns a modified copy, or null if
 * nothing needs fixing. This is plain search over the same geometry — no magic.
 */
export function autoFixWorstBox(
  placements: Placement[],
  palletIn?: Partial<PalletSpec>,
): { placements: Placement[]; moved: string; from: Placement; to: Placement } | null {
  const pallet: PalletSpec = { ...DEFAULT_PALLET, ...palletIn };
  const val = validatePlacements(placements, pallet);
  const worst = [...val.per_box].sort((a, b) => a.support_ratio - b.support_ratio)[0];
  if (!worst || worst.support_ratio >= 0.8) return null;

  const box = placements[worst.index];
  const others = placements.filter((_, i) => i !== worst.index);

  const STEP = 40; // mm grid — coarse but fast and deterministic
  let best: { p: Placement; score: number } | null = null;

  for (let x = 0; x + box.length_mm <= pallet.length_mm; x += STEP) {
    for (let y = 0; y + box.width_mm <= pallet.width_mm; y += STEP) {
      const candidate: Placement = { ...box, x_mm: x, y_mm: y, z_mm: 0 };
      candidate.z_mm = settleZ(candidate, -1, others);
      if (candidate.z_mm + candidate.height_mm > pallet.max_height_mm) continue;
      // reject positions colliding at the same level
      const collides = others.some(
        (o) =>
          overlapArea(candidate, o) > 1 &&
          candidate.z_mm < o.z_mm + o.height_mm - Z_TOL_MM &&
          o.z_mm < candidate.z_mm + candidate.height_mm - Z_TOL_MM,
      );
      if (collides) continue;
      const trial = [...others, candidate];
      const v = validatePlacements(trial, pallet);
      const mine = v.per_box[trial.length - 1].support_ratio;
      const score = 0.7 * mine + 0.3 * v.com_score - candidate.z_mm / 100000; // prefer low placements
      if (!best || score > best.score) best = { p: candidate, score };
    }
  }

  if (!best) return null;
  const to = { ...best.p, layer: layerFromZ(best.p.z_mm, others) };
  const next = [...others, to];
  return { placements: next, moved: box.sku_id, from: box, to };
}
