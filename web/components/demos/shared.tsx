"use client";

import React, { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Download, CheckCircle, AlertTriangle, Wand2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BoxSpec,
  DEFAULT_PALLET,
  OptimizeConstraints,
  PalletSpec,
  Placement,
  StabilityValidation,
  WebPlan,
} from '@/lib/palletizer/types';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import {
  autoFixWorstBox,
  layerFromZ,
  settleZ,
  validatePlacements,
} from '@/lib/palletizer/stability';
import { downloadPlanJson, downloadUrscript } from '@/lib/palletizer/exports';
import type { SceneHandlePayload } from './InteractivePalletScene';

// 3D scenes are client-only (WebGL) — never server-render them.
export const Scene = dynamic(() => import('./InteractivePalletScene'), { ssr: false });
export const SettleScene = dynamic(() => import('./PhysicsSettleScene'), {
  ssr: false,
  loading: () => (
    <div className="h-[460px] flex items-center justify-center text-white/50 text-sm">
      Loading Rapier physics engine (WASM)…
    </div>
  ),
});
// Premium physics digital twin: real UR10e URDF + Rapier box dynamics + HDRI/SSAO.
export const RobotCell = dynamic(() => import('./UrdfRobotCell'), {
  ssr: false,
  loading: () => (
    <div className="h-[460px] flex items-center justify-center text-white/50 text-sm">
      Loading UR10e digital twin (URDF + physics)…
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Live plan state: optimize -> drag -> settle -> re-validate, all one hook.
// ---------------------------------------------------------------------------

export function recomputePlanFromPlacements(plan: WebPlan, placements: Placement[], pallet: PalletSpec): WebPlan {
  const val = validatePlacements(placements, pallet);
  const stackH = Math.max(0, ...placements.map((p) => p.z_mm + p.height_mm));
  const vol = placements.reduce((s, p) => s + p.length_mm * p.width_mm * p.height_mm, 0);
  const density = stackH > 0 ? vol / (pallet.length_mm * pallet.width_mm * stackH) : 0;
  return {
    ...plan,
    boxes: placements,
    metrics: {
      ...plan.metrics,
      num_layers: Math.max(0, ...placements.map((p) => p.layer)) + 1,
      volume_density: Math.round(density * 10000) / 10000,
      stability_score: val.stability_score,
      support_score: val.support_score,
      com_score: val.com_score,
      stack_height_mm: Math.round(stackH),
    },
    validation_report: {
      is_valid: val.is_stable,
      stability_pass: val.stability_score >= 0.6,
      recommendations: val.suggestions,
    },
  };
}

export function useLivePlan(pallet: PalletSpec = DEFAULT_PALLET) {
  const [skus, setSkus] = useState<BoxSpec[]>([]);
  const [plan, setPlan] = useState<WebPlan | null>(null);
  const [validation, setValidation] = useState<StabilityValidation | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [edited, setEdited] = useState(false);
  /** The engine's own result for the current SKUs — the score to beat. */
  const [engineBest, setEngineBest] = useState<{ stability: number; density: number } | null>(null);
  const beatAnnounced = useRef(false);
  const lastDragValidate = useRef(0);

  const optimize = useCallback(
    (boxes: BoxSpec[], constraints: OptimizeConstraints = {}, planId?: string) => {
      const p = planFromBoxes(boxes, constraints, pallet, planId);
      setSkus(boxes);
      setPlan(p);
      setValidation(validatePlacements(p.boxes, pallet));
      setEdited(false);
      setSelected(null);
      setEngineBest({ stability: p.metrics.stability_score, density: p.metrics.volume_density });
      beatAnnounced.current = false;
      return p;
    },
    [pallet],
  );

  /** Throttled live validation while a box is airborne. Colors update; plan is not committed. */
  const onDragMove = useCallback(
    ({ index, x_mm, y_mm }: SceneHandlePayload) => {
      if (!plan) return;
      const now = performance.now();
      if (now - lastDragValidate.current < 60) return;
      lastDragValidate.current = now;
      const candidate = [...plan.boxes];
      const moved = { ...candidate[index], x_mm, y_mm };
      moved.z_mm = settleZ(moved, index, candidate);
      candidate[index] = moved;
      setValidation(validatePlacements(candidate, pallet));
    },
    [plan, pallet],
  );

  /** Honest celebration: the shelf heuristic is good, not optimal — a human CAN beat it. */
  const maybeAnnounceBeat = useCallback(
    (next: WebPlan, v: StabilityValidation) => {
      if (!engineBest || beatAnnounced.current) return;
      const s = next.metrics.stability_score;
      const d = next.metrics.volume_density;
      // Density beats are celebrated (and persisted) by ScoreDuel in game.tsx;
      // this toast owns stability beats only, so the two never double-fire.
      void d;
      if (v.is_stable && s > engineBest.stability + 0.005) {
        beatAnnounced.current = true;
        toast.success('You beat the engine! 🏆', {
          description: `Your layout scores ${s.toFixed(3)} stability vs the engine's ${engineBest.stability.toFixed(3)} — same math, human intuition wins this round.`,
          duration: 7000,
        });
      }
    },
    [engineBest],
  );

  /** Commit: settle onto the highest supporting surface, re-derive layer, re-validate everything. */
  const onDragEnd = useCallback(
    ({ index, x_mm, y_mm }: SceneHandlePayload) => {
      if (!plan) return;
      const placements = [...plan.boxes];
      const moved = { ...placements[index], x_mm, y_mm };
      moved.z_mm = settleZ(moved, index, placements);
      moved.layer = layerFromZ(moved.z_mm, placements.filter((_, i) => i !== index));
      placements[index] = moved;
      const next = recomputePlanFromPlacements(plan, placements, pallet);
      setPlan(next);
      const v = validatePlacements(placements, pallet);
      setValidation(v);
      setEdited(true);
      maybeAnnounceBeat(next, v);
    },
    [plan, pallet, maybeAnnounceBeat],
  );

  const autoFix = useCallback(() => {
    if (!plan) return;
    const fix = autoFixWorstBox(plan.boxes, pallet);
    if (!fix) {
      toast.info('Nothing to fix — every box has ≥ 80% base support.');
      return;
    }
    const next = recomputePlanFromPlacements(plan, fix.placements, pallet);
    setPlan(next);
    setValidation(validatePlacements(fix.placements, pallet));
    setEdited(true);
    toast.success(`Moved ${fix.moved} to a fully supported position`, {
      description: `(${fix.from.x_mm.toFixed(0)}, ${fix.from.y_mm.toFixed(0)}, ${fix.from.z_mm.toFixed(0)}) → (${fix.to.x_mm.toFixed(0)}, ${fix.to.y_mm.toFixed(0)}, ${fix.to.z_mm.toFixed(0)}) mm — found by support-ratio search, same math as the score.`,
    });
  }, [plan, pallet]);

  const setPlacements = useCallback(
    (placements: Placement[]) => {
      if (!plan) return;
      const next = recomputePlanFromPlacements(plan, placements, pallet);
      setPlan(next);
      setValidation(validatePlacements(placements, pallet));
      setEdited(true);
    },
    [plan, pallet],
  );

  return {
    skus,
    plan,
    setPlan,
    engineBest,
    validation,
    selected,
    setSelected,
    edited,
    optimize,
    onDragMove,
    onDragEnd,
    autoFix,
    setPlacements,
    pallet,
  };
}

// ---------------------------------------------------------------------------
// UI blocks shared by every demo
// ---------------------------------------------------------------------------

export function MetricsRow({
  plan,
  validation,
  engineBest,
  edited,
}: {
  plan: WebPlan;
  validation: StabilityValidation | null;
  engineBest?: { stability: number; density: number } | null;
  edited?: boolean;
}) {
  const m = plan.metrics;
  const cells = [
    {
      label: 'Density',
      value: `${(m.volume_density * 100).toFixed(1)}%`,
      sub: m.density_uplift_pct !== 0 ? `${m.density_uplift_pct > 0 ? '+' : ''}${m.density_uplift_pct}% vs naive` : 'vs naive baseline',
    },
    {
      label: 'Stability',
      value: m.stability_score.toFixed(2),
      sub: `support ${m.support_score.toFixed(2)} • CoM ${m.com_score.toFixed(2)}`,
      alert: validation ? !validation.is_stable : false,
    },
    { label: 'Boxes / Layers', value: `${m.num_boxes} / ${m.num_layers}`, sub: `${m.unique_skus} SKUs • ${m.total_weight_kg.toFixed(0)} kg` },
    {
      label: 'Robot Cycle',
      value: `${m.est_robot_cycle_s.toFixed(0)} s`,
      sub: `${m.rotations_90} × 90° rotations`,
    },
    { label: 'Stack Height', value: `${m.stack_height_mm.toFixed(0)} mm`, sub: plan.engine === 'python-core' ? 'python core' : 'TS engine (same math)' },
  ];
  return (
    <>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cells.map((c, i) => (
        <div key={i} className={`glass p-4 rounded-2xl border ${c.alert ? 'border-red-500/50' : 'border-white/10'}`}>
          <div className="text-[10px] text-white/50 tracking-widest uppercase">{c.label}</div>
          <div className={`text-2xl md:text-3xl font-mono font-semibold tracking-tighter mt-0.5 ${c.alert ? 'text-red-400' : ''}`}>
            {c.value}
          </div>
          <div className={`text-xs mt-0.5 ${c.alert ? 'text-red-400' : 'text-emerald-400'}`}>{c.sub}</div>
        </div>
      ))}
    </div>
      {edited && engineBest && (
        <ScoreDuel
          engine={engineBest}
          you={{ stability: plan.metrics.stability_score, density: plan.metrics.volume_density }}
        />
      )}
    </>
  );
}

export function ValidationBanner({ validation }: { validation: StabilityValidation | null }) {
  if (!validation) return null;
  const ok = validation.is_stable;
  return (
    <div
      className={`p-4 rounded-2xl border flex items-start gap-3 ${
        ok ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-red-500/40 bg-red-950/20'
      }`}
    >
      {ok ? (
        <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
      )}
      <div className="text-sm">
        <div className="font-semibold">
          {ok ? 'STABLE' : 'UNSTABLE'} — score {validation.stability_score.toFixed(3)} • CoM offset{' '}
          {(validation.com_offset_norm * 100).toFixed(0)}% of half-diagonal
        </div>
        {validation.warnings.length > 0 && (
          <ul className="text-white/70 mt-1 space-y-0.5">
            {validation.warnings.slice(0, 3).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
            {validation.warnings.length > 3 && <li>• +{validation.warnings.length - 3} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SuggestionsPanel({
  validation,
  onAutoFix,
  onReoptimize,
}: {
  validation: StabilityValidation | null;
  onAutoFix?: () => void;
  onReoptimize?: () => void;
}) {
  return (
    <div className="glass p-5 rounded-2xl border border-white/10">
      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Wand2 className="w-4 h-4 text-emerald-400" /> Suggested fixes
        <span className="text-[9px] font-mono text-white/40 tracking-widest ml-auto">COMPUTED FROM GEOMETRY</span>
      </div>
      {validation && validation.suggestions.length > 0 ? (
        <ul className="text-xs text-white/70 space-y-1.5 mb-3">
          {validation.suggestions.slice(0, 4).map((s, i) => (
            <li key={i}>• {s}</li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-white/50 mb-3">No issues detected — layout is within tolerances.</div>
      )}
      <div className="flex gap-2">
        {onAutoFix && (
          <button
            onClick={onAutoFix}
            className="flex-1 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition"
          >
            Auto-fix worst box
          </button>
        )}
        {onReoptimize && (
          <button
            onClick={onReoptimize}
            className="flex-1 py-2 text-xs border border-white/20 hover:bg-white/5 rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" /> Re-optimize
          </button>
        )}
      </div>
    </div>
  );
}

export function ExportRow({ plan, edited }: { plan: WebPlan; edited?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={() => {
          downloadPlanJson(plan);
          toast.success('Plan JSON downloaded', { description: `${plan.plan_id}.json` });
        }}
        className="flex-1 min-w-[180px] flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 rounded-2xl text-sm font-medium transition"
      >
        <Download className="w-4 h-4" /> Plan JSON{edited ? ' (edited)' : ''}
      </button>
      <button
        onClick={() => {
          downloadUrscript(plan);
          toast.success('URScript downloaded', { description: `${plan.plan_id}.urscript` });
        }}
        className="flex-1 min-w-[180px] flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 rounded-2xl text-sm font-medium transition"
      >
        <Download className="w-4 h-4" /> URScript (Robot)
      </button>
    </div>
  );
}

export function PilotCTA({ plan }: { plan: WebPlan | null }) {
  const params = plan
    ? `?plan=${encodeURIComponent(plan.plan_id)}&stability=${plan.metrics.stability_score}&density=${plan.metrics.volume_density}`
    : '';
  return (
    <div className="glass p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10">
      <div className="text-sm font-semibold">Want this running on your line?</div>
      <div className="text-xs text-white/60 mt-1 mb-3">
        We deploy the same open-source core with hardware integration, safety validation, and support.
      </div>
      <Link
        href={`/contact${params}`}
        className="block text-center py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition"
      >
        Request a pilot →
      </Link>
    </div>
  );
}

/**
 * The honest game loop: your edited layout vs the engine's own result, scored
 * by the exact same math. The engine is a good heuristic, not an oracle —
 * beating it is genuinely possible and genuinely means something.
 */
export function ScoreDuel({
  engine,
  you,
}: {
  engine: { stability: number; density: number };
  you: { stability: number; density: number };
}) {
  const dS = you.stability - engine.stability;
  const dD = you.density - engine.density;
  const winning = dS > 0.005 || dD > 0.005;
  const tied = Math.abs(dS) <= 0.005 && Math.abs(dD) <= 0.005;
  const Bar = ({ label, engineV, youV, fmt }: { label: string; engineV: number; youV: number; fmt: (n: number) => string }) => {
    const max = Math.max(engineV, youV, 0.0001);
    return (
      <div className="flex-1 min-w-[220px]">
        <div className="text-[10px] tracking-[2px] text-white/50 mb-1">{label}</div>
        {[
          { tag: 'ENGINE', v: engineV, cls: 'bg-white/25' },
          { tag: 'YOU', v: youV, cls: youV >= engineV ? 'bg-emerald-500' : 'bg-amber-500' },
        ].map((r) => (
          <div key={r.tag} className="flex items-center gap-2 mb-1">
            <span className="w-12 text-[10px] text-white/50">{r.tag}</span>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${r.cls} transition-all duration-500`} style={{ width: `${(r.v / max) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-xs font-mono">{fmt(r.v)}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className={`mt-3 p-4 rounded-2xl border flex flex-wrap gap-6 items-center ${winning ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/10 bg-white/[0.03]'}`}>
      <div className="min-w-[120px]">
        <div className="text-[10px] tracking-[2px] text-white/50">YOU vs ENGINE</div>
        <div className={`text-sm font-semibold ${winning ? 'text-emerald-400' : tied ? 'text-white/70' : 'text-amber-400'}`}>
          {winning ? 'You\u2019re ahead 🏆' : tied ? 'Dead heat' : 'Engine leads'}
        </div>
        <div className="text-[10px] text-white/40 mt-0.5">Same math scores both</div>
      </div>
      <Bar label="STABILITY" engineV={engine.stability} youV={you.stability} fmt={(n) => n.toFixed(3)} />
      <Bar label="DENSITY" engineV={engine.density} youV={you.density} fmt={(n) => `${(n * 100).toFixed(1)}%`} />
    </div>
  );
}
