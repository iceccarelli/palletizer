"use client";

// Game-layer UI for the demo suite. The rule that keeps this honest:
// a mission can only complete when the ENGINE's own state confirms it —
// these components render progress, they never decide it.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, CheckCircle2, Swords, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { MISSIONS, missionForDemo, useProgress } from '@/lib/palletizer/progress';

/** SSR-safe gate: persisted progress only renders after client hydration. */
export function useHydrated() {
  const [h, setH] = React.useState(false);
  React.useEffect(() => setH(true), []);
  return h;
}

/** Fire-once completion with celebration. Call from real engine-state checks. */
export function useMission(demo: string) {
  const mission = missionForDemo(demo);
  const done = useProgress((s) => Boolean(s.completed[mission.id]));
  const markDone = useProgress((s) => s.markDone);

  const complete = React.useCallback(() => {
    if (markDone(mission.id)) {
      toast.success(`Mission complete — ${mission.title}`, {
        description: mission.proof,
        icon: <Trophy className="w-4 h-4 text-amber-400" />,
        duration: 7000,
      });
    }
  }, [markDone, mission]);

  return { mission, done, complete };
}

/** Radial dot burst — pure framer-motion, no canvas, fires on completion. */
function Burst() {
  const dots = Array.from({ length: 12 }, (_, i) => i);
  const colors = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6'];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {dots.map((i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * 70, y: Math.sin(angle) * 42, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

export function MissionBanner({ demo }: { demo: string }) {
  const mission = missionForDemo(demo);
  const hydrated = useHydrated();
  const done = useProgress((s) => Boolean(s.completed[mission.id])) && hydrated;
  const [justDone, setJustDone] = React.useState(false);
  const prev = React.useRef(done);

  React.useEffect(() => {
    if (done && !prev.current) {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 1200);
      return () => clearTimeout(t);
    }
    prev.current = done;
  }, [done]);

  return (
    <motion.div
      layout
      className={`relative mb-4 px-4 py-3 rounded-2xl border flex items-start gap-3 text-sm transition-colors ${
        done ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-amber-500/30 bg-amber-950/15'
      }`}
    >
      {justDone && <Burst />}
      {done ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
      ) : (
        <Target className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
      )}
      <div>
        <div className="font-semibold tracking-wide">
          <span className="text-[10px] tracking-[2px] text-white/50 mr-2">MISSION</span>
          {mission.title}
        </div>
        <div className="text-white/70 mt-0.5">{done ? mission.proof : mission.detail}</div>
      </div>
    </motion.div>
  );
}

/**
 * You vs Engine — live scoreboard for the Production demo.
 * Both sides are computed by the same engine; "beating" it means the user's
 * hand layout has genuinely higher density at stability ≥ 0.80. Possible
 * (compact the top layer into gaps to lower stack height) but hard — that
 * difficulty is the game.
 */
export function ScoreDuel({
  engine,
  yours,
  edited,
}: {
  engine: { density: number; stability: number } | null;
  yours: { density: number; stability: number } | null;
  edited: boolean;
}) {
  const markEngineBeaten = useProgress((s) => s.markEngineBeaten);
  const beaten = Boolean(
    edited && engine && yours && yours.stability >= 0.8 && yours.density > engine.density + 1e-6,
  );

  React.useEffect(() => {
    if (beaten && markEngineBeaten()) {
      toast.success('ENGINE BEATEN', {
        description: 'Your hand layout is denser than the optimizer at stability ≥ 0.80 — screenshot this, it is rare.',
        icon: <Swords className="w-4 h-4 text-rose-400" />,
        duration: 9000,
      });
    }
  }, [beaten, markEngineBeaten]);

  if (!engine || !yours) return null;

  const Bar = ({ label, value, color, max = 1 }: { label: string; value: number; color: string; max?: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-14 text-[10px] text-white/50 tracking-wider">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="w-12 text-right font-mono text-xs">{(value * 100).toFixed(1)}%</div>
    </div>
  );

  return (
    <div className="glass rounded-2xl border border-white/10 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[2px] text-white/50 flex items-center gap-2">
          <Swords className="w-3.5 h-3.5" /> YOU VS ENGINE
        </div>
        <div className={`text-[10px] tracking-wider ${beaten ? 'text-rose-400 font-semibold' : 'text-white/40'}`}>
          {beaten ? 'ENGINE BEATEN' : edited ? 'BEAT ITS DENSITY AT STABILITY ≥ 0.80' : 'DRAG A BOX TO ENTER'}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-x-6 gap-y-1.5">
        <div className="space-y-1.5">
          <div className="text-[10px] text-white/40">ENGINE PLAN</div>
          <Bar label="DENSITY" value={engine.density} color="rgba(96,165,250,.9)" />
          <Bar label="STABILITY" value={engine.stability} color="rgba(96,165,250,.55)" />
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] text-white/40">YOUR LAYOUT {edited ? '' : '(unedited — identical)'}</div>
          <Bar label="DENSITY" value={yours.density} color={beaten ? 'rgba(244,63,94,.9)' : 'rgba(52,211,153,.9)'} />
          <Bar label="STABILITY" value={yours.stability} color={yours.stability >= 0.8 ? 'rgba(52,211,153,.55)' : 'rgba(251,191,36,.7)'} />
        </div>
      </div>
    </div>
  );
}

/** Header progress: mastered n/total with per-mission pips. */
const EMPTY_COMPLETED: Record<string, number> = {};

export function ProgressMeter({ onNavigate }: { onNavigate?: (demo: string) => void }) {
  const hydrated = useHydrated();
  const completedRaw = useProgress((s) => s.completed);
  const completed = hydrated ? completedRaw : EMPTY_COMPLETED;
  const engineBeaten = useProgress((s) => s.engineBeaten);
  const reset = useProgress((s) => s.reset);
  const n = MISSIONS.filter((m) => completed[m.id]).length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        {MISSIONS.map((m) => {
          const done = Boolean(completed[m.id]);
          return (
            <button
              key={m.id}
              title={`${m.title}${done ? ' ✓' : ''} — ${m.detail}`}
              onClick={() => onNavigate?.(m.demo)}
              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                done
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                  : 'bg-white/5 border-white/15 text-white/30 hover:border-white/40'
              }`}
            >
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Target className="w-3 h-3" />}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-white/60">
        <span className="font-mono text-white">{n}/{MISSIONS.length}</span> missions
        {engineBeaten && <span className="ml-2 text-rose-400 font-semibold tracking-wider">⚔ ENGINE BEATEN</span>}
        {n === 6 && <span className="ml-2 text-amber-300 font-semibold tracking-wider">★ SUITE MASTERED</span>}
      </div>
      {n > 0 && (
        <button onClick={reset} title="Reset progress" className="text-white/25 hover:text-white/60 transition">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** First-visit hint chip — dismisses on first interaction with the scene. */
export function HintChip({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-black/70 border border-white/15 text-xs text-white/80 backdrop-blur pointer-events-none"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
