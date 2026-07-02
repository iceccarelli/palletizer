// POST /api/validate-stability
// Body: { placements: Placement[], pallet?: Partial<PalletSpec> }
//
// Server-side validation of an arbitrary (possibly hand-edited) layout.
// Same support-ratio + centre-of-mass model as the optimizer; proxied to the
// Python core when PALLETIZER_BACKEND_URL is configured.

import { NextRequest, NextResponse } from 'next/server';
import { validatePlacements } from '@/lib/palletizer/stability';
import { PalletSpec, Placement } from '@/lib/palletizer/types';

export const runtime = 'nodejs';

interface Body {
  placements: Placement[];
  pallet?: Partial<PalletSpec>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.placements)) {
    return NextResponse.json({ error: 'placements must be an array' }, { status: 400 });
  }

  const backend = process.env.PALLETIZER_BACKEND_URL;
  if (backend) {
    try {
      const res = await fetch(`${backend.replace(/\/$/, '')}/validate-stability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return NextResponse.json({ validation: await res.json(), engine: 'python-core' });
      }
    } catch {
      // fall through
    }
  }

  const validation = validatePlacements(body.placements, body.pallet);
  return NextResponse.json({ validation, engine: 'ts-port' });
}
