"use client";

// Demo 7 — Live Cell OS v3: run a shift on the shipped edge stack.
// Setup -> 3-minute shift with a live order queue -> graded report card with a
// local leaderboard and a pilot CTA. Every mechanic is computed: speed raises
// misfeed risk and gripper wear, deadlines reward scheduling, below-gate
// overrides risk rework, and constraint toggles re-plan via the real optimizer.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CloudOff, Cloud, PackageX, HeartPulse, RotateCcw, ShieldCheck, Gauge,
  Play, Trophy, ListChecks, Wrench, Flame, ClipboardCopy, ArrowUpToLine,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { MissionBanner, useMission } from './game';

const CellScene = dynamic(() => import('./CellScene'), {
  ssr: false,
  loading: () => <div className="h-[440px] flex items-center justify-center text-white/40 text-sm font-mono">Spinning up the cell…</div>,
});
import {
  CellSimState, ShiftSetup, EdgeState, CellOrder,
  createSetupState, tickCellSim,
  actionStartShift, actionSetSpeed, actionQueueSetup, actionPrioritizeOrder,
  actionServiceGripper, actionCutCloud, actionRestoreCloud, actionMisfeed,
  actionStallHeartbeat, actionResetFault, actionOperatorApprove,
  HEARTBEAT_TIMEOUT_S, VLM_CONFIDENCE_GATE, SHIFT_LENGTH_S, SERVICE_TIME_S,
  ON_TIME_BONUS, SPEED_STEPS, PROFILES,
} from '@/lib/palletizer/cellsim';

const BOARD_KEY = 'palletizer_cell_board_v3';

interface BoardEntry { points: number; grade: string; pallets: number; onTime: number; date: number }

function loadBoard(): BoardEntry[] {
  try { return JSON.parse(localStorage.getItem(BOARD_KEY) || '[]'); } catch { return []; }
}
function saveBoard(b: BoardEntry[]) {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(b.slice(0, 5))); } catch { /* ignore */ }
}

const STATE_META: Record<EdgeState, { on: string; dot: string }> = {
  IDLE: { on: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
  MOVING: { on: 'border-sky-400/60 bg-sky-400/10 text-sky-300', dot: 'bg-sky-400' },
  EXCEPTION_HANDLING: { on: 'border-amber-400/60 bg-amber-400/10 text-amber-300', dot: 'bg-amber-400' },
  FAULT_ESTOP: { on: 'border-red-500/70 bg-red-500/10 text-red-300', dot: 'bg-red-500' },
};

function StateRibbon({ sim }: { sim: CellSimState }) {
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
      </div>
    </div>
  );
}

function Hud({ sim, onService }: { sim: CellSimState; onService: () => void }) {
  const left = Math.max(0, SHIFT_LENGTH_S - sim.shiftElapsed);
  const mm = Math.floor(left / 60);
  const ss = Math.floor(left % 60).toString().padStart(2, '0');
  const wear = sim.gripperWear;
  const wearColor = wear > 0.8 ? 'bg-red-500' : wear > 0.5 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="glass rounded-2xl border border-white/10 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <div className="text-[9px] tracking-[2px] text-white/40 font-mono">POINTS</div>
        <div className="text-2xl font-mono font-semibold leading-none">{sim.score.points}</div>
      </div>
      <div className={`flex items-center gap-1.5 ${sim.multiplier > 1 ? 'text-orange-300' : 'text-white/30'}`}>
        <Flame className="w-4 h-4" />
        <div>
          <div className="text-[9px] tracking-[2px] font-mono opacity-70">STREAK</div>
          <div className="font-mono font-semibold leading-none">×{sim.multiplier.toFixed(2)}</div>
        </div>
      </div>
      <div>
        <div className="text-[9px] tracking-[2px] text-white/40 font-mono">THROUGHPUT</div>
        <div className="font-mono leading-none">{sim.score.throughputPerMin}/min</div>
      </div>
      <div>
        <div className="text-[9px] tracking-[2px] text-white/40 font-mono">ON-TIME</div>
        <div className="font-mono leading-none">{sim.score.onTimeOrders}<span className="text-white/30">/{sim.score.onTimeOrders + sim.score.lateOrders}</span></div>
      </div>
      <div className="flex items-center gap-3 min-w-[180px]">
        <div className="flex-1">
          <div className="text-[9px] tracking-[2px] text-white/40 font-mono mb-1">GRIPPER WEAR {(wear * 100).toFixed(0)}%</div>
          <div className="h-1.5 rounded bg-white/10 overflow-hidden">
            <div className={`h-full ${wearColor} transition-all`} style={{ width: `${wear * 100}%` }} />
          </div>
        </div>
        <button onClick={onService}
          disabled={sim.maintenance > 0 || sim.state === 'EXCEPTION_HANDLING' || sim.state === 'FAULT_ESTOP'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-[11px] hover:bg-white/5 transition disabled:opacity-35 disabled:cursor-not-allowed"
          title={`${SERVICE_TIME_S}s downtime, resets wear`}>
          <Wrench className="w-3.5 h-3.5" /> {sim.maintenance > 0 ? `${sim.maintenance.toFixed(1)}s` : 'Service'}
        </button>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[9px] tracking-[2px] text-white/40 font-mono">SHIFT</div>
        <div className={`text-2xl font-mono font-semibold leading-none ${left < 20 ? 'text-red-300' : ''}`}>{mm}:{ss}</div>
      </div>
    </div>
  );
}

function OrderQueue({ sim, onPrioritize }: { sim: CellSimState; onPrioritize: (id: string) => void }) {
  const chip = (o: CellOrder, active: boolean, first: boolean) => {
    const remain = Math.round(o.deadline - sim.shiftElapsed);
    const late = remain < 0;
    const tight = remain >= 0 && remain < 20;
    return (
      <div key={o.id}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm transition ${
          active ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/12 bg-white/[0.02]'}`}>
        <span>
          <span className="font-mono text-xs">{o.id}</span>
          <span className="block text-[11px] text-white/45">{PROFILES[o.profile].label} • +{PROFILES[o.profile].palletBonus}{active || first ? '' : ''} pts</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-mono text-[11px] ${late ? 'text-red-400' : tight ? 'text-amber-300' : 'text-white/50'}`}>
            {late ? `${-remain}s late` : `due ${remain}s`}
          </span>
          {!active && !first && (
            <button onClick={() => onPrioritize(o.id)} title="Run this next"
              className="p-1 rounded-md border border-white/15 hover:bg-white/10 transition">
              <ArrowUpToLine className="w-3 h-3" />
            </button>
          )}
        </span>
      </div>
    );
  };
  return (
    <div className="glass rounded-2xl border border-white/10 p-4">
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">
        ORDER QUEUE • ON-TIME +{ON_TIME_BONUS} PTS • LATE = HALF BONUS
      </div>
      <div className="space-y-2">
        {sim.activeOrder && chip(sim.activeOrder, true, false)}
        {sim.orderQueue.slice(0, 4).map((o, i) => chip(o, false, i === 0))}
      </div>
      <div className="mt-2 text-[11px] text-white/35">The order in blue is on the pallet now. Pull tight deadlines forward — scheduling is your job.</div>
    </div>
  );
}

function ConstraintToggles({ value, onChange }: { value: ShiftSetup['constraints']; onChange: (c: ShiftSetup['constraints']) => void }) {
  const items = [
    { key: 'heavy_low', label: 'Heavy below', desc: 'Heaviest cases on the bottom layers' },
    { key: 'fragile_high', label: 'Fragile on top', desc: 'Glass and vials only on top layers' },
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
            <button key={String(h)} onClick={() => onChange({ ...value, max_height_mm: h })}
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

function Leaderboard({ board }: { board: BoardEntry[] }) {
  if (board.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2 flex items-center gap-2">
        <Trophy className="w-3.5 h-3.5 text-yellow-400" /> YOUR BEST SHIFTS (THIS BROWSER)
      </div>
      <div className="space-y-1.5">
        {board.map((b, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-white/[0.02] font-mono text-xs">
            <span className="text-white/40">#{i + 1}</span>
            <span className="font-semibold">{b.points} pts</span>
            <span className={b.grade === 'S' ? 'text-yellow-300' : b.grade === 'A' ? 'text-emerald-300' : 'text-white/50'}>{b.grade}</span>
            <span className="text-white/40">{b.pallets} pallets • {b.onTime} on-time</span>
          </div>
        ))}
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
    : k === 'exception' ? 'text-amber-300' : k === 'order' ? 'text-sky-200'
    : k === 'operator' ? 'text-white/80' : 'text-white/50';
  return (
    <div className="glass rounded-2xl border border-white/10 p-3">
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">
        CELL TELEMETRY • VLM GATE &gt; {VLM_CONFIDENCE_GATE} • WATCHDOG {HEARTBEAT_TIMEOUT_S}s
      </div>
      <div className="h-36 overflow-y-auto space-y-1 font-mono text-[10.5px] leading-relaxed pr-1">
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

function SetupScreen({ onStart, board }: { onStart: (s: ShiftSetup) => void; board: BoardEntry[] }) {
  const [constraints, setConstraints] = useState<ShiftSetup['constraints']>({});
  return (
    <div className="glass rounded-3xl border border-white/10 p-6 md:p-10 grid md:grid-cols-2 gap-8">
      <div>
        <div className="text-xs tracking-[3px] text-primary mb-3 font-mono">SHIFT SETUP</div>
        <h3 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Run a {SHIFT_LENGTH_S / 60}-minute shift on a live cell</h3>
        <p className="text-white/60 text-sm leading-relaxed mb-4">
          Orders arrive with deadlines — beverage, e-comm chaos, pharma glass. You schedule the queue, set the
          speed override, service the gripper before it slips, and decide whether to trust frames the VLM gate
          holds. The state machine, {HEARTBEAT_TIMEOUT_S}s watchdog, and &gt;{VLM_CONFIDENCE_GATE} confidence gate
          are the shipped edge stack; the pallet patterns come from the real optimizer with your constraints.
        </p>
        <div className="text-[12px] text-white/50 space-y-1.5 mb-6">
          <div className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-emerald-400" /> Clean placements build a streak — up to ×2 on every score</div>
          <div className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-emerald-400" /> On-time orders +{ON_TIME_BONUS} bonus, late ships half</div>
          <div className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-amber-400" /> 150% speed = 3× slip risk and 3× wear • overrides below the gate risk rework</div>
        </div>
        <button onClick={() => onStart({ constraints })}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-black text-lg font-semibold rounded-3xl hover:bg-white/90 transition-all">
          Start shift <Play className="w-5 h-5 group-hover:translate-x-0.5 transition" />
        </button>
      </div>
      <div className="space-y-5">
        <div>
          <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">OPTIMIZER CONSTRAINTS (REAL RE-PLAN)</div>
          <ConstraintToggles value={constraints} onChange={setConstraints} />
        </div>
        <Leaderboard board={board} />
      </div>
    </div>
  );
}

function ReportCard({ sim, board, onAgain, onSetup }: { sim: CellSimState; board: BoardEntry[]; onAgain: () => void; onSetup: () => void }) {
  const s = sim.score;
  const gradeColor = sim.grade === 'S' ? 'text-yellow-300' : sim.grade === 'A' ? 'text-emerald-300' : sim.grade === 'B' ? 'text-sky-300' : 'text-white/60';
  const rows = [
    ['Points', s.points], ['Pallets shipped', s.palletsCompleted], ['On-time / late', `${s.onTimeOrders} / ${s.lateOrders}`],
    ['Throughput', `${s.throughputPerMin}/min`], ['Uptime', `${s.uptimePct}%`], ['Best streak', s.bestStreak],
    ['Gate-passed corrections', s.vlmApplied], ['Operator overrides', s.operatorOverrides], ['Reworks caused', s.reworks],
    ['Cache-autonomy placements', s.autonomyPlacements], ['E-stops recovered', s.faultsRecovered], ['Gripper services', s.services],
  ] as const;
  const share = () => {
    const text = `Live Cell OS shift: ${s.points} pts, grade ${sim.grade} — ${s.palletsCompleted} pallets, ${s.onTimeOrders} on-time, ${s.uptimePct}% uptime. Try to beat it: https://palletizer-app.vercel.app/demos?tab=cell`;
    navigator.clipboard?.writeText(text).then(() => toast.success('Score copied — paste it anywhere'));
  };
  return (
    <div className="glass rounded-3xl border border-white/10 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
        <div>
          <div className="text-xs tracking-[3px] text-primary mb-2 font-mono">SHIFT REPORT</div>
          <div className="flex items-baseline gap-4">
            <span className={`text-7xl font-semibold ${gradeColor}`}>{sim.grade}</span>
            <span className="text-3xl font-mono">{s.points} pts</span>
            {board.length > 0 && s.points >= board[0].points && <span className="text-yellow-300 text-sm font-mono flex items-center gap-1"><Trophy className="w-4 h-4" /> NEW BEST</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={onAgain} className="px-6 py-3 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition">Run it again</button>
          <button onClick={onSetup} className="px-6 py-3 border border-white/25 rounded-2xl hover:bg-white/5 transition">Change setup</button>
          <button onClick={share} className="px-4 py-3 border border-white/25 rounded-2xl hover:bg-white/5 transition inline-flex items-center gap-2 text-sm">
            <ClipboardCopy className="w-4 h-4" /> Copy score
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 mb-6">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 text-sm">
            <span className="text-white/50 text-xs">{k}</span>
            <span className="font-mono font-semibold">{v}</span>
          </div>
        ))}
      </div>
      {s.reworks > 0 && (
        <div className="mb-6 text-[12px] text-amber-300/80">
          {s.reworks} rework{s.reworks > 1 ? 's' : ''} came from overriding below the confidence gate — the same reason
          the shipped engine never writes a correction under {VLM_CONFIDENCE_GATE} autonomously.
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        <Leaderboard board={board} />
        <div className="glass p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10">
          <div className="text-sm font-semibold">This shift, on your line</div>
          <div className="text-xs text-white/60 mt-1 mb-3">
            The stack you just operated — orchestrator, VLM gate, cache autonomy — deploys on real cells with
            OPC UA and URScript. We bring the hardware integration, safety validation, and support.
          </div>
          <Link href={`/contact?shift=${s.points}&grade=${sim.grade}&pallets=${s.palletsCompleted}`}
            className="block text-center py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-semibold transition">
            Request a pilot →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function CellSimulator() {
  const seedRef = useRef({ seed: 1 });
  const [sim, setSim] = useState<CellSimState>(() => createSetupState());
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const mission = useMission('cell');
  const missionDone = useRef(false);
  const boardSaved = useRef(false);
  const raf = useRef<number>();

  useEffect(() => { setBoard(loadBoard()); }, []);

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

  useEffect(() => {
    const sc = sim.score;
    if (!missionDone.current && sc.autonomyPlacements > 0 && sc.vlmApplied >= 1 && sc.faultsRecovered >= 1 && sc.palletsCompleted >= 1) {
      missionDone.current = true;
      mission.complete();
    }
    if (sim.phase === 'report' && !boardSaved.current) {
      boardSaved.current = true;
      const entry: BoardEntry = { points: sc.points, grade: sim.grade ?? 'C', pallets: sc.palletsCompleted, onTime: sc.onTimeOrders, date: Date.now() };
      const next = [...loadBoard(), entry].sort((a, b) => b.points - a.points).slice(0, 5);
      saveBoard(next);
      setBoard(next);
    }
    if (sim.phase !== 'report') boardSaved.current = false;
  }, [sim, mission]);

  const start = useCallback((setup: ShiftSetup) => {
    seedRef.current.seed += 1;
    setSim((s) => actionStartShift(s, setup, seedRef.current));
  }, []);

  const act = (fn: (s: CellSimState) => CellSimState, note?: string) => {
    setSim((s) => fn(s));
    if (note) toast(note);
  };

  if (sim.phase === 'setup') {
    return (
      <div className="space-y-4">
        <MissionBanner demo="cell" />
        <SetupScreen onStart={start} board={board} />
      </div>
    );
  }

  if (sim.phase === 'report') {
    return (
      <div className="space-y-4">
        <MissionBanner demo="cell" />
        <ReportCard sim={sim} board={board} onAgain={() => start(sim.setup)} onSetup={() => setSim(createSetupState())} />
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
      <Hud sim={sim} onService={() => act(actionServiceGripper)} />

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-4">
          <div className="glass rounded-3xl border border-white/10 overflow-hidden relative">
            <CellScene
              boxes={sim.plan.boxes}
              activeIndex={sim.activeIndex}
              progress={sim.progress}
              placedCount={sim.placedCount}
              state={sim.state}
              gripperWear={sim.gripperWear}
              heightClass="h-[480px]"
              palletTag={sim.activeOrder ? `${sim.activeOrder.id} • ${sim.plan.plan_id}` : sim.plan.plan_id}
            />
            {/* Floating score popups — driven by real sim events */}
            <div className="absolute top-3 right-3 flex flex-col items-end gap-1 pointer-events-none">
              <AnimatePresence>
                {sim.popups.map((p) => (
                  <motion.div key={p.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs border backdrop-blur ${
                      p.kind === 'good' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                      : p.kind === 'bad' ? 'text-red-300 border-red-400/30 bg-red-400/10'
                      : 'text-white/70 border-white/20 bg-white/10'}`}>
                    {p.text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {sim.maintenance > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-white/10 border border-white/25 text-white/80 text-xs font-mono tracking-wider flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5" /> GRIPPER SERVICE — {sim.maintenance.toFixed(1)}s
              </div>
            )}
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
            {sim.state === 'EXCEPTION_HANDLING' && !held && (
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
              {sim.speedOverride > 1 ? '3× slip risk, 3× wear — deadlines vs damage, your call.' : sim.speedOverride < 1 ? 'Slow and safe — the queue will not wait.' : 'Nominal cycle, nominal risk.'}
            </span>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <OrderQueue sim={sim} onPrioritize={(id) => act((s) => actionPrioritizeOrder(s, id))} />

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
                  <span className="block text-[11px] text-white/40">Force an exception — the cell already slips on its own at speed and wear</span>
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
              CONSTRAINTS {sim.setupQueued && <span className="text-emerald-300">• RE-PLAN QUEUED</span>}
            </div>
            <ConstraintToggles value={sim.queuedSetup.constraints}
              onChange={(c) => act((s) => actionQueueSetup(s, { constraints: c }))} />
            <div className="mt-2 text-[11px] text-white/35">Applied when the next pattern arms — the real optimizer re-plans.</div>
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
