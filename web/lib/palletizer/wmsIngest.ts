// Browser-side WMS CSV ingestion — a faithful TypeScript port of the
// deterministic header mapper in mcp/server.py (ingest_wms_csv).
//
// Honesty note: this mirrors the *intent* of the Python mapper (fuzzy header
// matching to a canonical Box schema) but uses a bigram-Dice similarity rather
// than Python's SequenceMatcher, so scores are close but not bit-identical.
// The Python MCP server remains the source of truth for agent/back-end use;
// this exists so the public demo runs with no backend. No LLM path here — the
// demo is fully deterministic and offline.

import { BoxSpec } from './types';

const FIELD_ALIASES: Record<keyof CanonicalFields, string[]> = {
  sku_id: ['sku', 'sku_id', 'item', 'item_id', 'product', 'product_id', 'material', 'article'],
  length_mm: ['length', 'length_mm', 'len', 'l', 'long_mm', 'depth', 'depth_mm', 'long'],
  width_mm: ['width', 'width_mm', 'wid', 'w', 'breadth'],
  height_mm: ['height', 'height_mm', 'hgt', 'h', 'tall'],
  weight_kg: ['weight', 'weight_kg', 'wt', 'mass', 'mass_kg', 'kg'],
};

interface CanonicalFields {
  sku_id: string | null;
  length_mm: string | null;
  width_mm: string | null;
  height_mm: string | null;
  weight_kg: string | null;
}

export interface IngestResult {
  boxes: BoxSpec[];
  mapped: CanonicalFields;
  confidence: Record<keyof CanonicalFields, number>;
  rowsSkipped: number;
  headers: string[];
}

function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[\s_-]+/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** Sorensen-Dice similarity on character bigrams, with exact-match short-circuit. */
function similarity(a: string, b: string): number {
  const na = a.toLowerCase().replace(/[\s_-]+/g, '');
  const nb = b.toLowerCase().replace(/[\s_-]+/g, '');
  if (na === nb) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((g) => {
    if (B.has(g)) inter++;
  });
  return (2 * inter) / (A.size + B.size);
}

function bestHeader(field: keyof CanonicalFields, headers: string[]): { header: string | null; score: number } {
  let best: string | null = null;
  let bestScore = 0;
  for (const h of headers) {
    for (const alias of FIELD_ALIASES[field]) {
      const s = similarity(h, alias);
      if (s > bestScore) {
        bestScore = s;
        best = h;
      }
    }
  }
  return { header: best, score: bestScore };
}

/** Minimal CSV parser: handles quoted fields and commas inside quotes. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

const THRESHOLD = 0.6;

export function ingestWmsCsv(text: string): IngestResult {
  const { headers, rows } = parseCsv(text);

  const mapped = {} as CanonicalFields;
  const confidence = {} as Record<keyof CanonicalFields, number>;
  (Object.keys(FIELD_ALIASES) as (keyof CanonicalFields)[]).forEach((field) => {
    const { header, score } = bestHeader(field, headers);
    mapped[field] = score >= THRESHOLD ? header : null;
    confidence[field] = Math.round(score * 100) / 100;
  });

  const idx = (h: string | null) => (h ? headers.indexOf(h) : -1);
  const iSku = idx(mapped.sku_id);
  const iL = idx(mapped.length_mm);
  const iW = idx(mapped.width_mm);
  const iH = idx(mapped.height_mm);
  const iWt = idx(mapped.weight_kg);

  const boxes: BoxSpec[] = [];
  let rowsSkipped = 0;
  rows.forEach((row, r) => {
    const L = parseFloat(row[iL]);
    const W = parseFloat(row[iW]);
    const H = parseFloat(row[iH]);
    if (!Number.isFinite(L) || !Number.isFinite(W) || !Number.isFinite(H)) {
      rowsSkipped++;
      return;
    }
    const wt = parseFloat(row[iWt]);
    boxes.push({
      sku_id: iSku >= 0 && row[iSku] ? row[iSku] : `ROW${r + 1}`,
      length_mm: L,
      width_mm: W,
      height_mm: H,
      weight_kg: Number.isFinite(wt) ? wt : 0,
    });
  });

  return { boxes, mapped, confidence, rowsSkipped, headers };
}
