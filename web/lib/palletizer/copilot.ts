// Natural-language -> optimizer constraints.
//
// CLIENT PATH (this file): a deterministic keyword/number parser. It is
// labelled as exactly that in the UI ("Fast client parser — deterministic").
// It covers the constraint vocabulary the optimizer actually understands, so
// what you type is what the engine does — no pretend AI.
//
// BACKEND PATH (/api/adapt-plan): if ANTHROPIC_API_KEY is configured, the
// same sentence is parsed by an LLM into the identical constraint schema and
// the SAME deterministic optimizer re-runs. The LLM only ever chooses
// constraints; it never invents placements or metrics.

import { CopilotConstraintResult, OptimizeConstraints } from './types';

interface Rule {
  id: string;
  test: RegExp;
  apply: (c: OptimizeConstraints, m: RegExpMatchArray, text: string) => void;
  describe: string;
}

const RULES: Rule[] = [
  {
    id: 'fragile_high',
    test: /(fragile|glass|bottle|delicate|breakable|pharma|protect)/i,
    apply: (c) => {
      c.fragile_high = true;
      c.fragile_threshold = c.fragile_threshold ?? 0.6;
    },
    describe: 'Fragile SKUs packed last, on top layers, with nothing stacked above them',
  },
  {
    id: 'heavy_low',
    test: /(heav(?:y|iest)|mass|bottom|low(?:er)?\s+layers?|stable|stability)/i,
    apply: (c) => {
      c.heavy_low = true;
    },
    describe: 'Packing order switched to weight-descending so mass sits low',
  },
  {
    id: 'speed_mode',
    test: /(fast|speed|throughput|cycle time|velocity|quick)/i,
    apply: (c) => {
      c.speed_mode = true;
    },
    describe: 'Single-orientation packing: no 90° wrist rotations (faster cycle, usually lower density)',
  },
  {
    id: 'max_height',
    test: /(?:(?:max(?:imum)?\s*height|height\s*(?:limit|cap|under|below|max)|no(?:thing)?\s+(?:goes\s+)?taller\s+than|shorter\s+than|cap(?:ped)?\s+(?:the\s+stack\s+)?at)\D{0,12}(\d{3,4})\s*(?:mm)?|(?:under|below|not?\s+(?:above|over|exceed(?:ing)?))\s*(\d{3,4})\s*mm)/i,
    apply: (c, m) => {
      c.max_height_mm = parseInt(m[1] ?? m[2], 10);
    },
    describe: 'Stack height capped at the requested value',
  },
  {
    id: 'max_weight',
    test: /(?:(?:max(?:imum)?\s*weight|weight\s*(?:limit|cap|under|below)|no\s+heavier\s+than)\D{0,12}(\d{2,4})\s*(?:kg)?|(?:under|below|not?\s+(?:above|over|exceed(?:ing)?))\s*(\d{2,4})\s*kg)/i,
    apply: (c, m) => {
      c.max_weight_kg = parseInt(m[1] ?? m[2], 10);
    },
    describe: 'Total pallet weight capped at the requested value',
  },
  {
    id: 'protect_skus',
    test: /(SKU\d{3})/gi,
    apply: (c, _m, text) => {
      const ids = Array.from(new Set(text.match(/SKU\d{3}/gi)?.map((s) => s.toUpperCase()) ?? []));
      if (ids.length) {
        c.protect_sku_ids = ids;
        c.fragile_high = true;
      }
    },
    describe: 'Named SKUs treated as fragile and kept on top',
  },
];

export function parseConstraints(text: string): CopilotConstraintResult {
  const constraints: OptimizeConstraints = {};
  const matched: string[] = [];
  const notes: string[] = [];

  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (m) {
      rule.apply(constraints, m, text);
      matched.push(rule.id);
      notes.push(rule.describe);
    }
  }

  // "maximize density" cancels speed_mode if both matched but density is emphasised
  if (/max(imi[sz]e)?\s+density|densest|tight/i.test(text) && constraints.speed_mode) {
    delete constraints.speed_mode;
    notes.push('Density prioritised: both orientations kept in play');
  }

  const explanation =
    matched.length === 0
      ? 'No recognised constraints in that sentence. Try mentioning fragile items, heavy items, speed, a height limit (mm), a weight limit (kg), or a SKU id.'
      : notes.map((n, i) => `${i + 1}. ${n}.`).join(' ');

  return { constraints, matched_rules: matched, explanation, parser: 'deterministic-rules' };
}
