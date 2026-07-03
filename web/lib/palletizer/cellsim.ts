// Live Cell OS simulation v2 — a faithful, PLAYABLE browser mirror of the
// shipped edge stack:
//   gateway/edge_orchestrator.py   -> state machine, heartbeat watchdog, cache autonomy
//   core/ai/vlm_exception_engine.py -> 0.4s inference rolls, confidence gate > 0.95
//   core/connectors/ur_bridge.py    -> speed override maps to URScript v-scaling
// Same state names, same thresholds, same recovery semantics — plus real operator
// decisions with real consequences: speed override raises misfeed risk, constraint
// toggles re-plan the next pattern through the real optimizer, and below-gate
// operator overrides carry a rework risk the gate exists to prevent.

import { BoxSpec, OptimizeConstraints, WebPlan } from './types';
import { planFromBoxes } from './optimizer';
import { BEVERAGE_ORDER, PHARMA_SKUS, ecommChaosSkus } from './sampleData';

export type EdgeState = 'IDLE' | 'MOVING' | 'EXCEPTION_HANDLING' | 'FAULT_ESTOP';
export type OrderProfile = 'beverage' | 'ecomm' | 'pharma';

// Constants mirrored 1:1 from the Python edge stack.
export const HEARTBEAT_INTERVAL_S = 0.5;
export const HEARTBEAT_TIMEOUT_S = 2.5;
export const VLM_INFERENCE_S = 0.4;
export const VLM_CONFIDENCE_GATE = 0.95;
export const SHIFT_LENGTH_S = 180;

export const SPEED_STEPS = [0.5, 0.75, 1.0, 1.5] as const;
const BASE_PLACEMENT_SPEED = 0.55; // progress/s at 100% override

export const PROFILES: Record<OrderProfile, { label: string; desc: string; palletBonus: number }> = {
  beverage: { label: 'Beverage FMCG', desc: 'Heavy uniform cases — forgiving, fast', palletBonus: 40 },
  ecomm: { label: 'High-Mix E-comm', desc: '~15% fragile chaos cartons — moderate risk', palletBonus: 55 },
  pharma: { label: 'Pharma / Glass', desc: 'Vials and fragile loads — high stakes', palletBonus: 75 },
};

export interface CellEvent {
  t: number;
  kind: 'info' | 'vlm_pass' | 'vlm_reject' | 'fault' | 'autonomy' | 'pallet' | 'exception' | 'rework' | 'operator';
  text: string;
}

export interface CellScore {
  points: number;
  palletsCompleted: number;
  placementsDone: number;
  vlmApplied: number;
  vlmEscalated: number;
  operatorOverrides: number;
  reworks: number;
  autonomyPlacements: number;
  faultsRecovered: number;
  uptimePct: number;
  throughputPerMin: number;
}

export interface ShiftSetup {
  profile: OrderProfile;
  constraints: { max_height_mm?: number; heavy_low?: boolean; fragile_high?: boolean };
}

export interface CellSimState {
  phase: 'setup' | 'running' | 'report';
  state: EdgeState;
  plan: WebPlan;
  setup: ShiftSetup;
  queuedSetup: ShiftSetup; // takes effect at the next pattern arm
  setupQueued: boolean;
  speedOverride: number;
  activeIndex: number;
  progress: number;
  placedCount: number;
  heartbeat: number;
  heartbeatStalled: boolean;
  cloudConnected: boolean;
  vlmRollTimer: number;
  heldFrame: { confidence: number; dx: number; dy: number; frame: number } | null;
  organicRolled: boolean; // one organic-misfeed roll per placement
  events: CellEvent[];
  score: CellScore;
  shiftElapsed: number;
  grade: 'S' | 'A' | 'B' | 'C' | null;
  // internal clocks
  simTime: number;
  hbAccum: number;
  hbLastChange: number;
  faultTime: number;
  faultPenalized: boolean;
  palletDwell: number;
  frameCounter: number;
  palletSeq: number;
}

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

function profileSkus(profile: OrderProfile, seq: number): BoxSpec[] {
  if (profile === 'beverage') {
    const rot = (seq * 5) % Math.max(1, BEVERAGE_ORDER.length - 14);
    return BEVERAGE_ORDER.slice(rot, rot + 14);
  }
  if (profile === 'ecomm') return ecommChaosSkus(14, 42 + seq);
  return [...PHARMA_SKUS, ...PHARMA_SKUS.slice(0, 4)].map((s, i) => ({ ...s, sku_id: `${s.sku_id}-${seq}-${i}` })).slice(0, 13);
}

function buildPlan(setup: ShiftSetup, seq: number): WebPlan {
  const constraints: OptimizeConstraints = {
    ...(setup.constraints.max_height_mm ? { max_height_mm: setup.constraints.max_height_mm } : {}),
    ...(setup.constraints.heavy_low ? { heavy_low: true } : {}),
    ...(setup.constraints.fragile_high ? { fragile_high: true } : {}),
  };
  return planFromBoxes(profileSkus(setup.profile, seq), constraints, undefined, `plan_${setup.profile}_${seq}`);
}

function freshScore(): CellScore {
  return {
    points: 0, palletsCompleted: 0, placementsDone: 0, vlmApplied: 0, vlmEscalated: 0,
    operatorOverrides: 0, reworks: 0, autonomyPlacements: 0, faultsRecovered: 0,
    uptimePct: 100, throughputPerMin: 0,
  };
}

export function createSetupState(): CellSimState {
  const setup: ShiftSetup = { profile: 'beverage', constraints: {} };
  return {
    phase: 'setup', state: 'IDLE', plan: buildPlan(setup, 1), setup, queuedSetup: setup, setupQueued: false,
    speedOverride: 1.0, activeIndex: -1, progress: 0, placedCount: 0,
    heartbeat: 0, heartbeatStalled: false, cloudConnected: true,
    vlmRollTimer: 0, heldFrame: null, organicRolled: false,
    events: [], score: freshScore(), shiftElapsed: 0, grade: null,
    simTime: 0, hbAccum: 0, hbLastChange: 0, faultTime: 0, faultPenalized: false,
    palletDwell: 0, frameCounter: 0, palletSeq: 1,
  };
}

function pushEvent(s: CellSimState, kind: CellEvent['kind'], text: string) {
  s.events = [...s.events.slice(-49), { t: s.shiftElapsed, kind, text }];
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
export function actionStartShift(s: CellSimState, setup: ShiftSetup): CellSimState {
  const plan = buildPlan(setup, 1);
  const n: CellSimState = {
    ...createSetupState(), phase: 'running', setup, queuedSetup: setup, plan,
    speedOverride: s.speedOverride,
  };
  pushEvent(n, 'info', `Shift started — pattern ${plan.plan_id} armed: ${plan.boxes.length} placements, cached to local disk`);
  const c = setup.constraints;
  const parts = [c.max_height_mm ? `max_height ${c.max_height_mm}mm` : '', c.heavy_low ? 'heavy_low' : '', c.fragile_high ? 'fragile_high' : ''].filter(Boolean);
  if (parts.length) pushEvent(n, 'info', `Optimizer constraints active: ${parts.join(', ')}`);
  return n;
}

export function actionSetSpeed(s: CellSimState, speed: number): CellSimState {
  if (speed === s.speedOverride) return s;
  const n = { ...s, speedOverride: speed };
  pushEvent(n, 'operator', `Speed override -> ${Math.round(speed * 100)}% (URScript v-scale ${(0.25 * speed).toFixed(3)} m/s)${speed > 1 ? ' — misfeed risk elevated' : ''}`);
  return n;
}

export function actionQueueSetup(s: CellSimState, setup: ShiftSetup): CellSimState {
  const n = { ...s, queuedSetup: setup, setupQueued: true };
  pushEvent(n, 'operator', `Re-plan queued for next pattern: ${PROFILES[setup.profile].label}`);
  return n;
}

export function actionCutCloud(s: CellSimState): CellSimState {
  const n = { ...s, cloudConnected: false };
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
  const n: CellSimState = { ...s, state: 'EXCEPTION_HANDLING', vlmRollTimer: VLM_INFERENCE_S, heldFrame: null };
  pushEvent(n, 'exception', `Misfed box at placement #${s.activeIndex} — cell holds safe pose, VLM engine engaged`);
  return n;
}

export function actionStallHeartbeat(s: CellSimState): CellSimState {
  if (s.heartbeatStalled || s.state === 'FAULT_ESTOP') return s;
  const n = { ...s, heartbeatStalled: true };
  pushEvent(n, 'info', `PLC heartbeat frozen — watchdog counting down ${HEARTBEAT_TIMEOUT_S}s`);
  return n;
}

export function actionResetFault(s: CellSimState): CellSimState {
  if (s.state !== 'FAULT_ESTOP') return s;
  const n: CellSimState = {
    ...s, state: 'IDLE', heartbeatStalled: false, hbLastChange: s.simTime, faultPenalized: false,
    score: { ...s.score, faultsRecovered: s.score.faultsRecovered + 1 },
  };
  pushEvent(n, 'info', `Operator reset acknowledged — resuming at placement #${s.placedCount} (nothing lost)`);
  return n;
}

/** Operator accepts a below-gate correction. The gate exists for a reason:
 *  this carries a real rework risk, resolved deterministically per frame. */
export function actionOperatorApprove(s: CellSimState, seedRef: { seed: number }): CellSimState {
  if (s.state !== 'EXCEPTION_HANDLING' || !s.heldFrame) return s;
  const rand = mulberry32(seedRef.seed * 48271 + s.heldFrame.frame * 17 + 5);
  const clean = rand() < 0.7;
  const n: CellSimState = { ...s, score: { ...s.score, operatorOverrides: s.score.operatorOverrides + 1 }, heldFrame: null, state: 'MOVING' };
  if (clean) {
    pushEvent(n, 'operator', `Operator override: applied dx=${s.heldFrame.dx} dy=${s.heldFrame.dy} mm at conf ${s.heldFrame.confidence.toFixed(4)} — placement clean`);
  } else {
    n.score.reworks += 1;
    n.score.points = Math.max(0, n.score.points - 15);
    pushEvent(n, 'rework', `Operator override at conf ${s.heldFrame.confidence.toFixed(4)} misplaced the box — flagged for rework (-15 pts). The gate was right.`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// The tick — one deterministic control-loop step
// ---------------------------------------------------------------------------
function grade(score: CellScore): 'S' | 'A' | 'B' | 'C' {
  if (score.uptimePct >= 97 && score.reworks === 0 && score.points >= 900) return 'S';
  if (score.points >= 650) return 'A';
  if (score.points >= 350) return 'B';
  return 'C';
}

export function tickCellSim(prev: CellSimState, dt: number, seedRef: { seed: number }): CellSimState {
  if (prev.phase !== 'running') return prev;
  const s: CellSimState = { ...prev, score: { ...prev.score } };
  s.simTime += dt;
  s.shiftElapsed += dt;

  // End of shift
  if (s.shiftElapsed >= SHIFT_LENGTH_S) {
    s.phase = 'report';
    s.grade = grade(s.score);
    pushEvent(s, 'pallet', `Shift complete — ${s.score.palletsCompleted} pallets, ${s.score.points} pts, grade ${s.grade}`);
    return s;
  }

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
    if (!s.faultPenalized) {
      s.faultPenalized = true;
      s.score.points = Math.max(0, s.score.points - 20);
    }
    pushEvent(s, 'fault', `Heartbeat stalled > ${HEARTBEAT_TIMEOUT_S}s — FAULT_ESTOP latched, no motion commands issued (-20 pts)`);
  }

  const finalize = () => {
    s.score.uptimePct = Math.round(((s.simTime - s.faultTime) / Math.max(s.simTime, 0.001)) * 1000) / 10;
    s.score.throughputPerMin = Math.round((s.score.placementsDone / Math.max(s.shiftElapsed, 1)) * 600) / 10;
    return s;
  };

  if (s.state === 'FAULT_ESTOP') {
    s.faultTime += dt;
    return finalize();
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
      if (confidence > VLM_CONFIDENCE_GATE) {
        s.score.vlmApplied += 1;
        s.score.points += 10;
        s.state = 'MOVING';
        s.heldFrame = null;
        pushEvent(s, 'vlm_pass', `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} > ${VLM_CONFIDENCE_GATE} — correction dx=${dx} dy=${dy} mm written, move re-armed (+10 pts)`);
      } else {
        s.score.vlmEscalated += 1;
        s.heldFrame = { confidence, dx, dy, frame: s.frameCounter };
        s.vlmRollTimer = VLM_INFERENCE_S;
        pushEvent(s, 'vlm_reject', `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} ≤ ${VLM_CONFIDENCE_GATE} — held. Wait for the gate, or override at your own risk.`);
      }
    }
    return finalize();
  }

  // Pallet dwell -> arm next pattern (cache vs cloud, queued re-plan applied here)
  if (s.palletDwell > 0) {
    s.palletDwell -= dt;
    if (s.palletDwell <= 0) {
      s.palletSeq += 1;
      if (s.setupQueued) {
        s.setup = s.queuedSetup;
        s.setupQueued = false;
      }
      s.plan = buildPlan(s.setup, s.palletSeq);
      s.placedCount = 0;
      s.activeIndex = -1;
      s.progress = 0;
      const src = s.cloudConnected ? 'cloud' : 'LOCAL CACHE';
      pushEvent(s, s.cloudConnected ? 'info' : 'autonomy', `Pattern ${s.plan.plan_id} armed from ${src}: ${s.plan.boxes.length} placements (${PROFILES[s.setup.profile].label})`);
    }
    return finalize();
  }

  // Pallet complete
  if (s.placedCount >= s.plan.boxes.length) {
    s.score.palletsCompleted += 1;
    const bonus = PROFILES[s.setup.profile].palletBonus;
    s.score.points += bonus;
    s.state = 'IDLE';
    s.activeIndex = -1;
    s.palletDwell = 1.4;
    pushEvent(s, 'pallet', `Pattern ${s.plan.plan_id} complete — pallet #${s.score.palletsCompleted} out (+${bonus} pts)`);
    return finalize();
  }

  // Dispatch (edge_orchestrator._step_state_machine)
  if (s.state === 'IDLE') {
    s.state = 'MOVING';
    s.activeIndex = s.placedCount;
    s.progress = 0;
    s.organicRolled = false;
  }

  if (s.state === 'MOVING') {
    s.progress += dt * BASE_PLACEMENT_SPEED * s.speedOverride;

    // Organic misfeed roll — once per placement, mid-move. Risk scales with
    // speed override and the fragility of the box in the gripper.
    if (!s.organicRolled && s.progress >= 0.4) {
      s.organicRolled = true;
      const box = s.plan.boxes[s.activeIndex];
      const fragility = (box as { fragility?: number }).fragility ?? 0;
      const speedFactor = s.speedOverride <= 0.75 ? 0.4 : s.speedOverride <= 1.0 ? 1.0 : 3.2;
      const p = 0.05 * speedFactor * (1 + fragility * 1.5);
      const rand = mulberry32(seedRef.seed * 7907 + s.score.placementsDone * 13 + s.palletSeq);
      if (rand() < p) {
        s.state = 'EXCEPTION_HANDLING';
        s.vlmRollTimer = VLM_INFERENCE_S;
        s.heldFrame = null;
        pushEvent(s, 'exception', `Gripper slip on ${box.sku_id ?? 'box'} at ${Math.round(s.speedOverride * 100)}% speed${fragility > 0.5 ? ' (fragile)' : ''} — cell holds safe pose, VLM engaged`);
        return finalize();
      }
    }

    if (s.progress >= 1) {
      s.placedCount += 1;
      s.score.placementsDone += 1;
      s.score.points += 5;
      if (!s.cloudConnected) s.score.autonomyPlacements += 1;
      s.progress = 0;
      s.activeIndex = s.placedCount < s.plan.boxes.length ? s.placedCount : -1;
      s.state = 'IDLE';
    }
  }

  return finalize();
}
