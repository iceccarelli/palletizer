// Mission progress for the demo suite. Persisted locally (localStorage) —
// no accounts, no tracking, just "did this visitor master each demo".
// Every mission is verified against REAL engine state: you cannot complete
// one without the geometry actually confirming it.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Mission {
  id: string;
  demo: string; // tab id
  title: string;
  detail: string;
  /** Shown after completion — reinforces what the user just proved. */
  proof: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 'wreck_rescue',
    demo: 'main',
    title: 'Wreck & Rescue',
    detail: 'Drag a box until the load goes RED (unstable), then rearrange it back to GREEN with stability ≥ 0.80.',
    proof: 'You broke a validated load and repaired it — every color change you saw was the real support-ratio math.',
  },
  {
    id: 'tradeoff_scout',
    demo: 'ecomm',
    title: 'Trade-off Scout',
    detail: 'Watch a full 36-box build, then flip High-Velocity mode and read the measured density-vs-cycle delta.',
    proof: 'You just compared two real plans for the same chaotic order — the trade-off numbers were computed, not quoted.',
  },
  {
    id: 'crash_recover',
    demo: 'stress',
    title: 'Crash & Recover',
    detail: 'Break the pharma load (score < 0.60 or a collapse in the drop test), then re-stabilize to ≥ 0.85.',
    proof: 'You watched a rigid-body engine confirm what the stability score predicted — then fixed it with constraints.',
  },
  {
    id: 'load_balancer',
    demo: 'multi',
    title: 'Load Balancer',
    detail: 'Move at least one box between pallets and get BOTH pallets to stability ≥ 0.85.',
    proof: 'Both pallets re-optimized and re-validated on every move you made — that is the live order-splitting logic.',
  },
  {
    id: 'line_surgeon',
    demo: 'robot',
    title: 'Line Surgeon',
    detail: 'Pause the robot mid-run, drag a placed box, then export URScript for only the remaining picks.',
    proof: 'You edited a build in flight and got a valid program for the rest — closed-loop execution, not a movie.',
  },
  {
    id: 'constraint_whisperer',
    demo: 'twin',
    title: 'Constraint Whisperer',
    detail: 'Get the Co-Pilot to apply 2+ constraints from a single sentence (e.g. mention glass AND a height limit).',
    proof: 'One sentence became a strict constraint set, and the same deterministic engine re-planned around it.',
  },
];

export const missionForDemo = (demo: string) => MISSIONS.find((m) => m.demo === demo)!;

interface ProgressState {
  completed: Record<string, number>; // mission id -> epoch ms
  engineBeaten: boolean; // bonus: user layout beat engine density while stable
  markDone: (id: string) => boolean; // true if newly completed
  markEngineBeaten: () => boolean;
  reset: () => void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      completed: {},
      engineBeaten: false,
      markDone: (id) => {
        if (get().completed[id]) return false;
        set((s) => ({ completed: { ...s.completed, [id]: Date.now() } }));
        return true;
      },
      markEngineBeaten: () => {
        if (get().engineBeaten) return false;
        set({ engineBeaten: true });
        return true;
      },
      reset: () => set({ completed: {}, engineBeaten: false }),
    }),
    { name: 'palletizer-progress-v1', storage: createJSONStorage(() => localStorage) },
  ),
);
