// Live Cell OS simulation — a faithful browser mirror of the shipped edge stack:
//   gateway/edge_orchestrator.py  -> state machine, heartbeat watchdog, cache autonomy
//   core/ai/vlm_exception_engine.py -> 0.4s inference rolls, confidence gate > 0.95
// Same state names, same thresholds, same recovery semantics. No canned outcomes:
// every transition below is computed from the same rules the Python cell runs.

import { BoxSpec, Placement, WebPlan } from './types';
import { planFromBoxes } from './optimizer';

export type EdgeState = 'IDLE' | 'MOVING' | 'EXCEPTION_HANDLING' | 'FAULT_ESTOP';

// Constants mirrored 1:1 from the Python edge stack.
export const HEARTBEAT_INTERVAL_S = 0.5;
export const HEARTBEAT_TIMEOUT_S = 2.5;
export const VLM_INFERENCE_S = 0.4;
export const VLM_CONFIDENCE_GATE = 0.95;
export const MAX_CORRECTION_MM = 50;

export interface CellEvent {
  t: number; // sim seconds
  kind: 'info' | 'vlm_pass' | 'vlm_reject' | 'fault' | 'autonomy' | 'pallet';
  text: string;
}

export interface CellScore {
  palletsCompleted: number;
  placementsDone: number;
  vlmApplied: number;
  vlmEscalated: number;
  autonomyPlacements: number; // placements finished while cloud link was down
  faultsRecovered: number;
  uptimePct: number;
}

export interface CellSimState {
  state: EdgeState;
  plan: WebPlan;
  activeIndex: number; // -1 = none
  progress: number; // 0..1 of active placement
  placedCount: number;
  heartbeat: number;
  heartbeatStalled: boolean;
  cloudConnected: boolean;
  cacheArmed: boolean; // active pattern is safe in the local cache
  vlmRollTimer: number; // seconds until next inference result
  lastVlm: { confidence: number; dx: number; dy: number } | null;
  events: CellEvent[];
  score: CellScore;
  // internal clocks
  simTime: number;
  hbAccum: number;
  hbLastChange: number;
  faultTime: number; // time spent latched
  palletDwell: number; // pause between pallets
  cloudCutDuringRun: boolean;
  frameCounter: number;
}

// Deterministic PRNG (mulberry32) — same spirit as the Python engine hashing
// frame ids: repeatable rolls, no invented numbers.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACEMENT_SPEED = 0.55; // progress units / sec, matches DemoRobot pacing

function cellSkus(seed: number): BoxSpec[] {
  // Compact mixed-SKU order: quick pallet cycles keep the game tight.
  const rand = mulberry32(seed * 7919 + 13);
  const base: BoxSpec[] = [];
  const families = [
    { l: 380, w: 280, h: 220, kg: 9 },
    { l: 300, w: 300, h: 180, kg: 7 },
    { l: 420, w: 320, h: 260, kg: 12 },
    { l: 260, w: 200, h: 160, kg: 4 },
  ];
  for (let i = 0; i < 12; i++) {
    const f = families[Math.floor(rand() * families.length)];
    base.push({
      sku_id: `CELL-${seed}-${i}`,
      length_mm: f.l + Math.round(rand() * 40 - 20),
      width_mm: f.w + Math.round(rand() * 40 - 20),
      height_mm: f.h + Math.round(rand() * 30 - 15),
      weight_kg: Math.round((f.kg + rand() * 3) * 10) / 10,
      fragility: rand() < 0.2 ? 0.8 : 0,
    });
  }
  return base;
}

export function createCellSim(seed = 1): CellSimState {
  const plan = planFromBoxes(cellSkus(seed), {}, undefined, `plan_cell_${seed}`);
  return {
    state: 'IDLE',
    plan,
    activeIndex: -1,
    progress: 0,
    placedCount: 0,
    heartbeat: 0,
    heartbeatStalled: false,
    cloudConnected: true,
    cacheArmed: true, // arming a pattern caches it immediately (edge_orchestrator.load_pattern)
    vlmRollTimer: 0,
    lastVlm: null,
    events: [
      { t: 0, kind: 'info', text: `Pattern ${plan.plan_id} armed: ${plan.boxes.length} placements — cached to local disk` },
    ],
    score: {
      palletsCompleted: 0,
      placementsDone: 0,
      vlmApplied: 0,
      vlmEscalated: 0,
      autonomyPlacements: 0,
      faultsRecovered: 0,
      uptimePct: 100,
    },
    simTime: 0,
    hbAccum: 0,
    hbLastChange: 0,
    faultTime: 0,
    palletDwell: 0,
    cloudCutDuringRun: false,
    frameCounter: 0,
  };
}

function pushEvent(s: CellSimState, kind: CellEvent['kind'], text: string) {
  s.events = [...s.events.slice(-39), { t: s.simTime, kind, text }];
}

// ---------------------------------------------------------------------------
// Player actions (the sabotage deck)
// ---------------------------------------------------------------------------
export function actionCutCloud(s: CellSimState): CellSimState {
  const n = { ...s, cloudConnected: false, cloudCutDuringRun: s.placedCount < s.plan.boxes.length };
  pushEvent(n, 'autonomy', 'Cloud link severed — active pallet continues from local pattern cache');
  return n;
}

export function actionRestoreCloud(s: CellSimState): CellSimState {
  const n = { ...s, cloudConnected: true };
  pushEvent(n, 'info', 'Cloud link restored — pattern sync resumed');
  return n;
}

export function actionMisfeed(s: CellSimState): CellSimState {
  if (s.state !== 'MOVING') return s;
  const n: CellSimState = { ...s, state: 'EXCEPTION_HANDLING', vlmRollTimer: VLM_INFERENCE_S };
  pushEvent(n, 'info', `Misfed box at placement #${s.activeIndex} — cell holds safe pose, VLM engine engaged`);
  return n;
}

export function actionStallHeartbeat(s: CellSimState): CellSimState {
  if (s.heartbeatStalled || s.state === 'FAULT_ESTOP') return s;
  const n = { ...s, heartbeatStalled: true };
  pushEvent(n, 'info', 'PLC heartbeat frozen — watchdog counting down 2.5 s');
  return n;
}

export function actionResetFault(s: CellSimState): CellSimState {
  if (s.state !== 'FAULT_ESTOP') return s;
  const n: CellSimState = {
    ...s,
    state: 'IDLE',
    heartbeatStalled: false,
    hbLastChange: s.simTime,
    score: { ...s.score, faultsRecovered: s.score.faultsRecovered + 1 },
  };
  pushEvent(n, 'info', `Operator reset acknowledged — resuming at placement #${s.placedCount} (nothing lost)`);
  return n;
}

// ---------------------------------------------------------------------------
// The tick — one deterministic control-loop step
// ---------------------------------------------------------------------------
export function tickCellSim(prev: CellSimState, dt: number, seedRef: { seed: number }): CellSimState {
  const s: CellSimState = { ...prev, score: { ...prev.score } };
  s.simTime += dt;

  // Heartbeat publisher (mock cell: +1 every 500 ms)
  if (!s.heartbeatStalled) {
    s.hbAccum += dt;
    while (s.hbAccum >= HEARTBEAT_INTERVAL_S) {
      s.hbAccum -= HEARTBEAT_INTERVAL_S;
      s.heartbeat += 1;
      s.hbLastChange = s.simTime;
    }
  }

  // Watchdog (edge_orchestrator._check_heartbeat)
  if (s.state !== 'FAULT_ESTOP' && s.simTime - s.hbLastChange > HEARTBEAT_TIMEOUT_S) {
    s.state = 'FAULT_ESTOP';
    pushEvent(s, 'fault', `Heartbeat stalled > ${HEARTBEAT_TIMEOUT_S}s — FAULT_ESTOP latched, no motion commands issued`);
  }

  if (s.state === 'FAULT_ESTOP') {
    s.faultTime += dt;
    s.score.uptimePct = Math.round(((s.simTime - s.faultTime) / Math.max(s.simTime, 0.001)) * 1000) / 10;
    return s;
  }

  // VLM exception path (vlm_exception_engine.handle_exception)
  if (s.state === 'EXCEPTION_HANDLING') {
    s.vlmRollTimer -= dt;
    if (s.vlmRollTimer <= 0) {
      s.frameCounter += 1;
      const rand = mulberry32(seedRef.seed * 104729 + s.frameCounter * 31);
      const confidence = Math.round((0.9 + rand() * 0.1) * 10000) / 10000;
      const dx = Math.round((rand() - 0.5) * 24 * 100) / 100;
      const dy = Math.round((rand() - 0.5) * 24 * 100) / 100;
      s.lastVlm = { confidence, dx, dy };
      if (confidence > VLM_CONFIDENCE_GATE) {
        s.score.vlmApplied += 1;
        s.state = 'MOVING';
        pushEvent(
          s,
          'vlm_pass',
          `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} > ${VLM_CONFIDENCE_GATE} — correction dx=${dx} dy=${dy} mm written, move re-armed`
        );
      } else {
        s.score.vlmEscalated += 1;
        s.vlmRollTimer = VLM_INFERENCE_S; // next frame, next roll — motion never guesses
        pushEvent(
          s,
          'vlm_reject',
          `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} ≤ ${VLM_CONFIDENCE_GATE} — no autonomous write, re-imaging`
        );
      }
    }
    s.score.uptimePct = Math.round(((s.simTime - s.faultTime) / Math.max(s.simTime, 0.001)) * 1000) / 10;
    return s;
  }

  // Pallet dwell between builds
  if (s.palletDwell > 0) {
    s.palletDwell -= dt;
    if (s.palletDwell <= 0) {
      seedRef.seed += 1;
      const source = s.cloudConnected ? 'cloud' : 'local cache';
      const fresh = createCellSim(seedRef.seed);
      pushEvent(fresh, s.cloudConnected ? 'info' : 'autonomy', `Next pattern ${fresh.plan.plan_id} served from ${source}`);
      // carry the running score, clocks, and link state across pallets
      return {
        ...fresh,
        cloudConnected: s.cloudConnected,
        cloudCutDuringRun: false,
        simTime: s.simTime,
        hbLastChange: s.simTime,
        heartbeat: s.heartbeat,
        faultTime: s.faultTime,
        score: s.score,
        events: [...s.events.slice(-30), ...fresh.events],
      };
    }
    return s;
  }

  // Dispatch / motion (edge_orchestrator._step_state_machine)
  if (s.placedCount >= s.plan.boxes.length) {
    s.score.palletsCompleted += 1;
    s.state = 'IDLE';
    s.activeIndex = -1;
    s.palletDwell = 1.6;
    pushEvent(s, 'pallet', `Pattern ${s.plan.plan_id} complete — ${s.plan.boxes.length} placements, pallet #${s.score.palletsCompleted} out`);
    return s;
  }

  if (s.state === 'IDLE') {
    s.state = 'MOVING';
    s.activeIndex = s.placedCount;
    s.progress = 0;
  }

  if (s.state === 'MOVING') {
    s.progress += dt * PLACEMENT_SPEED;
    if (s.progress >= 1) {
      s.placedCount += 1;
      s.score.placementsDone += 1;
      if (!s.cloudConnected) s.score.autonomyPlacements += 1;
      s.progress = 0;
      s.activeIndex = s.placedCount < s.plan.boxes.length ? s.placedCount : -1;
      s.state = 'IDLE';
    }
  }

  s.score.uptimePct = Math.round(((s.simTime - s.faultTime) / Math.max(s.simTime, 0.001)) * 1000) / 10;
  return s;
}
