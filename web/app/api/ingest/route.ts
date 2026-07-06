// POST /api/ingest
// Body: { csv_text: string }
// Returns the canonical Box mapping for an arbitrary WMS CSV export.
//
// This is the browser-facing entry to the same idea as the MCP tool
// `ingest_wms_csv` (mcp/server.py): map a messy export onto our Box schema so
// it can go straight into /api/optimize. Deterministic, offline, no LLM.

import { NextRequest, NextResponse } from 'next/server';
import { ingestWmsCsv } from '@/lib/palletizer/wmsIngest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { csv_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body.csv_text !== 'string' || body.csv_text.trim().length === 0) {
    return NextResponse.json({ error: 'csv_text must be a non-empty string' }, { status: 400 });
  }
  if (body.csv_text.length > 500_000) {
    return NextResponse.json({ error: 'CSV too large for the demo (max ~500 KB)' }, { status: 400 });
  }
  const result = ingestWmsCsv(body.csv_text);
  return NextResponse.json(result);
}
