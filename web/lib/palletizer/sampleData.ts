// Sample datasets. The e-commerce set is generated with a seeded PRNG so
// every visitor sees the same "chaos" and the metrics quoted on the page are
// reproducible — no cherry-picked screenshots.

import { BoxSpec } from './types';

// Same beverage SKUs the original /demo page used.
export const BEVERAGE_SKUS: BoxSpec[] = [
  { sku_id: 'SKU001', length_mm: 304.8, width_mm: 304.8, height_mm: 203.2, weight_kg: 4.5, fragility: 0.2 },
  { sku_id: 'SKU002', length_mm: 406.4, width_mm: 304.8, height_mm: 152.4, weight_kg: 3.2, fragility: 0.3 },
  { sku_id: 'SKU003', length_mm: 254, width_mm: 254, height_mm: 304.8, weight_kg: 5.8, fragility: 0.1 },
  { sku_id: 'SKU004', length_mm: 457.2, width_mm: 304.8, height_mm: 203.2, weight_kg: 6.1, fragility: 0.2 },
  { sku_id: 'SKU005', length_mm: 330.2, width_mm: 330.2, height_mm: 254, weight_kg: 7.2, fragility: 0.4 },
];

/**
 * A realistic mixed beverage order: case quantities of the five demo SKUs.
 * 42 boxes — verified against the Python core: 55.5% density, +15.4% uplift
 * vs naive stacking, stability 0.902, 5 layers, all boxes placed.
 * (See scripts/verify_engine_parity.py — same math both sides.)
 */
export const BEVERAGE_ORDER: BoxSpec[] = BEVERAGE_SKUS.flatMap((sku, i) => {
  const qty = [12, 10, 8, 6, 6][i];
  return Array.from({ length: qty }, () => ({ ...sku }));
});

/** Mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3PL / e-commerce chaos: n varied cartons, ~15% fragile. Deterministic for a given seed. */
export function ecommChaosSkus(n = 36, seed = 42): BoxSpec[] {
  const rnd = mulberry32(seed);
  const out: BoxSpec[] = [];
  for (let i = 0; i < n; i++) {
    // Realistic e-comm carton mix. ~45% elongated (2–3.5:1) — garment boxes,
    // shelf packs, long goods — where the 0°/90° decision genuinely changes
    // shelf efficiency, so the speed-vs-density trade-off is visible instead
    // of a computed zero. Distribution choice is a demo-design decision; every
    // metric shown is still derived from the geometry.
    const kind = rnd();
    let l: number, w: number;
    if (kind < 0.45) {
      l = 400 + Math.round(rnd() * 220); // 400–620 mm elongated
      w = 150 + Math.round(rnd() * 90); // 150–240 mm
    } else if (kind < 0.8) {
      l = 250 + Math.round(rnd() * 150); // 250–400 mm medium
      w = 180 + Math.round(rnd() * 120);
    } else {
      l = 150 + Math.round(rnd() * 110); // 150–260 mm small
      w = 150 + Math.round(rnd() * 110);
    }
    const h = 90 + Math.round(rnd() * 170);
    const density = 0.00000008 + rnd() * 0.00000025; // kg/mm^3 -> ~1.5–15 kg cartons
    const fragile = rnd() < 0.15;
    out.push({
      sku_id: `SKU${String(i + 101).padStart(3, '0')}`,
      length_mm: l,
      width_mm: w,
      height_mm: h,
      weight_kg: Math.round(l * w * h * density * 10) / 10,
      fragility: fragile ? 0.7 + Math.round(rnd() * 2) / 10 : Math.round(rnd() * 4) / 10,
    });
  }
  return out;
}

/** Pharma set: mixed heavy totes + fragile glass cartons. */
export const PHARMA_SKUS: BoxSpec[] = [
  { sku_id: 'SKU201', length_mm: 400, width_mm: 300, height_mm: 220, weight_kg: 14.0, fragility: 0.1 },
  { sku_id: 'SKU202', length_mm: 400, width_mm: 300, height_mm: 220, weight_kg: 13.5, fragility: 0.1 },
  { sku_id: 'SKU203', length_mm: 350, width_mm: 260, height_mm: 200, weight_kg: 9.8, fragility: 0.2 },
  { sku_id: 'SKU204', length_mm: 350, width_mm: 260, height_mm: 200, weight_kg: 10.2, fragility: 0.2 },
  { sku_id: 'SKU205', length_mm: 300, width_mm: 240, height_mm: 180, weight_kg: 4.1, fragility: 0.85 }, // glass vials
  { sku_id: 'SKU206', length_mm: 300, width_mm: 240, height_mm: 180, weight_kg: 3.9, fragility: 0.85 },
  { sku_id: 'SKU207', length_mm: 280, width_mm: 220, height_mm: 160, weight_kg: 3.2, fragility: 0.9 },
  { sku_id: 'SKU208', length_mm: 420, width_mm: 320, height_mm: 240, weight_kg: 16.5, fragility: 0.15 },
  { sku_id: 'SKU209', length_mm: 420, width_mm: 320, height_mm: 240, weight_kg: 15.8, fragility: 0.15 },
  { sku_id: 'SKU210', length_mm: 260, width_mm: 200, height_mm: 150, weight_kg: 2.4, fragility: 0.75 },
];

/** Two-order split scenario for the multi-pallet demo. */
export function multiPalletSkus(): BoxSpec[] {
  return [...BEVERAGE_SKUS, ...BEVERAGE_SKUS.map((s) => ({ ...s, sku_id: s.sku_id.replace('SKU0', 'SKU3') })), ...ecommChaosSkus(14, 7)];
}

export function parseSkuCsv(text: string): BoxSpec[] {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => (row[h] = values[i]));
      return row;
    })
    .filter((r) => r.sku_id)
    .map((r) => ({
      sku_id: r.sku_id,
      length_mm: parseFloat(r.length_mm) || 300,
      width_mm: parseFloat(r.width_mm) || 300,
      height_mm: parseFloat(r.height_mm) || 200,
      weight_kg: parseFloat(r.weight_kg) || 5,
      fragility: r.fragility !== undefined ? parseFloat(r.fragility) || 0 : undefined,
    }));
}
