"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { DemoProduction, DemoEcomm, DemoStress, DemoMultiPallet, DemoRobot, DemoTwin } from '@/components/demos/Demos';
import { ProgressMeter, useHydrated } from '@/components/demos/game';
import { missionForDemo, useProgress } from '@/lib/palletizer/progress';

const TABS = [
  { id: 'main', label: 'Production Interactive', desc: 'Drag boxes • live re-validation', C: DemoProduction,
    challenge: 'Drag any box and watch the score react. Beat the engine\u2019s stability or density and the scoreboard tells you — same math judges both of you.' },
  { id: 'ecomm', label: 'High-Mix E-comm', desc: '36 SKUs • speed vs density', C: DemoEcomm,
    challenge: 'Flip High-Velocity mode and read the measured trade-off: how much density would you pay for a faster robot cycle?' },
  { id: 'stress', label: 'Stress Test & Recovery', desc: 'Break it • rigid-body settle', C: DemoStress,
    challenge: 'Sabotage the pharma load, then run the physics drop test and watch it fail for real. Can the constraints save it?' },
  { id: 'multi', label: 'Multi-Pallet What-If', desc: 'Order splitting live', C: DemoMultiPallet,
    challenge: 'Send boxes between pallet A and B — both re-optimize instantly. Find a split the overflow logic didn\u2019t.' },
  { id: 'robot', label: 'Robot Execution', desc: 'Animated picks • edit mid-run', C: DemoRobot,
    challenge: 'Pause the robot mid-build, move a placed box, and export URScript for only the remaining picks.' },
  { id: 'twin', label: 'Digital Twin + Co-Pilot', desc: 'NL constraints • hybrid parser', C: DemoTwin,
    challenge: 'Type \u201cprotect the glass and keep it under 1200mm\u201d — watch it become constraints, then a re-planned pallet.' },
] as const;

export default function DemosPage() {
  const [active, setActive] = useState<string>('main');

  // Deep links from header/footer: /demos?tab=stress etc.
  React.useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && TABS.some((t) => t.id === tab)) setActive(tab);
  }, []);
  const Active = TABS.find((t) => t.id === active)!.C;
  const hydrated = useHydrated();
  const completedRaw = useProgress((s) => s.completed);
  const completed = hydrated ? completedRaw : ({} as Record<string, number>);

  return (
    <div className="min-h-screen bg-[#0f172a] pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 bg-primary/10 text-primary text-xs tracking-[2px] rounded">INTERACTIVE DEMO SUITE</div>
              <div className="text-xs text-white/50 hidden md:block">
                SAME ALGORITHM AS THE PYTHON CORE • EVERY METRIC DERIVED FROM GEOMETRY
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter">Prove it to yourself</h1>
            <p className="text-white/60 mt-1 max-w-2xl text-sm md:text-base">
              Grab boxes. Break loads. Watch the score react. Everything on this page runs the real packing and
              stability math from the open-source core — no canned animations, no invented numbers.
            </p>
            <div className="mt-3">
              <ProgressMeter onNavigate={setActive} />
            </div>
          </div>
          <Link
            href="https://github.com/iceccarelli/palletizer"
            target="_blank"
            className="text-sm px-5 py-2 border border-white/20 rounded-2xl hover:bg-white/5 transition"
          >
            View Full Python Source →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-white/10 pb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-4 py-2 text-sm rounded-full transition-all ${
                active === t.id ? 'bg-white text-black font-medium' : 'bg-white/5 hover:bg-white/10 text-white/70'
              }`}
            >
              {completed[missionForDemo(t.id).id] && <span className="text-emerald-500 mr-1">✓</span>}
              {t.label}
              <span className="text-[10px] opacity-50 hidden lg:inline"> • {t.desc}</span>
            </button>
          ))}
        </div>

        <div className="mb-4 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-sm text-white/70 flex items-center gap-3">
          <span className="text-emerald-400 font-semibold text-xs tracking-[2px] shrink-0">TRY THIS</span>
          {TABS.find((t) => t.id === active)!.challenge}
        </div>

        <Active key={active} />

        <div className="mt-10 text-center text-[11px] text-white/40 max-w-xl mx-auto">
          Frontend engine is a function-for-function TypeScript port of{' '}
          <code className="text-white/60">palletizer_full/optimizer.py</code>. Deployed cells use the Python core as
          the source of truth via the same API contract (<code className="text-white/60">/api/optimize</code>,{' '}
          <code className="text-white/60">/api/validate-stability</code>, <code className="text-white/60">/api/adapt-plan</code>).
        </div>
      </div>
    </div>
  );
}
