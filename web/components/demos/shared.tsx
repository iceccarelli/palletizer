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
  const lastDragValidate = useRef(0);

  const optimize = useCallback(
    (boxes: BoxSpec[], constraints: OptimizeConstraints = {}, planId?: string) => {
      const p = planFromBoxes(boxes, constraints, pallet, planId);
      setSkus(boxes);
      setPlan(p);
      setValidation(validatePlacements(p.boxes, pallet));
      setEdited(false);
      setSelected(null);
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
      setValidation(validatePlacements(placements, pallet));
      setEdited(true);
    },
    [plan, pallet],
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

export function MetricsRow({ plan, validation }: { plan: WebPlan; validation: StabilityValidation | null }) {
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
