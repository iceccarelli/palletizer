"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Play, Pause, Zap, FlaskConical, ArrowRight, Bot, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  BoxSpec,
  DEFAULT_PALLET,
  OptimizeConstraints,
  Placement,
  StabilityValidation,
  WebPlan,
} from '@/lib/palletizer/types';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import { validatePlacements } from '@/lib/palletizer/stability';
import { parseConstraints } from '@/lib/palletizer/copilot';
import { urscriptFor, downloadText } from '@/lib/palletizer/exports';
import { BEVERAGE_SKUS, PHARMA_SKUS, ecommChaosSkus, multiPalletSkus, parseSkuCsv } from '@/lib/palletizer/sampleData';
import {
  ExportRow,
  MetricsRow,
  PilotCTA,
  Scene,
  SettleScene,
  SuggestionsPanel,
  ValidationBanner,
  useLivePlan,
} from './shared';
import type { SettleResult } from './PhysicsSettleScene';
import type { RobotAnim } from './InteractivePalletScene';

// ---------------------------------------------------------------------------
// Demo 0 — Production Interactive: CSV in, real optimizer, drag + live re-validation
// ---------------------------------------------------------------------------

export function DemoProduction() {
  const live = useLivePlan();
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);

  const runViaApi = useCallback(
    async (boxes: BoxSpec[], constraints: OptimizeConstraints = {}) => {
      setLoading(true);
      try {
        const res = await fetch('/api/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: boxes, constraints }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data: { plan: WebPlan } = await res.json();
        live.setPlan(data.plan);
        // hydrate live state from API result
        live.optimize(boxes, constraints, data.plan.plan_id);
        toast.success('Optimization complete', {
          description: `${data.plan.metrics.num_boxes} boxes • ${(data.plan.metrics.volume_density * 100).toFixed(1)}% density • stability ${data.plan.metrics.stability_score.toFixed(2)} (${data.plan.engine})`,
        });
      } catch {
        // Offline / static export: identical math client-side.
        const p = live.optimize(boxes, constraints);
        toast.success('Optimization complete (client engine)', {
          description: `${p.metrics.num_boxes} boxes • ${(p.metrics.volume_density * 100).toFixed(1)}% density • stability ${p.metrics.stability_score.toFixed(2)}`,
        });
      } finally {
        setLoading(false);
      }
    },
    [live],
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const boxes = parseSkuCsv(String(ev.target?.result ?? ''));
      setFileName(file.name);
      toast.success(`${boxes.length} SKUs loaded from ${file.name}`);
      runViaApi(boxes);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {!live.plan ? (
        <div className="glass p-8 rounded-3xl border border-white/10 max-w-2xl mx-auto">
          <h3 className="font-semibold text-xl mb-2 flex items-center gap-2">
            <Upload className="w-5 h-5" /> Upload SKU data (CSV)
          </h3>
          <p className="text-sm text-white/60 mb-4">
            Columns: sku_id, length_mm, width_mm, height_mm, weight_kg (fragility optional). The plan you get is
            computed by the same algorithm as the Python core — placements, density, and stability are all derived
            from geometry.
          </p>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/30 hover:border-primary/60 rounded-2xl py-8 cursor-pointer transition">
            <Upload className="w-7 h-7 mb-2 text-white/60" />
            <span className="font-medium">Drop CSV or click to upload</span>
            <input type="file" accept=".csv" onChange={onFile} className="hidden" />
          </label>
          {fileName && <div className="mt-2 text-emerald-400 text-xs">{fileName} loaded</div>}
          <button
            onClick={() => runViaApi(BEVERAGE_SKUS)}
            disabled={loading}
            className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-60 font-semibold rounded-2xl transition"
          >
            {loading ? 'Optimizing…' : (<><Zap className="w-4 h-4" /> Run with sample beverage SKUs</>)}
          </button>
        </div>
      ) : (
        <>
          <MetricsRow plan={live.plan} validation={live.validation} />
          <div className="grid lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 glass rounded-3xl border border-white/10 overflow-hidden">
              <Scene
                boxes={live.plan.boxes}
                perBox={live.validation?.per_box}
                selectedIndex={live.selected}
                onSelect={live.setSelected}
                onDragMove={live.onDragMove}
                onDragEnd={live.onDragEnd}
                cog={live.validation?.center_of_gravity}
                labelAll
              />
            </div>
            <div className="lg:col-span-4 space-y-4">
              <ValidationBanner validation={live.validation} />
              <SuggestionsPanel
                validation={live.validation}
                onAutoFix={live.autoFix}
                onReoptimize={() => runViaApi(live.skus)}
              />
              <ExportRow plan={live.plan} edited={live.edited} />
              <PilotCTA plan={live.plan} />
            </div>
          </div>
          <p className="text-[11px] text-white/40">
            Drag any box: it settles onto the highest supporting surface and the whole load is re-scored with the
            same support-ratio + centre-of-mass model the optimizer uses (0.6·support + 0.4·CoM). Nothing here is a
            canned animation.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo 1 — High-Mix E-commerce Chaos: 36 varied SKUs, build animation, speed-vs-density
// ---------------------------------------------------------------------------

export function DemoEcomm() {
  const live = useLivePlan();
  const [speedMode, setSpeedMode] = useState(false);
  const [visible, setVisible] = useState(0);
  const [building, setBuilding] = useState(false);

  const skus = useMemo(() => ecommChaosSkus(36, 42), []);
  const bothPlans = useMemo(
    () => ({
      normal: planFromBoxes(skus, {}, undefined, 'plan_ecomm_dense'),
      fast: planFromBoxes(skus, { speed_mode: true }, undefined, 'plan_ecomm_fast'),
    }),
    [skus],
  );

  useEffect(() => {
    live.optimize(skus, speedMode ? { speed_mode: true } : {}, speedMode ? 'plan_ecomm_fast' : 'plan_ecomm_dense');
    setVisible(0);
    setBuilding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedMode]);

  useEffect(() => {
    if (!building || !live.plan) return;
    if (visible >= live.plan.boxes.length) {
      setBuilding(false);
      return;
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 140);
    return () => clearTimeout(t);
  }, [building, visible, live.plan]);

  if (!live.plan) return null;
  const delta = {
    density: (bothPlans.normal.metrics.volume_density - bothPlans.fast.metrics.volume_density) * 100,
    cycle: bothPlans.normal.metrics.est_robot_cycle_s - bothPlans.fast.metrics.est_robot_cycle_s,
  };

  return (
    <div className="space-y-4">
      <MetricsRow plan={live.plan} validation={live.validation} />
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 glass rounded-3xl border border-white/10 overflow-hidden">
          <Scene
            boxes={live.plan.boxes}
            perBox={live.validation?.per_box}
            selectedIndex={live.selected}
            onSelect={live.setSelected}
            onDragMove={live.onDragMove}
            onDragEnd={live.onDragEnd}
            cog={live.validation?.center_of_gravity}
            visibleCount={visible}
          />
        </div>
        <div className="lg:col-span-4 space-y-4">
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-3">Throughput vs density — measured, not marketed</div>
            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span>High-velocity mode (no 90° rotations)</span>
              <input type="checkbox" checked={speedMode} onChange={(e) => setSpeedMode(e.target.checked)} className="accent-emerald-500 w-4 h-4" />
            </label>
            <div className="mt-3 text-xs text-white/60 space-y-1 font-mono">
              <div>dense: {(bothPlans.normal.metrics.volume_density * 100).toFixed(1)}% • {bothPlans.normal.metrics.est_robot_cycle_s.toFixed(0)}s cycle</div>
              <div>fast: &nbsp;{(bothPlans.fast.metrics.volume_density * 100).toFixed(1)}% • {bothPlans.fast.metrics.est_robot_cycle_s.toFixed(0)}s cycle</div>
              <div className="text-emerald-400 pt-1">
                Δ {delta.density.toFixed(1)} pts density for {delta.cycle.toFixed(0)}s of cycle time
              </div>
            </div>
            <div className="text-[10px] text-white/40 mt-2">
              Both plans are computed live from the same 36-SKU seeded dataset. Cycle estimate = 7.5 s per pick + 1.8 s
              per 90° wrist rotation.
            </div>
            <button
              onClick={() => {
                setVisible(0);
                setBuilding(true);
              }}
              className="mt-3 w-full py-2 text-xs border border-white/20 hover:bg-white/5 rounded-xl transition"
            >
              Replay layer-by-layer build
            </button>
          </div>
          <ValidationBanner validation={live.validation} />
          <ExportRow plan={live.plan} edited={live.edited} />
          <PilotCTA plan={live.plan} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo 2 — Physics Stress Test & Recovery (fragile / pharma)
// ---------------------------------------------------------------------------

export function DemoStress() {
  const live = useLivePlan();
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [before, setBefore] = useState<WebPlan | null>(null);

  useEffect(() => {
    live.optimize(PHARMA_SKUS, {}, 'plan_pharma_base');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perturbHeavyUp = () => {
    if (!live.plan) return;
    const placements = [...live.plan.boxes];
    const heaviest = placements.reduce((a, b) => (a.weight_kg >= b.weight_kg ? a : b));
    const idx = placements.indexOf(heaviest);
    const top = Math.max(...placements.map((p) => p.z_mm + p.height_mm));
    placements[idx] = { ...heaviest, x_mm: 80, y_mm: 60, z_mm: top, layer: heaviest.layer + 1 };
    live.setPlacements(placements);
    setSettleResult(null);
    toast(`${heaviest.sku_id} (${heaviest.weight_kg} kg) moved to the top corner — watch the score.`);
  };

  const perturbShiftEdge = () => {
    if (!live.plan) return;
    const placements = live.plan.boxes.map((p) => ({
      ...p,
      x_mm: Math.min(p.x_mm + 300, DEFAULT_PALLET.length_mm - p.length_mm + 220),
    }));
    live.setPlacements(placements);
    setSettleResult(null);
    toast('Entire load shifted 300 mm toward the pallet edge.');
  };

  const restabilize = () => {
    if (!live.plan) return;
    setBefore(live.plan);
    const p = live.optimize(PHARMA_SKUS, { heavy_low: true, fragile_high: true }, 'plan_pharma_restab');
    setSettleResult(null);
    toast.success('Re-optimized with fragility + weight constraints', {
      description: `Stability ${p.metrics.stability_score.toFixed(3)} — glass SKUs now on top with nothing above them.`,
    });
  };

  if (!live.plan) return null;

  return (
    <div className="space-y-4">
      <MetricsRow plan={live.plan} validation={live.validation} />
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 glass rounded-3xl border border-white/10 overflow-hidden">
          {settling ? (
            <SettleScene
              boxes={live.plan.boxes}
              durationS={4}
              onResult={(r) => {
                setSettleResult(r);
                setSettling(false);
              }}
            />
          ) : (
            <Scene
              boxes={live.plan.boxes}
              perBox={live.validation?.per_box}
              selectedIndex={live.selected}
              onSelect={live.setSelected}
              onDragMove={live.onDragMove}
              onDragEnd={live.onDragEnd}
              cog={live.validation?.center_of_gravity}
            />
          )}
        </div>
        <div className="lg:col-span-4 space-y-4">
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-1 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400" /> Break it, then recover
            </div>
            <div className="text-[11px] text-white/50 mb-3">
              Amber boxes are fragile (glass vials, fragility ≥ 0.75). Perturb the load, watch the deterministic
              score react, then verify with a rigid-body drop test.
            </div>
            <div className="space-y-2">
              <button onClick={perturbHeavyUp} className="w-full py-2 text-xs border border-amber-500/40 text-amber-300 hover:bg-amber-950/30 rounded-xl transition">
                Send heaviest tote to the top
              </button>
              <button onClick={perturbShiftEdge} className="w-full py-2 text-xs border border-amber-500/40 text-amber-300 hover:bg-amber-950/30 rounded-xl transition">
                Shift entire load 300 mm off-centre
              </button>
              <button
                onClick={() => {
                  setSettleResult(null);
                  setSettling(true);
                }}
                className="w-full py-2 text-xs bg-white/10 hover:bg-white/15 rounded-xl transition"
              >
                Run gravity settle (Rapier rigid bodies)
              </button>
              <button onClick={restabilize} className="w-full py-2 text-xs bg-emerald-600 hover:bg-emerald-500 rounded-xl font-medium transition">
                Re-stabilize: heavy low + fragile on top
              </button>
            </div>
          </div>

          {settleResult && (
            <div className={`glass p-4 rounded-2xl border text-xs ${settleResult.max_displacement_mm > 100 ? 'border-red-500/50' : 'border-emerald-500/40'}`}>
              <div className="font-mono font-semibold mb-1">
                {settleResult.max_displacement_mm > 100 ? 'LOAD COLLAPSED' : 'LOAD HELD'}
              </div>
              <div className="text-white/70">
                Max displacement {settleResult.max_displacement_mm} mm • mean {settleResult.mean_displacement_mm} mm •{' '}
                {settleResult.toppled_count} box(es) moved &gt; 100 mm under gravity.
              </div>
            </div>
          )}

          {before && live.plan.plan_id === 'plan_pharma_restab' && (
            <div className="glass p-4 rounded-2xl border border-white/10 text-xs font-mono">
              <div className="text-white/50 mb-1">BEFORE → AFTER</div>
              <div>stability {before.metrics.stability_score.toFixed(3)} → <span className="text-emerald-400">{live.plan.metrics.stability_score.toFixed(3)}</span></div>
              <div>support {before.metrics.support_score.toFixed(3)} → <span className="text-emerald-400">{live.plan.metrics.support_score.toFixed(3)}</span></div>
              <div>density {(before.metrics.volume_density * 100).toFixed(1)}% → {(live.plan.metrics.volume_density * 100).toFixed(1)}%</div>
            </div>
          )}

          <ValidationBanner validation={live.validation} />
          <ExportRow plan={live.plan} edited={live.edited} />
        </div>
      </div>
      <p className="text-[11px] text-white/40">
        Why loads fail: when the weighted centre of mass drifts from the pallet centre and upper boxes lose base
        support, the score drops below 0.6 (the same threshold the Python core uses to mark a plan invalid). The
        Rapier drop test is an independent check — real masses, real friction, g = 9.81 m/s².
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo 3 — Multi-Pallet Side-by-Side What-If
// ---------------------------------------------------------------------------

interface PalletState {
  skus: BoxSpec[];
  plan: WebPlan;
  validation: StabilityValidation;
}

function buildPallet(skus: BoxSpec[], id: string): PalletState {
  const plan = planFromBoxes(skus, {}, undefined, id);
  return { skus, plan, validation: validatePlacements(plan.boxes) };
}

export function DemoMultiPallet() {
  const all = useMemo(() => multiPalletSkus(), []);
  const [pallets, setPallets] = useState<PalletState[]>(() => {
    // Global split: pack pallet A, overflow goes to pallet B — this IS the order-splitting logic.
    const a = planFromBoxes(all, {}, undefined, 'plan_A');
    const placedIds = new Set(a.boxes.map((b) => b.sku_id));
    const counts = new Map<string, number>();
    a.boxes.forEach((b) => counts.set(b.sku_id, (counts.get(b.sku_id) ?? 0) + 1));
    const aSkus: BoxSpec[] = [];
    const bSkus: BoxSpec[] = [];
    for (const s of all) {
      const c = counts.get(s.sku_id) ?? 0;
      if (c > 0) {
        aSkus.push(s);
        counts.set(s.sku_id, c - 1);
      } else {
        bSkus.push(s);
      }
    }
    void placedIds;
    return [buildPallet(aSkus, 'plan_A'), buildPallet(bSkus, 'plan_B')];
  });
  const [sel, setSel] = useState<{ pallet: number; index: number } | null>(null);

  const moveSelected = (to: number) => {
    if (!sel) return;
    const from = sel.pallet;
    if (from === to) return;
    const box = pallets[from].plan.boxes[sel.index];
    const spec = pallets[from].skus.find((s) => s.sku_id === box.sku_id);
    if (!spec) return;
    const fromSkus = [...pallets[from].skus];
    fromSkus.splice(fromSkus.findIndex((s) => s.sku_id === box.sku_id), 1);
    const toSkus = [...pallets[to].skus, spec];
    const next = [...pallets];
    next[from] = buildPallet(fromSkus, from === 0 ? 'plan_A' : 'plan_B');
    next[to] = buildPallet(toSkus, to === 0 ? 'plan_A' : 'plan_B');
    setPallets(next);
    setSel(null);
    toast.success(`${box.sku_id} moved to pallet ${to === 0 ? 'A' : 'B'} — both pallets re-optimized and re-validated.`);
  };

  const totals = {
    boxes: pallets.reduce((s, p) => s + p.plan.metrics.num_boxes, 0),
    weight: pallets.reduce((s, p) => s + p.plan.metrics.total_weight_kg, 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {pallets.map((p, pi) => (
          <div key={pi} className="space-y-3">
            <div className="glass rounded-3xl border border-white/10 overflow-hidden">
              <Scene
                boxes={p.plan.boxes}
                perBox={p.validation.per_box}
                selectedIndex={sel?.pallet === pi ? sel.index : null}
                onSelect={(i) => setSel(i === null ? null : { pallet: pi, index: i })}
                interactive
                cog={p.validation.center_of_gravity}
                heightClass="h-[340px]"
                paletteTag={`PALLET ${pi === 0 ? 'A' : 'B'}`}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['density', `${(p.plan.metrics.volume_density * 100).toFixed(1)}%`],
                ['stability', p.plan.metrics.stability_score.toFixed(2)],
                ['boxes', `${p.plan.metrics.num_boxes}`],
              ].map(([l, v]) => (
                <div key={l} className="glass rounded-xl border border-white/10 py-2">
                  <div className="text-[9px] text-white/40 uppercase tracking-widest">{l}</div>
                  <div className="font-mono font-semibold">{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="glass p-4 rounded-2xl border border-white/10 flex flex-wrap items-center gap-3">
        <div className="text-xs text-white/60">
          {sel
            ? `${pallets[sel.pallet].plan.boxes[sel.index]?.sku_id} selected on pallet ${sel.pallet === 0 ? 'A' : 'B'}`
            : 'Click a box to select it, then send it to the other pallet — both re-optimize instantly.'}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            disabled={!sel || sel.pallet === 1}
            onClick={() => moveSelected(1)}
            className="px-4 py-2 text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 rounded-xl transition flex items-center gap-1"
          >
            Send to B <ArrowRight className="w-3 h-3" />
          </button>
          <button
            disabled={!sel || sel.pallet === 0}
            onClick={() => moveSelected(0)}
            className="px-4 py-2 text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 rounded-xl transition flex items-center gap-1"
          >
            Send to A <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="text-xs font-mono text-white/50 w-full md:w-auto">
          TOTAL {totals.boxes} boxes • {totals.weight.toFixed(0)} kg across {pallets.length} pallets
        </div>
      </div>
      <p className="text-[11px] text-white/40">
        The A/B split itself comes from the optimizer: pallet A is packed first, overflow becomes pallet B — the same
        logic recommends order splits in production.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo 4 — Robot Execution Simulation with Live Editing
// ---------------------------------------------------------------------------

export function DemoRobot() {
  const live = useLivePlan();
  const [anim, setAnim] = useState<RobotAnim>({ activeIndex: -1, progress: 0, placedCount: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const raf = useRef<number>();

  const skus = useMemo(() => [...BEVERAGE_SKUS, ...ecommChaosSkus(7, 3)], []);
  useEffect(() => {
    live.optimize(skus, {}, 'plan_robot_exec');
    setAnim({ activeIndex: -1, progress: 0, placedCount: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || !live.plan) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setAnim((a) => {
        if (!live.plan) return a;
        if (a.placedCount >= live.plan.boxes.length) {
          setPlaying(false);
          return { ...a, activeIndex: -1 };
        }
        const active = a.activeIndex === -1 ? a.placedCount : a.activeIndex;
        let progress = a.progress + dt * 0.5 * speed;
        let placed = a.placedCount;
        let nextActive = active;
        if (progress >= 1) {
          placed = active + 1;
          progress = 0;
          nextActive = placed < live.plan.boxes.length ? placed : -1;
        }
        return { activeIndex: nextActive, progress, placedCount: placed };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, live.plan]);

  if (!live.plan) return null;
  const remaining = live.plan.boxes.length - anim.placedCount;

  const exportRemaining = () => {
    if (!live.plan) return;
    const rest = live.plan.boxes.slice(anim.placedCount);
    downloadText(urscriptFor(`${live.plan.plan_id}_remaining`, rest), `${live.plan.plan_id}_remaining.urscript`);
    toast.success(`URScript for the ${rest.length} remaining picks downloaded`, {
      description: 'Edited mid-run — the sequence adapts, the robot code follows.',
    });
  };

  return (
    <div className="space-y-4">
      <MetricsRow plan={live.plan} validation={live.validation} />
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 glass rounded-3xl border border-white/10 overflow-hidden">
          <Scene
            boxes={live.plan.boxes}
            perBox={live.validation?.per_box}
            selectedIndex={live.selected}
            onSelect={live.setSelected}
            onDragMove={playing ? undefined : live.onDragMove}
            onDragEnd={playing ? undefined : live.onDragEnd}
            interactive={!playing}
            cog={live.validation?.center_of_gravity}
            visibleCount={anim.placedCount}
            robot={anim}
          />
        </div>
        <div className="lg:col-span-4 space-y-4">
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-3">Execution control</div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {playing ? (<><Pause className="w-4 h-4" /> Pause</>) : (<><Play className="w-4 h-4" /> {anim.placedCount > 0 ? 'Resume' : 'Run sequence'}</>)}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setAnim({ activeIndex: -1, progress: 0, placedCount: 0 });
                }}
                className="px-4 py-2.5 border border-white/20 hover:bg-white/5 rounded-xl text-xs transition"
              >
                Reset
              </button>
            </div>
            <label className="text-xs text-white/60 flex items-center gap-3">
              Speed
              <input type="range" min={0.5} max={3} step={0.5} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="flex-1 accent-emerald-500" />
              <span className="font-mono">{speed}×</span>
            </label>
            <div className="mt-3 text-xs font-mono text-white/60">
              {anim.placedCount}/{live.plan.boxes.length} placed • {remaining} remaining
              {anim.activeIndex >= 0 && ` • placing ${live.plan.boxes[anim.activeIndex]?.sku_id}`}
            </div>
          </div>
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-2">Closed-loop editing</div>
            <div className="text-[11px] text-white/50 mb-3">
              Pause, drag any already-placed box, and export robot code for just the remaining picks. Plan edits
              mid-run don&apos;t require starting over.
            </div>
            <button onClick={exportRemaining} disabled={remaining === 0} className="w-full py-2 text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 rounded-xl transition">
              Export URScript for remaining {remaining} picks
            </button>
          </div>
          <ValidationBanner validation={live.validation} />
          <ExportRow plan={live.plan} edited={live.edited} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo 5 — Digital Twin + Co-Pilot (client parser + backend LLM, both real)
// ---------------------------------------------------------------------------

interface ChatEntry {
  role: 'user' | 'copilot';
  text: string;
  meta?: string;
}

export function DemoTwin() {
  const live = useLivePlan();
  const [skus, setSkus] = useState<BoxSpec[]>(PHARMA_SKUS);
  const [mode, setMode] = useState<'client' | 'backend'>('client');
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [constraints, setConstraints] = useState<OptimizeConstraints>({});

  useEffect(() => {
    live.optimize(skus, constraints, 'plan_twin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, constraints]);

  const selectedSku =
    live.selected !== null && live.plan
      ? skus.find((s) => s.sku_id === live.plan!.boxes[live.selected!]?.sku_id) ?? null
      : null;

  const updateSku = (patch: Partial<BoxSpec>) => {
    if (!selectedSku) return;
    setSkus((prev) => prev.map((s) => (s.sku_id === selectedSku.sku_id ? { ...s, ...patch } : s)));
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || !live.plan) return;
    setInput('');
    setChat((c) => [...c, { role: 'user', text }]);
    setBusy(true);

    const beforeM = live.plan.metrics;
    try {
      let nextConstraints: OptimizeConstraints;
      let explanation: string;
      let parserLabel: string;

      if (mode === 'client') {
        const parsed = parseConstraints(text);
        nextConstraints = { ...constraints, ...parsed.constraints };
        explanation = parsed.explanation;
        parserLabel = 'client • deterministic rule parser';
      } else {
        const res = await fetch('/api/adapt-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, skus, current_constraints: constraints }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        nextConstraints = { ...constraints, ...data.constraints };
        explanation = data.explanation;
        parserLabel = data.parser === 'llm' ? 'backend • LLM constraint parser' : 'backend • rule parser fallback (no API key configured)';
      }

      setConstraints(nextConstraints);
      // measure the delta on the freshly computed plan
      const after = planFromBoxes(skus, nextConstraints, undefined, 'plan_twin');
      const dStab = after.metrics.stability_score - beforeM.stability_score;
      const dDens = (after.metrics.volume_density - beforeM.volume_density) * 100;
      setChat((c) => [
        ...c,
        {
          role: 'copilot',
          text: explanation,
          meta: `${parserLabel} → constraints ${JSON.stringify(nextConstraints)} → re-optimized: stability ${dStab >= 0 ? '+' : ''}${dStab.toFixed(3)}, density ${dDens >= 0 ? '+' : ''}${dDens.toFixed(1)} pts`,
        },
      ]);
    } catch {
      setChat((c) => [...c, { role: 'copilot', text: 'Backend unreachable — switch to the client parser or check /api/adapt-plan.', meta: 'error' }]);
    } finally {
      setBusy(false);
    }
  };

  if (!live.plan) return null;

  return (
    <div className="space-y-4">
      <MetricsRow plan={live.plan} validation={live.validation} />
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 glass rounded-3xl border border-white/10 overflow-hidden">
          <Scene
            boxes={live.plan.boxes}
            perBox={live.validation?.per_box}
            selectedIndex={live.selected}
            onSelect={live.setSelected}
            onDragMove={live.onDragMove}
            onDragEnd={live.onDragEnd}
            cog={live.validation?.center_of_gravity}
            labelAll
          />
        </div>
        <div className="lg:col-span-5 space-y-4">
          {/* live SKU property editing */}
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-2">Digital twin — live SKU properties</div>
            {selectedSku ? (
              <div className="space-y-3 text-xs">
                <div className="font-mono text-emerald-400">{selectedSku.sku_id}</div>
                <label className="block">
                  Weight: <span className="font-mono">{selectedSku.weight_kg.toFixed(1)} kg</span>
                  <input type="range" min={0.5} max={30} step={0.5} value={selectedSku.weight_kg} onChange={(e) => updateSku({ weight_kg: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                </label>
                <label className="block">
                  Fragility: <span className="font-mono">{(selectedSku.fragility ?? 0).toFixed(2)}</span>
                  <input type="range" min={0} max={1} step={0.05} value={selectedSku.fragility ?? 0} onChange={(e) => updateSku({ fragility: parseFloat(e.target.value) })} className="w-full accent-amber-500" />
                </label>
                <div className="text-white/40">Changes re-run the optimizer immediately — the plan you see is always current.</div>
              </div>
            ) : (
              <div className="text-xs text-white/50">Click a box in the scene to edit its weight and fragility live.</div>
            )}
          </div>

          {/* co-pilot */}
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" /> Pallet Co-Pilot
            </div>
            <div className="flex gap-1 mb-3 text-[10px] font-mono">
              {(['client', 'backend'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-full transition ${mode === m ? 'bg-white text-black font-semibold' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {m === 'client' ? 'CLIENT • DETERMINISTIC PARSER' : 'BACKEND • LLM PARSER'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-white/40 mb-3">
              Both paths translate your sentence into the same constraint schema and re-run the same deterministic
              optimizer. The parser never invents placements or metrics — it only selects constraints.
            </div>
            <div className="max-h-44 overflow-y-auto space-y-2 mb-3 pr-1">
              {chat.length === 0 && (
                <div className="text-xs text-white/40 italic">
                  Try: &quot;Protect the glass vials and keep heavy totes on the bottom&quot; or &quot;max height 1200 mm,
                  prioritize speed&quot;
                </div>
              )}
              {chat.map((c, i) => (
                <div key={i} className={`text-xs p-2.5 rounded-xl ${c.role === 'user' ? 'bg-white/10 ml-6' : 'bg-emerald-950/40 border border-emerald-500/20 mr-2'}`}>
                  <div>{c.text}</div>
                  {c.meta && <div className="text-[9px] font-mono text-white/40 mt-1.5 break-all">{c.meta}</div>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={busy}
                placeholder="Describe your constraints…"
                className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600"
              />
              <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl transition">
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
            {Object.keys(constraints).length > 0 && (
              <button onClick={() => setConstraints({})} className="mt-2 text-[10px] text-white/40 hover:text-white/70 underline">
                clear active constraints {JSON.stringify(constraints)}
              </button>
            )}
          </div>

          <ExportRow plan={live.plan} edited={live.edited} />
          <PilotCTA plan={live.plan} />
        </div>
      </div>
    </div>
  );
}
