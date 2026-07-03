"use client";

// Demo 7 — Live Cell OS v2: run a shift on the shipped edge stack.
// Setup -> 3-minute shift -> report card. Every decision has a computed
// consequence: speed override raises misfeed risk, constraint toggles
// re-plan through the real optimizer, below-gate overrides risk rework.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CloudOff, Cloud, PackageX, HeartPulse, RotateCcw, ShieldCheck, Gauge,
  Play, Trophy, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { MissionBanner, useMission } from './game';
import { Scene } from './shared';
import {
  CellSimState, ShiftSetup, OrderProfile, EdgeState,
  createSetupState, tickCellSim,
  actionStartShift, actionSetSpeed, actionQueueSetup,
  actionCutCloud, actionRestoreCloud, actionMisfeed, actionStallHeartbeat,
  actionResetFault, actionOperatorApprove,
  HEARTBEAT_TIMEOUT_S, VLM_CONFIDENCE_GATE, SHIFT_LENGTH_S, SPEED_STEPS, PROFILES,
} from '@/lib/palletizer/cellsim';

const BEST_KEY = 'palletizer_cell_best_v2';

const STATE_META: Record<EdgeState, { on: string; dot: string }> = {
  IDLE: { on: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
  MOVING: { on: 'border-sky-400/60 bg-sky-400/10 text-sky-300', dot: 'bg-sky-400' },
  EXCEPTION_HANDLING: { on: 'border-amber-400/60 bg-amber-400/10 text-amber-300', dot: 'bg-amber-400' },
  FAULT_ESTOP: { on: 'border-red-500/70 bg-red-500/10 text-red-300', dot: 'bg-red-500' },
};

function StateRibbon({ sim }: { sim: CellSimState }) {
  const left = Math.max(0, SHIFT_LENGTH_S - sim.shiftElapsed);
  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60).toString().padStart(2, '0');
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {(Object.keys(STATE_META) as EdgeState[]).map((st) => {
        const active = sim.state === st;
        return (
          <div key={st}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-[11px] tracking-wider transition-all ${
              active ? STATE_META[st].on : 'border-white/10 bg-white/[0.02] text-white/30'}`}>
            <span className={`w-2 h-2 rounded-full ${active ? `${STATE_META[st].dot} animate-pulse` : 'bg-white/15'}`} />
            {st}
          </div>
        );
      })}
      <div className="flex items-center gap-4 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.02] font-mono text-[11px] text-white/50 ml-auto">
        <span className="flex items-center gap-1.5">
          <HeartPulse className={`w-3.5 h-3.5 ${sim.heartbeatStalled ? 'text-red-400' : 'text-emerald-400'}`} />
          HB {sim.heartbeat}
        </span>
        <span className="flex items-center gap-1.5">
          {sim.cloudConnected ? <Cloud className="w-3.5 h-3.5 text-sky-400" /> : <CloudOff className="w-3.5 h-3.5 text-amber-400" />}
          {sim.cloudConnected ? 'CLOUD' : 'CACHE'}
        </span>
        <span>UP {sim.score.uptimePct.toFixed(1)}%</span>
        <span className="text-white font-semibold">{mm}:{ss}</span>
      </div>
    </div>
  );
}

function Telemetry({ sim }: { sim: CellSimState }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [sim.events.length]);
  const color = (k: string) =>
    k === 'vlm_pass' ? 'text-emerald-400' : k === 'vlm_reject' ? 'text-amber-400'
    : k === 'fault' ? 'text-red-400' : k === 'rework' ? 'text-red-300'
    : k === 'autonomy' ? 'text-sky-300' : k === 'pallet' ? 'text-violet-300'
    : k === 'exception' ? 'text-amber-300' : k === 'operator' ? 'text-white/80' : 'text-white/50';
  return (
    <div className="glass rounded-2xl border border-white/10 p-3">
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">
        CELL TELEMETRY • VLM GATE &gt; {VLM_CONFIDENCE_GATE} • WATCHDOG {HEARTBEAT_TIMEOUT_S}s
      </div>
      <div className="h-40 overflow-y-auto space-y-1 font-mono text-[10.5px] leading-relaxed pr-1">
        {sim.events.map((e, i) => (
          <div key={i} className={color(e.kind)}>
            <span className="text-white/25">[{e.t.toFixed(1)}s]</span> {e.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function ConstraintToggles({ value, onChange }: { value: ShiftSetup['constraints']; onChange: (c: ShiftSetup['constraints']) => void }) {
  const items = [
    { key: 'heavy_low', label: 'Heavy below', desc: 'Pack heaviest cases on the bottom layers' },
    { key: 'fragile_high', label: 'Fragile on top', desc: 'Glass and vials only on the top-most layers' },
  ] as const;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <button key={it.key}
          onClick={() => onChange({ ...value, [it.key]: !value[it.key] || undefined })}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left text-sm transition ${
            value[it.key] ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/15 hover:bg-white/5'}`}>
          <span>
            <span className="font-medium">{it.label}</span>
            <span className="block text-[11px] text-white/40">{it.desc}</span>
          </span>
          <span className={`text-xs font-mono ${value[it.key] ? 'text-emerald-300' : 'text-white/30'}`}>{value[it.key] ? 'ON' : 'OFF'}</span>
        </button>
      ))}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/15 text-sm">
        <span>
          <span className="font-medium">Height limit</span>
          <span className="block text-[11px] text-white/40">Truck / racking clearance</span>
        </span>
        <div className="flex gap-1">
          {[undefined, 1200, 1500].map((h) => (
            <button key={String(h)}
              onClick={() => onChange({ ...value, max_height_mm: h })}
              className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition ${
                value.max_height_mm === h ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-white/15 text-white/40 hover:bg-white/5'}`}>
              {h ? `${h}` : 'OFF'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfilePicker({ value, onChange }: { value: OrderProfile; onChange: (p: OrderProfile) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {(Object.keys(PROFILES) as OrderProfile[]).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`px-3 py-2.5 rounded-xl border text-left text-sm transition ${
            value === p ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/15 hover:bg-white/5'}`}>
          <span className="font-medium flex items-center justify-between">
            {PROFILES[p].label}
            <span className="text-[10px] font-mono text-white/40">+{PROFILES[p].palletBonus} pts/pallet</span>
          </span>
          <span className="block text-[11px] text-white/40">{PROFILES[p].desc}</span>
        </button>
      ))}
    </div>
  );
}

function SetupScreen({ onStart, best }: { onStart: (s: ShiftSetup) => void; best: number }) {
  const [profile, setProfile] = useState<OrderProfile>('beverage');
  const [constraints, setConstraints] = useState<ShiftSetup['constraints']>({});
  return (
    <div className="glass rounded-3xl border border-white/10 p-6 md:p-10 grid md:grid-cols-2 gap-8">
      <div>
        <div className="text-xs tracking-[3px] text-primary mb-3 font-mono">SHIFT SETUP</div>
        <h3 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Run a {SHIFT_LENGTH_S / 60}-minute shift on a live cell</h3>
        <p className="text-white/60 text-sm leading-relaxed mb-4">
          Pick the order mix, set your packing constraints, then operate: speed override, misfeed recovery,
          cloud outages, e-stops. Every mechanic is the shipped edge stack — the state machine, the {HEARTBEAT_TIMEOUT_S}s
          watchdog, and the &gt;{VLM_CONFIDENCE_GATE} confidence gate are real, and the pallet patterns come from the
          real optimizer with your constraints applied.
        </p>
        <div className="text-[12px] text-white/50 space-y-1.5 mb-6">
          <div className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-emerald-400" /> +5/placement, pallet bonus by difficulty, +10 gate-passed correction</div>
          <div className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-amber-400" /> Overrides below the gate risk −15 rework • latched E-stop −20</div>
          {best > 0 && <div className="flex items-center gap-2"><Trophy className="w-3.5 h-3.5 text-yellow-400" /> Your best shift: {best} pts</div>}
        </div>
        <button onClick={() => onStart({ profile, constraints })}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-black text-lg font-semibold rounded-3xl hover:bg-white/90 transition-all">
          Start shift <Play className="w-5 h-5 group-hover:translate-x-0.5 transition" />
        </button>
      </div>
      <div className="space-y-5">
        <div>
          <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">ORDER PROFILE</div>
          <ProfilePicker value={profile} onChange={setProfile} />
        </div>
        <div>
          <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">OPTIMIZER CONSTRAINTS (REAL RE-PLAN)</div>
          <ConstraintToggles value={constraints} onChange={setConstraints} />
        </div>
      </div>
    </div>
  );
}

function ReportCard({ sim, best, onAgain, onSetup }: { sim: CellSimState; best: number; onAgain: () => void; onSetup: () => void }) {
  const s = sim.score;
  const gradeColor = sim.grade === 'S' ? 'text-yellow-300' : sim.grade === 'A' ? 'text-emerald-300' : sim.grade === 'B' ? 'text-sky-300' : 'text-white/60';
  const rows = [
    ['Points', s.points], ['Pallets shipped', s.palletsCompleted], ['Throughput', `${s.throughputPerMin}/min`],
    ['Uptime', `${s.uptimePct}%`], ['Gate-passed corrections', s.vlmApplied], ['Operator overrides', s.operatorOverrides],
    ['Reworks caused', s.reworks], ['Cache-autonomy placements', s.autonomyPlacements], ['E-stops recovered', s.faultsRecovered],
  ] as const;
  return (
    <div className="glass rounded-3xl border border-white/10 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
        <div>
          <div className="text-xs tracking-[3px] text-primary mb-2 font-mono">SHIFT REPORT</div>
          <div className="flex items-baseline gap-4">
            <span className={`text-7xl font-semibold ${gradeColor}`}>{sim.grade}</span>
            <span className="text-3xl font-mono">{s.points} pts</span>
            {s.points >= best && best > 0 && <span className="text-yellow-300 text-sm font-mono flex items-center gap-1"><Trophy className="w-4 h-4" /> NEW BEST</span>}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onAgain} className="px-6 py-3 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition">Run it again</button>
          <button onClick={onSetup} className="px-6 py-3 border border-white/25 rounded-2xl hover:bg-white/5 transition">Change setup</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 text-sm">
            <span className="text-white/50 text-xs">{k}</span>
            <span className="font-mono font-semibold">{v}</span>
          </div>
        ))}
      </div>
      {s.reworks > 0 && (
        <div className="mt-5 text-[12px] text-amber-300/80">
          {s.reworks} rework{s.reworks > 1 ? 's' : ''} came from overriding below the confidence gate — the same reason
          the shipped engine never writes a correction under {VLM_CONFIDENCE_GATE} autonomously.
        </div>
      )}
    </div>
  );
}

export default function CellSimulator() {
  const seedRef = useRef({ seed: 1 });
  const [sim, setSim] = useState<CellSimState>(() => createSetupState());
  const [best, setBest] = useState(0);
  const mission = useMission('cell');
  const missionDone = useRef(false);
  const bestSaved = useRef(false);
  const raf = useRef<number>();

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(BEST_KEY) || 0)); } catch { /* ssr/private mode */ }
  }, []);

  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      setSim((s) => tickCellSim(s, dt, seedRef.current));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  // Mission: Fault Marshal — verified purely from real sim state.
  useEffect(() => {
    const sc = sim.score;
    if (!missionDone.current && sc.autonomyPlacements > 0 && sc.vlmApplied >= 1 && sc.faultsRecovered >= 1 && sc.palletsCompleted >= 1) {
      missionDone.current = true;
      mission.complete();
    }
    if (sim.phase === 'report' && !bestSaved.current) {
      bestSaved.current = true;
      if (sc.points > best) {
        setBest(sc.points);
        try { localStorage.setItem(BEST_KEY, String(sc.points)); } catch { /* ignore */ }
      }
    }
    if (sim.phase !== 'report') bestSaved.current = false;
  }, [sim, mission, best]);

  const start = useCallback((setup: ShiftSetup) => {
    seedRef.current.seed += 1;
    setSim((s) => actionStartShift(s, setup));
  }, []);

  const act = (fn: (s: CellSimState) => CellSimState, note?: string) => {
    setSim((s) => fn(s));
    if (note) toast(note);
  };

  if (sim.phase === 'setup') {
    return (
      <div className="space-y-4">
        <MissionBanner demo="cell" />
        <SetupScreen onStart={start} best={best} />
      </div>
    );
  }

  if (sim.phase === 'report') {
    return (
      <div className="space-y-4">
        <MissionBanner demo="cell" />
        <ReportCard sim={sim} best={best} onAgain={() => start(sim.setup)} onSetup={() => setSim(createSetupState())} />
        <Telemetry sim={sim} />
      </div>
    );
  }

  const inFault = sim.state === 'FAULT_ESTOP';
  const held = sim.state === 'EXCEPTION_HANDLING' && sim.heldFrame;

  return (
    <div className="space-y-4">
      <MissionBanner demo="cell" />
      <StateRibbon sim={sim} />

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-4">
          <div className="glass rounded-3xl border border-white/10 overflow-hidden relative">
            <Scene
              boxes={sim.plan.boxes}
              interactive={false}
              robot={{ activeIndex: sim.activeIndex, progress: sim.progress, placedCount: sim.placedCount }}
              heightClass="h-[440px]"
              paletteTag={sim.plan.plan_id}
            />
            {inFault && (
              <div className="absolute inset-0 bg-red-950/40 backdrop-blur-[2px] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-red-300 font-mono tracking-[4px] text-sm mb-3">FAULT_ESTOP LATCHED</div>
                  <button onClick={() => act(actionResetFault, 'Fault reset — cell resumes exactly where it stopped')}
                    className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-2xl inline-flex items-center gap-2 transition">
                    <RotateCcw className="w-4 h-4" /> Operator reset
                  </button>
                </div>
              </div>
            )}
            {sim.state === 'EXCEPTION_HANDLING' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-mono tracking-wider">
                CELL HOLDING SAFE POSE — VLM ANALYZING FRAMES
              </div>
            )}
            {held && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 glass border border-amber-400/40 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-amber-300 text-xs">
                  HELD frame-{sim.heldFrame!.frame}: conf {sim.heldFrame!.confidence.toFixed(4)} ≤ {VLM_CONFIDENCE_GATE}
                </span>
                <button onClick={() => setSim((s) => actionOperatorApprove(s, seedRef.current))}
                  className="px-3 py-1.5 bg-amber-400 text-black text-xs font-semibold rounded-lg hover:bg-amber-300 transition">
                  Override &amp; apply (your risk)
                </button>
                <span className="text-white/40 text-[11px]">or wait for a frame above the gate</span>
              </div>
            )}
          </div>

          {/* Speed override — the operator's main lever */}
          <div className="glass rounded-2xl border border-white/10 p-4 flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2 text-[10px] tracking-[2px] text-white/40 font-mono">
              <Gauge className="w-4 h-4" /> SPEED OVERRIDE
            </span>
            <div className="flex gap-1.5">
              {SPEED_STEPS.map((v) => (
                <button key={v} onClick={() => act((s) => actionSetSpeed(s, v))}
                  className={`px-4 py-2 rounded-xl border font-mono text-xs transition ${
                    sim.speedOverride === v
                      ? v > 1 ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-sky-400/60 bg-sky-400/10 text-sky-300'
                      : 'border-white/15 text-white/40 hover:bg-white/5'}`}>
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
            <span className="text-[11px] text-white/40">
              {sim.speedOverride > 1 ? 'Faster cycle, 3× misfeed risk — your call, operator.' : sim.speedOverride < 1 ? 'Slow and safe — throughput pays for it.' : 'Nominal cycle, nominal risk.'}
            </span>
            <span className="ml-auto font-mono text-sm">
              <span className="text-white/40 text-[10px] mr-2">THROUGHPUT</span>{sim.score.throughputPerMin}/min
              <span className="text-white/40 text-[10px] mx-2 ml-4">POINTS</span><span className="font-semibold">{sim.score.points}</span>
            </span>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="glass rounded-2xl border border-white/10 p-4">
            <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-3">SABOTAGE DECK — TRY TO STOP IT</div>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => sim.cloudConnected ? act(actionCutCloud, 'Cloud severed. Watch the cell keep placing from cache.') : act(actionRestoreCloud)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left">
                {sim.cloudConnected ? <CloudOff className="w-4 h-4 text-amber-400 shrink-0" /> : <Cloud className="w-4 h-4 text-sky-400 shrink-0" />}
                <span>
                  <span className="font-medium">{sim.cloudConnected ? 'Cut the cloud link' : 'Restore the cloud link'}</span>
                  <span className="block text-[11px] text-white/40">
                    {sim.cloudConnected ? 'Patterns keep flowing from local cache' : 'Pattern sync resumes'}
                  </span>
                </span>
              </button>
              <button onClick={() => act(actionMisfeed)} disabled={sim.state !== 'MOVING'}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left disabled:opacity-35 disabled:cursor-not-allowed">
                <PackageX className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <span className="font-medium">Misfeed a box</span>
                  <span className="block text-[11px] text-white/40">Force an exception — the cell already slips on its own at high speed</span>
                </span>
              </button>
              <button onClick={() => act(actionStallHeartbeat)} disabled={sim.heartbeatStalled || inFault}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left disabled:opacity-35 disabled:cursor-not-allowed">
                <HeartPulse className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <span className="font-medium">Freeze the PLC heartbeat</span>
                  <span className="block text-[11px] text-white/40">Watchdog latches FAULT_ESTOP in {HEARTBEAT_TIMEOUT_S}s — nothing moves blind</span>
                </span>
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-4">
            <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-3">
              NEXT PATTERN {sim.setupQueued && <span className="text-emerald-300">• RE-PLAN QUEUED</span>}
            </div>
            <ProfilePicker value={sim.queuedSetup.profile}
              onChange={(p) => act((s) => actionQueueSetup(s, { ...s.queuedSetup, profile: p }))} />
            <div className="mt-3">
              <ConstraintToggles value={sim.queuedSetup.constraints}
                onChange={(c) => act((s) => actionQueueSetup(s, { ...s.queuedSetup, constraints: c }))} />
            </div>
            <div className="mt-2 text-[11px] text-white/35">Applied when the next pattern arms — the real optimizer re-plans with these constraints.</div>
          </div>

          <div className="glass rounded-2xl border border-white/10 p-4 text-[12px] text-white/60 leading-relaxed">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-white/40 font-mono text-[10px] tracking-[2px]">SAME STACK AS THE HARDWARE</span>
            </div>
            Browser mirror of <code className="text-white/80">gateway/edge_orchestrator.py</code> — identical state machine,
            {' '}{HEARTBEAT_TIMEOUT_S}s watchdog, and &gt;{VLM_CONFIDENCE_GATE} VLM gate. On hardware it speaks OPC UA and streams URScript.
          </div>
        </div>
      </div>

      <Telemetry sim={sim} />
    </div>
  );
}
