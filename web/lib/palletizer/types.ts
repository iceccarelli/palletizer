// Shared types for the Palletizer platform.
// These mirror the Python dataclasses in palletizer_full/optimizer.py 1:1.
// If you change a field here, change it there too (and vice versa).

export interface BoxSpec {
  sku_id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  weight_kg: number;
  /** 0..1, higher = more fragile. Optional extension used by constraint-aware packing. */
  fragility?: number;
}

export interface PalletSpec {
  length_mm: number;
  width_mm: number;
  max_height_mm: number;
  max_weight_kg: number;
}

// Standard GMA pallet (mm) — same defaults as the Python core.
export const DEFAULT_PALLET: PalletSpec = {
  length_mm: 1219.0,
  width_mm: 1016.0,
  max_height_mm: 1800.0,
  max_weight_kg: 1000.0,
};

export interface Placement {
  sku_id: string;
  x_mm: number; // lower-left corner on the pallet
  y_mm: number;
  z_mm: number; // base height of the box
  length_mm: number; // footprint length AFTER rotation
  width_mm: number; // footprint width AFTER rotation
  height_mm: number;
  weight_kg: number;
  rot_deg: number; // 0 or 90
  layer: number;
  fragility?: number;
}

/** Core plan shape — matches palletizer_full.optimizer.PalletPlan.to_dict() */
export interface CorePlan {
  placements: Placement[];
  unplaced: string[];
  num_layers: number;
  stack_height_mm: number;
  total_weight_kg: number;
  volume_density: number;
  baseline_density: number;
  density_uplift_pct: number;
  support_score: number;
  com_score: number;
  stability_score: number;
  is_valid: boolean;
  recommendations: string[];
}

/** Deterministic constraint extensions understood by the TS engine and gateway/demo_api.py. */
export interface OptimizeConstraints {
  max_height_mm?: number;
  max_weight_kg?: number;
  /** Sort packing order by weight (heaviest first) instead of height. */
  heavy_low?: boolean;
  /** Boxes with fragility >= fragile_threshold are packed only on the top-most layers. */
  fragile_high?: boolean;
  fragile_threshold?: number; // default 0.6
  /** SKU ids to treat as fragile regardless of their fragility value. */
  protect_sku_ids?: string[];
  /** Single-orientation packing: fewer wrist rotations -> faster robot cycle, usually lower density. */
  speed_mode?: boolean;
}

export interface PlanMetrics {
  num_boxes: number;
  unique_skus: number;
  num_layers: number;
  volume_density: number;
  density_uplift_pct: number;
  stability_score: number;
  support_score: number;
  com_score: number;
  total_weight_kg: number;
  stack_height_mm: number;
  est_build_time_min: number;
  est_robot_cycle_s: number;
  rotations_90: number;
}

export interface ValidationReport {
  is_valid: boolean;
  stability_pass: boolean;
  recommendations: string[];
}

/** Web-facing plan — superset of what web/app/demo/page.tsx already used, so exports stay identical. */
export interface WebPlan {
  plan_id: string;
  created_at: string;
  engine: 'ts-port' | 'python-core';
  constraints?: OptimizeConstraints;
  metrics: PlanMetrics;
  validation_report: ValidationReport;
  boxes: Placement[];
  unplaced: string[];
}

export interface CoG {
  x_mm: number;
  y_mm: number;
  z_mm: number;
}

export interface BoxStability {
  index: number;
  sku_id: string;
  layer: number;
  /** Fraction of this box's footprint resting on the surface(s) below (1.0 on the pallet deck). */
  support_ratio: number;
  overhangs_pallet: boolean;
  status: 'ok' | 'warn' | 'critical';
}

export interface StabilityValidation {
  is_stable: boolean;
  stability_score: number;
  support_score: number;
  com_score: number;
  center_of_gravity: CoG;
  /** Normalized CoM offset from pallet center, 0 = centered, 1 = at the corner. */
  com_offset_norm: number;
  per_box: BoxStability[];
  warnings: string[];
  suggestions: string[];
}

export interface CopilotConstraintResult {
  constraints: OptimizeConstraints;
  matched_rules: string[];
  explanation: string;
  parser: 'deterministic-rules' | 'llm';
}
