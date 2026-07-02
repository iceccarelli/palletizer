// Parity check: TS port vs Python core on identical inputs.
// Run: npx tsx scripts/parity-dump.ts  (from web/)
import { optimizePallet } from '../lib/palletizer/optimizer';
import { BEVERAGE_SKUS, ecommChaosSkus, PHARMA_SKUS } from '../lib/palletizer/sampleData';
import { writeFileSync } from 'fs';

const datasets = {
  beverage: BEVERAGE_SKUS,
  pharma: PHARMA_SKUS,
  ecomm36: ecommChaosSkus(36, 42),
};

const out: Record<string, unknown> = {};
for (const [name, skus] of Object.entries(datasets)) {
  const plan = optimizePallet(skus);
  out[name] = {
    csv: skus.map((s) => `${s.sku_id},${s.length_mm},${s.width_mm},${s.height_mm},${s.weight_kg}`),
    placements: plan.placements.map((p) => [p.sku_id, p.x_mm, p.y_mm, p.z_mm, p.length_mm, p.width_mm, p.rot_deg, p.layer]),
    metrics: {
      num_layers: plan.num_layers,
      stack_height_mm: plan.stack_height_mm,
      total_weight_kg: plan.total_weight_kg,
      volume_density: plan.volume_density,
      baseline_density: plan.baseline_density,
      density_uplift_pct: plan.density_uplift_pct,
      support_score: plan.support_score,
      com_score: plan.com_score,
      stability_score: plan.stability_score,
      is_valid: plan.is_valid,
      unplaced: plan.unplaced,
    },
  };
}
writeFileSync('/tmp/ts_plans.json', JSON.stringify(out, null, 2));
console.log('TS plans written');
