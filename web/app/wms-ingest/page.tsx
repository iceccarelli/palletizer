"use client";

// /wms-ingest — the pilot-getter.
//
// A prospect pastes their real (messy) WMS/ERP CSV export. The page maps the
// columns onto our canonical schema, shows the mapping + confidence, then runs
// the real optimizer on the result. The pitch it makes concrete: "your export,
// a validated pallet plan, no custom integration."
//
// Honest framing baked into the copy: deterministic header matching, no
// deployments claimed, and a clear path to talk to a human.

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Upload, Wand2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ingestWmsCsv, IngestResult } from '@/lib/palletizer/wmsIngest';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import { WebPlan } from '@/lib/palletizer/types';

const SAMPLE = `Article,Long (mm),Breadth,Tall,Mass_kg
SKU-1001,400,300,200,6.4
SKU-1002,600,400,220,11.2
SKU-1003,300,200,150,3.1
SKU-1004,400,300,200,6.4
SKU-1005,500,330,180,7.8
SKU-1006,300,200,150,3.1
SKU-1007,600,400,220,11.2
SKU-1008,250,200,120,2.0`;

const FIELD_LABELS: Record<string, string> = {
  sku_id: 'SKU / item id',
  length_mm: 'Length (mm)',
  width_mm: 'Width (mm)',
  height_mm: 'Height (mm)',
  weight_kg: 'Weight (kg)',
};

export default function WmsIngestPage() {
  const [csv, setCsv] = useState(SAMPLE);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [plan, setPlan] = useState<WebPlan | null>(null);
  const [error, setError] = useState('');

  function runIngest() {
    setError('');
    setPlan(null);
    try {
      const res = ingestWmsCsv(csv);
      if (res.boxes.length === 0) {
        setError('No usable rows found. Check that the file has length/width/height columns.');
        setIngest(res);
        return;
      }
      setIngest(res);
    } catch {
      setError('Could not parse that CSV.');
    }
  }

  function runOptimize() {
    if (!ingest) return;
    const p = planFromBoxes(ingest.boxes, {}, undefined, `wms_${Date.now()}`);
    setPlan(p);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      setCsv(t);
      setIngest(null);
      setPlan(null);
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-widest text-emerald-400">WMS / ERP Ingestion</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Paste your export. Get a validated plan.</h1>
      <p className="mt-4 max-w-2xl text-white/60">
        Most palletizer integrations stall for months on data mapping. Paste a real CSV from your WMS
        or ERP — any column names — and watch it map to the packing engine and produce a plan. This
        runs entirely in your browser; nothing is uploaded.
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Input */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-white/80">1 · Your CSV export</h2>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-white/50 hover:text-white/80">
              <Upload className="h-3.5 w-3.5" /> Upload
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            spellCheck={false}
            className="h-64 w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-white/80 outline-none focus:border-emerald-500/50"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={runIngest}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
            >
              <Wand2 className="h-4 w-4" /> Map columns
            </button>
            <button
              onClick={() => {
                setCsv(SAMPLE);
                setIngest(null);
                setPlan(null);
              }}
              className="text-xs text-white/50 hover:text-white/80"
            >
              Reset sample
            </button>
          </div>
        </div>

        {/* Mapping */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="mb-3 text-sm font-medium text-white/80">2 · Detected mapping</h2>
          {!ingest && <p className="text-sm text-white/40">Map columns to see how your headers line up.</p>}
          {ingest && (
            <div className="space-y-2">
              {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map((field) => {
                const mappedTo = ingest.mapped[field as keyof typeof ingest.mapped];
                const conf = ingest.confidence[field as keyof typeof ingest.confidence];
                const ok = !!mappedTo;
                return (
                  <div key={field} className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs">
                    <span className="text-white/60">{FIELD_LABELS[field]}</span>
                    <span className="flex items-center gap-2">
                      {ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      <span className={ok ? 'font-mono text-white/80' : 'text-amber-400'}>
                        {mappedTo ?? 'unmapped'}
                      </span>
                      <span className="text-white/30">{conf.toFixed(2)}</span>
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-white/40">
                {ingest.boxes.length} rows parsed
                {ingest.rowsSkipped > 0 ? ` · ${ingest.rowsSkipped} skipped (missing dimensions)` : ''}
              </p>
              {ingest.boxes.length > 0 && (
                <button
                  onClick={runOptimize}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  Optimize these {ingest.boxes.length} boxes <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </p>
      )}

      {/* Result */}
      {plan && (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="mb-4 text-sm font-medium text-white/80">3 · Validated plan</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Boxes placed" value={`${plan.boxes.length}`} />
            <Metric label="Density uplift" value={`${plan.metrics.density_uplift_pct.toFixed(1)}%`} />
            <Metric label="Stability" value={plan.metrics.stability_score.toFixed(2)} />
            <Metric label="Layers" value={`${plan.metrics.num_layers}`} />
          </div>
          {plan.unplaced.length > 0 && (
            <p className="mt-4 text-xs text-amber-400">
              {plan.unplaced.length} SKU(s) did not fit within the pallet height/weight budget.
            </p>
          )}
          <p className="mt-4 text-xs text-white/40">
            Same engine that runs the interactive demos and the Python core. Numbers are computed from
            geometry, not assumed.
          </p>
        </div>
      )}

      {/* Honest CTA */}
      <div className="mt-12 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-8 text-center">
        <h2 className="text-2xl font-semibold">Want this against your real line?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/50">
          This demo maps columns deterministically in the browser. For a live line we wire the same
          mapping to your WMS via the agent layer. We&apos;re pre-revenue and looking for a first pilot
          partner — no deployments claimed yet.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/contact" className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90">
            Request a pilot
          </Link>
          <Link href="/demos?tab=robot" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:bg-white/5">
            See it execute
          </Link>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/30 p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-white/40">{label}</p>
    </div>
  );
}
