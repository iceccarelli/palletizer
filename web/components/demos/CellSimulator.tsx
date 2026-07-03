"use client";

// Demo 7 — Live Cell OS: play the shipped edge stack.
// The four state cells below use the EXACT enum names from
// gateway/edge_orchestrator.py, and every transition, threshold, and
// confidence roll is computed by the same rules the Python cell runs.

import React, { useEffect, useRef, useState } from 'react';
import { CloudOff, Cloud, PackageX, HeartPulse, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { MissionBanner, useMission } from './game';
import { Scene } from './shared';
import {
  CellSimState,
  createCellSim,
  tickCellSim,
  actionCutCloud,
  actionRestoreCloud,
  actionMisfeed,
  actionStallHeartbeat,
  actionResetFault,
  HEARTBEAT_TIMEOUT_S,
  VLM_CONFIDENCE_GATE,
  EdgeState,
} from '@/lib/palletizer/cellsim';

const STATE_META: Record<EdgeState, { label: string; on: string; dot: string }> = {
  IDLE: { label: 'IDLE', on: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
  MOVING: { label: 'MOVING', on: 'border-sky-400/60 bg-sky-400/10 text-sky-300', dot: 'bg-sky-400' },
  EXCEPTION_HANDLING: { label: 'EXCEPTION_HANDLING', on: 'border-amber-400/60 bg-amber-400/10 text-amber-300', dot: 'bg-amber-400' },
  FAULT_ESTOP: { label: 'FAULT_ESTOP', on: 'border-red-500/70 bg-red-500/10 text-red-300', dot: 'bg-red-500' },
};

function StateRibbon({ sim }: { sim: CellSimState }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {(Object.keys(STATE_META) as EdgeState[]).map((st) => {
        const meta = STATE_META[st];
        const active = sim.state === st;
        return (
          <div
            key={st}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-mono text-[11px] tracking-wider transition-all ${
              active ? meta.on : 'border-white/10 bg-white/[0.02] text-white/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${active ? `${meta.dot} animate-pulse` : 'bg-white/15'}`} />
            {meta.label}
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
          {sim.cloudConnected ? 'CLOUD LINKED' : 'CACHE AUTONOMY'}
        </span>
        <span>UPTIME {sim.score.uptimePct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function VlmConsole({ sim }: { sim: CellSimState }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [sim.events.length]);
  const color = (k: string) =>
    k === 'vlm_pass' ? 'text-emerald-400' : k === 'vlm_reject' ? 'text-amber-400' : k === 'fault' ? 'text-red-400' : k === 'autonomy' ? 'text-sky-300' : k === 'pallet' ? 'text-violet-300' : 'text-white/50';
  return (
    <div className="glass rounded-2xl border border-white/10 p-3">
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-2">
        CELL TELEMETRY • VLM GATE &gt; {VLM_CONFIDENCE_GATE} • WATCHDOG {HEARTBEAT_TIMEOUT_S}s
      </div>
      <div className="h-44 overflow-y-auto space-y-1 font-mono text-[10.5px] leading-relaxed pr-1">
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

function Scoreboard({ sim }: { sim: CellSimState }) {
  const rows = [
    { k: 'Pallets shipped', v: sim.score.palletsCompleted },
    { k: 'Placements executed', v: sim.score.placementsDone },
    { k: 'VLM corrections applied', v: sim.score.vlmApplied },
    { k: 'Low-confidence frames held', v: sim.score.vlmEscalated },
    { k: 'Placements while cloud down', v: sim.score.autonomyPlacements },
    { k: 'E-stops recovered', v: sim.score.faultsRecovered },
  ];
  return (
    <div className="glass rounded-2xl border border-white/10 p-4">
      <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-3">SHIFT SCORE</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-white/50 text-xs">{r.k}</span>
            <span className="font-mono font-semibold">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CellSimulator() {
  const seedRef = useRef({ seed: 1 });
  const [sim, setSim] = useState<CellSimState>(() => createCellSim(1));
  const mission = useMission('cell');
  const missionDone = useRef(false);
  const cloudSurvived = useRef(false);
  const raf = useRef<number>();

  // The control loop — requestAnimationFrame drives the same tick semantics
  // the Python orchestrator runs at 100 Hz.
  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      setSim((s) => tickCellSim(s, dt, seedRef.current));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Mission: Fault Marshal — verified purely from real sim state.
  useEffect(() => {
    if (sim.score.autonomyPlacements > 0) cloudSurvived.current = true;
    if (
      !missionDone.current &&
      cloudSurvived.current &&
      sim.score.vlmApplied >= 1 &&
      sim.score.faultsRecovered >= 1 &&
      sim.score.palletsCompleted >= 1
    ) {
      missionDone.current = true;
      mission.complete();
    }
  }, [sim, mission]);

  const act = (fn: (s: CellSimState) => CellSimState, note?: string) => {
    setSim((s) => fn(s));
    if (note) toast(note);
  };

  const inFault = sim.state === 'FAULT_ESTOP';

  return (
    <div className="space-y-4">
      <MissionBanner demo="cell" />
      <StateRibbon sim={sim} />

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 glass rounded-3xl border border-white/10 overflow-hidden relative">
          <Scene
            boxes={sim.plan.boxes}
            interactive={false}
            robot={{ activeIndex: sim.activeIndex, progress: sim.progress, placedCount: sim.placedCount }}
            heightClass="h-[520px]"
            paletteTag={sim.plan.plan_id}
          />
          {inFault && (
            <div className="absolute inset-0 bg-red-950/40 backdrop-blur-[2px] flex items-center justify-center">
              <div className="text-center">
                <div className="text-red-300 font-mono tracking-[4px] text-sm mb-3">FAULT_ESTOP LATCHED</div>
                <button
                  onClick={() => act(actionResetFault, 'Fault reset — cell resumes exactly where it stopped')}
                  className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-2xl inline-flex items-center gap-2 transition"
                >
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
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="glass rounded-2xl border border-white/10 p-4">
            <div className="text-[10px] tracking-[2px] text-white/40 font-mono mb-3">SABOTAGE DECK — TRY TO STOP IT</div>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() =>
                  sim.cloudConnected
                    ? act(actionCutCloud, 'Cloud severed. Watch the cell keep placing from cache.')
                    : act(actionRestoreCloud)
                }
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left"
              >
                {sim.cloudConnected ? <CloudOff className="w-4 h-4 text-amber-400 shrink-0" /> : <Cloud className="w-4 h-4 text-sky-400 shrink-0" />}
                <span>
                  <span className="font-medium">{sim.cloudConnected ? 'Cut the cloud link' : 'Restore the cloud link'}</span>
                  <span className="block text-[11px] text-white/40">
                    {sim.cloudConnected ? 'The active pallet must finish from local cache' : 'Pattern sync resumes for future pallets'}
                  </span>
                </span>
              </button>

              <button
                onClick={() => act(actionMisfeed)}
                disabled={sim.state !== 'MOVING'}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <PackageX className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <span className="font-medium">Misfeed a box</span>
                  <span className="block text-[11px] text-white/40">Skew the active pick — only a &gt;{VLM_CONFIDENCE_GATE} confidence frame may resume it</span>
                </span>
              </button>

              <button
                onClick={() => act(actionStallHeartbeat)}
                disabled={sim.heartbeatStalled || inFault}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/15 hover:bg-white/5 text-sm transition text-left disabled:opacity-35 disabled:cursor-not-allowed"
              >
                <HeartPulse className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  <span className="font-medium">Freeze the PLC heartbeat</span>
                  <span className="block text-[11px] text-white/40">The watchdog latches FAULT_ESTOP in {HEARTBEAT_TIMEOUT_S}s — nothing moves blind</span>
                </span>
              </button>
            </div>
          </div>

          <Scoreboard sim={sim} />

          <div className="glass rounded-2xl border border-white/10 p-4 flex items-start gap-3 text-[12px] text-white/60 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            This page runs the browser mirror of the shipped edge stack — same state machine, same {HEARTBEAT_TIMEOUT_S}s
            watchdog, same &gt;{VLM_CONFIDENCE_GATE} VLM gate as{' '}
            <code className="text-white/80">gateway/edge_orchestrator.py</code>. On hardware it speaks OPC UA and URScript.
          </div>
        </div>
      </div>

      <VlmConsole sim={sim} />
    </div>
  );
}
