// POST /api/adapt-plan
// Body: { prompt: string, skus: BoxSpec[], current_constraints?: OptimizeConstraints, pallet?: Partial<PalletSpec> }
//
// The Co-Pilot backend path. Architecture (deliberately conservative):
//   1. The natural-language prompt is parsed into the STRICT constraint schema.
//      - With ANTHROPIC_API_KEY set: an LLM does the parsing (parser: "llm").
//      - Without it: the deterministic rule parser runs (parser: "deterministic-rules").
//   2. The SAME deterministic optimizer re-runs with those constraints.
// The LLM never places boxes and never produces metrics — it only selects
// constraints, which are validated and clamped before use. Every number in
// the returned plan is derived from geometry.

import { NextRequest, NextResponse } from 'next/server';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import { parseConstraints } from '@/lib/palletizer/copilot';
import { BoxSpec, OptimizeConstraints, PalletSpec } from '@/lib/palletizer/types';

export const runtime = 'nodejs';

interface Body {
  prompt: string;
  skus: BoxSpec[];
  current_constraints?: OptimizeConstraints;
  pallet?: Partial<PalletSpec>;
}

const LLM_SYSTEM = `You translate a warehouse operator's sentence into palletizing constraints.
Respond with ONLY a JSON object (no markdown, no prose) with any of these optional keys:
{"heavy_low": bool, "fragile_high": bool, "fragile_threshold": number 0-1, "protect_sku_ids": string[], "speed_mode": bool, "max_height_mm": number 300-1800, "max_weight_kg": number 50-1000}
Include only keys the sentence justifies. If nothing applies, return {}.
Also include a key "reasoning": a single short sentence explaining the mapping in plain language.`;

function sanitize(raw: Record<string, unknown>): OptimizeConstraints {
  const c: OptimizeConstraints = {};
  if (typeof raw.heavy_low === 'boolean') c.heavy_low = raw.heavy_low;
  if (typeof raw.fragile_high === 'boolean') c.fragile_high = raw.fragile_high;
  if (typeof raw.fragile_threshold === 'number') c.fragile_threshold = Math.min(1, Math.max(0, raw.fragile_threshold));
  if (typeof raw.speed_mode === 'boolean') c.speed_mode = raw.speed_mode;
  if (typeof raw.max_height_mm === 'number') c.max_height_mm = Math.min(1800, Math.max(300, Math.round(raw.max_height_mm)));
  if (typeof raw.max_weight_kg === 'number') c.max_weight_kg = Math.min(1000, Math.max(50, Math.round(raw.max_weight_kg)));
  if (Array.isArray(raw.protect_sku_ids)) {
    const ids = raw.protect_sku_ids.filter((s): s is string => typeof s === 'string' && /^SKU\d{3}$/i.test(s));
    if (ids.length) c.protect_sku_ids = ids.map((s) => s.toUpperCase());
  }
  return c;
}

async function parseWithLlm(prompt: string, skuIds: string[]): Promise<{ constraints: OptimizeConstraints; reasoning: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.COPILOT_MODEL ?? 'claude-haiku-4-5',
        max_tokens: 300,
        system: LLM_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Available SKU ids: ${skuIds.join(', ')}\nOperator says: "${prompt}"`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Constraints selected by LLM parser.';
    delete parsed.reasoning;
    return { constraints: sanitize(parsed), reasoning };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.prompt !== 'string' || body.prompt.length === 0 || body.prompt.length > 500) {
    return NextResponse.json({ error: 'prompt must be a 1–500 char string' }, { status: 400 });
  }
  if (!Array.isArray(body.skus) || body.skus.length === 0) {
    return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 });
  }

  const skuIds = body.skus.map((s: BoxSpec) => s.sku_id);
  const llm = await parseWithLlm(body.prompt, skuIds);

  let constraints: OptimizeConstraints;
  let explanation: string;
  let parser: 'llm' | 'deterministic-rules';

  if (llm) {
    constraints = { ...(body.current_constraints ?? {}), ...llm.constraints };
    explanation = llm.reasoning;
    parser = 'llm';
  } else {
    const parsed = parseConstraints(body.prompt);
    constraints = { ...(body.current_constraints ?? {}), ...parsed.constraints };
    explanation = parsed.explanation;
    parser = 'deterministic-rules';
  }

  const plan = planFromBoxes(body.skus, constraints, body.pallet, `plan_adapted_${Date.now()}`);

  return NextResponse.json({ plan, constraints, explanation, parser });
}
