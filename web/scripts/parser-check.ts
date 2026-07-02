import { parseConstraints } from '../lib/palletizer/copilot';
const cases: Array<[string, object]> = [
  ['keep the glass on top and nothing taller than 1200mm', { fragile_high: true, max_height_mm: 1200 }],
  ['no taller than 1400mm please', { max_height_mm: 1400 }],
  ['stack must stay under 1100 mm', { max_height_mm: 1100 }],
  ['max weight 800kg', { max_weight_kg: 800 }],
  ['no heavier than 650 kg and keep heavy boxes at the bottom', { max_weight_kg: 650, heavy_low: true }],
  ['make it fast, protect SKU203', { speed_mode: true, protect_sku_ids: ['SKU203'], fragile_high: true }],
  ['maximize density, not speed', {}],
];
let fail = 0;
for (const [text, want] of cases) {
  const got = parseConstraints(text).constraints as Record<string, unknown>;
  const bad = Object.entries(want).filter(([k, v]) => JSON.stringify(got[k]) !== JSON.stringify(v));
  if (bad.length) { fail++; console.log(`FAIL "${text}" →`, JSON.stringify(got), 'missing', bad); }
  else console.log(`PASS "${text}"`);
}
process.exit(fail ? 1 : 0);
