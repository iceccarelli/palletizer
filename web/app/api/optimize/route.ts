// POST /api/optimize
// Body: { skus: BoxSpec[], constraints?: OptimizeConstraints, pallet?: Partial<PalletSpec> }
//
// If PALLETIZER_BACKEND_URL is set (FastAPI bridge in gateway/demo_api.py),
// the request is proxied to the Python core — the authoritative engine.
// Otherwise the TypeScript port runs server-side; it is the same algorithm,
// so results are identical either way. The response says which engine ran.

import { NextRequest, NextResponse } from 'next/server';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import { BoxSpec, OptimizeConstraints, PalletSpec } from '@/lib/palletizer/types';

export const runtime = 'nodejs';

interface Body {
  skus: BoxSpec[];
  constraints?: OptimizeConstraints;
  pallet?: Partial<PalletSpec>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.skus) || body.skus.length === 0) {
    return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 });
  }
  if (body.skus.length > 500) {
    return NextResponse.json({ error: 'Max 500 SKUs per request' }, { status: 400 });
  }

  const backend = process.env.PALLETIZER_BACKEND_URL;
  if (backend) {
    try {
      const res = await fetch(`${backend.replace(/\/$/, '')}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const plan = await res.json();
        return NextResponse.json({ plan: { ...plan, engine: 'python-core' } });
      }
    } catch {
      // fall through to TS engine — identical math
    }
  }

  const plan = planFromBoxes(body.skus, body.constraints ?? {}, body.pallet, `plan_${Date.now()}`);
  return NextResponse.json({ plan });
}
