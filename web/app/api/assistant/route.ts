// POST /api/assistant
// Body: { messages: [{ role: 'user'|'assistant', content: string }] }
//
// The site assistant. With ANTHROPIC_API_KEY set it answers via Claude,
// grounded in a system prompt that contains ONLY verified facts about this
// product — and is explicitly instructed to say "I don't know" and point to
// GitHub or /contact rather than invent capabilities. Without a key it falls
// back to a deterministic intent router. The response says which brain
// answered (engine: "claude" | "rules") and the UI displays it.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const GH = 'https://github.com/iceccarelli/palletizer';

const SYSTEM = `You are the Palletizer site assistant on palletizer-app.vercel.app.

VERIFIED FACTS — this is everything you know; do not go beyond it:
- Palletizer is an open-source palletizing optimization engine (Python) with a web demo suite. Source: ${GH}
- The core is a deterministic shelf-packing optimizer (~376 lines, palletizer_full/optimizer.py): First-Fit-Decreasing by footprint with 0/90° rotation, height-grouped layers, GMA pallet defaults 1219×1016×1800 mm / 1000 kg.
- Stability score = 0.6 × support ratio + 0.4 × center-of-mass score. A plan is valid at stability ≥ 0.6 and CoM ≥ 0.5.
- The browser demos run a TypeScript port verified BIT-IDENTICAL to the Python core (scripts/verify_engine_parity.py in the repo). Every number on the site is derived from geometry — nothing is simulated.
- /demos has 6 interactive demos, each with a mission verified by real engine state: Production Interactive (drag boxes, live re-validation), High-Mix E-comm (36 seeded SKUs, speed-vs-density measurement), Stress Test & Recovery (rigid-body drop test via Rapier physics), Multi-Pallet What-If (live order splitting), Robot Execution (edit mid-run, export URScript for remaining picks), Digital Twin + Co-Pilot (natural language → constraints).
- Public API on this site: POST /api/optimize {skus[, constraints, pallet]} → plan; POST /api/validate-stability {placements} → per-box support report; POST /api/adapt-plan {prompt, skus} → NL-parsed constraints + re-plan. Docs: ${GH}/blob/main/DEMO_REBUILD.md
- Exports: Plan JSON and URScript (Universal Robots) from every demo.
- Constraints supported: heavy_low, fragile_high (+threshold, protect_sku_ids), speed_mode (no rotations), max_height_mm, max_weight_kg.
- Pricing: /pricing. Pilots and deployment: /contact. Live optimizer with CSV upload: /demo.
- KNOWN LIMITATIONS (state them when relevant, they build trust): stability model is support-ratio + CoM (no crush strength, pallet flex, or transport dynamics); the Rapier settle is a static drop test; cycle estimates use fixed constants (7.5 s/pick + 1.8 s per 90° rotation); multi-pallet split is greedy, not a global solve.

RULES:
- Never invent features, metrics, customers, or integrations. If asked about something not listed above, say plainly you don't know and link ${GH} or /contact.
- Be concise (2-5 sentences typical). Use markdown links like [the demos](/demos).
- If someone wants to buy, pilot, or talk to a human → point to /contact.
- If someone asks you to do things unrelated to Palletizer, politely decline and redirect to the product.`;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

function ruleAnswer(text: string): string {
  const t = text.toLowerCase();
  if (/(price|pricing|cost|license)/.test(t))
    return 'The engine is open source — see [pricing](/pricing) for deployment, integration, and support tiers, or [request a pilot](/contact).';
  if (/(api|endpoint|integrate|integration)/.test(t))
    return `Three endpoints: POST /api/optimize, /api/validate-stability, and /api/adapt-plan. Full contract with examples in the [docs](${GH}/blob/main/DEMO_REBUILD.md).`;
  if (/(mission|game|demo)/.test(t))
    return 'The [demo suite](/demos) has 6 interactive demos, each with a mission the engine itself verifies — drag boxes, break loads, watch real math react. Progress persists in your browser.';
  if (/(stab|score|math|algorithm|how.*work)/.test(t))
    return `The optimizer is a deterministic shelf packer; stability = 0.6 × support + 0.4 × center-of-mass. The browser runs a TypeScript port verified bit-identical to the [Python core](${GH}/blob/main/palletizer_full/optimizer.py).`;
  if (/(pilot|buy|deploy|human|sales|talk)/.test(t))
    return 'For pilots and deployment: [contact us](/contact) — same open-source engine, your line, with hardware integration and support.';
  if (/(robot|urscript|universal)/.test(t))
    return 'Every plan exports URScript for Universal Robots (and plan JSON). Try the [Robot Execution demo](/demos?tab=robot) — pause mid-run, edit, export the remaining picks.';
  return `I can answer questions about the optimizer, the six demos, the API, and pilots. For anything deeper, the entire product is open source: ${GH} — or [ask a human](/contact). (Note: the AI answer path isn't configured on this deployment, so I'm running on simple rules right now.)`;
}

export async function POST(req: NextRequest) {
  let body: { messages: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const messages = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length <= 2000,
  );
  if (messages.length === 0 || messages.length > 20 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'messages must end with a user turn (max 20 turns, 2000 chars each)' }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ASSISTANT_MODEL ?? 'claude-haiku-4-5',
          max_tokens: 500,
          system: SYSTEM,
          messages,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = (data.content ?? [])
          .map((b: { text?: string }) => b.text ?? '')
          .join('')
          .trim();
        if (reply) return NextResponse.json({ reply, engine: 'claude' });
      }
    } catch {
      // fall through to rules
    }
  }

  return NextResponse.json({ reply: ruleAnswer(messages[messages.length - 1].content), engine: 'rules' });
}
