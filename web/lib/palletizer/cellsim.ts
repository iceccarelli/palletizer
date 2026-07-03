// Live Cell OS simulation v3 — a playable, honest mirror of the shipped edge
// stack, now with a living plant around it:
//   gateway/edge_orchestrator.py    -> state machine, watchdog, cache autonomy
//   core/ai/vlm_exception_engine.py -> 0.4s inference rolls, gate > 0.95
//   core/connectors/ur_bridge.py    -> speed override = URScript v-scaling
// New in v3: an incoming ORDER QUEUE with deadlines the operator schedules,
// a clean-placement STREAK multiplier, and GRIPPER WEAR that accumulates with
// speed and is reset by a real maintenance stop. Every mechanic is computed,
// deterministic for a given seed, and consistent with the Python semantics.

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
export const SERVICE_TIME_S = 8;
export const ON_TIME_BONUS = 25;

export const SPEED_STEPS = [0.5, 0.75, 1.0, 1.5] as const;
const BASE_PLACEMENT_SPEED = 0.55;

export const PROFILES: Record<OrderProfile, { label: string; desc: string; palletBonus: number }> = {
  beverage: { label: 'Beverage FMCG', desc: 'Heavy uniform cases — forgiving, fast', palletBonus: 40 },
  ecomm: { label: 'High-Mix E-comm', desc: '~15% fragile chaos cartons — moderate risk', palletBonus: 55 },
  pharma: { label: 'Pharma / Glass', desc: 'Vials and fragile loads — high stakes', palletBonus: 75 },
};

export interface CellOrder {
  id: string;
  profile: OrderProfile;
  deadline: number; // shiftElapsed seconds
}

export interface CellEvent {
  t: number;
  kind: 'info' | 'vlm_pass' | 'vlm_reject' | 'fault' | 'autonomy' | 'pallet' | 'exception' | 'rework' | 'operator' | 'order';
  text: string;
}

export interface Popup {
  id: number;
  t: number; // creation time (simTime)
  text: string;
  kind: 'good' | 'bad' | 'neutral';
}

export interface CellScore {
  points: number;
  palletsCompleted: number;
  onTimeOrders: number;
  lateOrders: number;
  placementsDone: number;
  vlmApplied: number;
  vlmEscalated: number;
  operatorOverrides: number;
  reworks: number;
  autonomyPlacements: number;
  faultsRecovered: number;
  services: number;
  bestStreak: number;
  uptimePct: number;
  throughputPerMin: number;
}

export interface ShiftSetup {
  constraints: { max_height_mm?: number; heavy_low?: boolean; fragile_high?: boolean };
}

export interface CellSimState {
  phase: 'setup' | 'running' | 'report';
  state: EdgeState;
  plan: WebPlan;
  setup: ShiftSetup;
  queuedSetup: ShiftSetup;
  setupQueued: boolean;
  orderQueue: CellOrder[];
  activeOrder: CellOrder | null;
  speedOverride: number;
  streak: number;
  multiplier: number;
  gripperWear: number; // 0..1
  maintenance: number; // seconds of service remaining
  activeIndex: number;
  progress: number;
  placedCount: number;
  heartbeat: number;
  heartbeatStalled: boolean;
  cloudConnected: boolean;
  vlmRollTimer: number;
  heldFrame: { confidence: number; dx: number; dy: number; frame: number } | null;
  organicRolled: boolean;
  events: CellEvent[];
  popups: Popup[];
  score: CellScore;
  shiftElapsed: number;
  grade: 'S' | 'A' | 'B' | 'C' | null;
  simTime: number;
  hbAccum: number;
  hbLastChange: number;
  faultTime: number;
  faultPenalized: boolean;
  palletDwell: number;
  frameCounter: number;
  palletSeq: number;
  popupSeq: number;
  orderSeq: number;
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

function buildPlan(setup: ShiftSetup, profile: OrderProfile, seq: number): WebPlan {
  const constraints: OptimizeConstraints = {
    ...(setup.constraints.max_height_mm ? { max_height_mm: setup.constraints.max_height_mm } : {}),
    ...(setup.constraints.heavy_low ? { heavy_low: true } : {}),
    ...(setup.constraints.fragile_high ? { fragile_high: true } : {}),
  };
  return planFromBoxes(profileSkus(profile, seq), constraints, undefined, `plan_${profile}_${seq}`);
}

function generateOrders(seed: number, startId: number, count: number, fromT: number): CellOrder[] {
  const rand = mulberry32(seed * 2654435761 + startId * 97);
  const profiles: OrderProfile[] = ['beverage', 'ecomm', 'pharma'];
  const orders: CellOrder[] = [];
  let t = fromT;
  for (let i = 0; i < count; i++) {
    t += 26 + Math.round(rand() * 16);
    orders.push({
      id: `ORD-${String(startId + i).padStart(3, '0')}`,
      profile: profiles[Math.floor(rand() * profiles.length)],
      deadline: t,
    });
  }
  return orders;
}

function freshScore(): CellScore {
  return {
    points: 0, palletsCompleted: 0, onTimeOrders: 0, lateOrders: 0, placementsDone: 0,
    vlmApplied: 0, vlmEscalated: 0, operatorOverrides: 0, reworks: 0,
    autonomyPlacements: 0, faultsRecovered: 0, services: 0, bestStreak: 0,
    uptimePct: 100, throughputPerMin: 0,
  };
}

export function createSetupState(): CellSimState {
  const setup: ShiftSetup = { constraints: {} };
  return {
    phase: 'setup', state: 'IDLE', plan: buildPlan(setup, 'beverage', 1), setup,
    queuedSetup: setup, setupQueued: false,
    orderQueue: [], activeOrder: null,
    speedOverride: 1.0, streak: 0, multiplier: 1, gripperWear: 0, maintenance: 0,
    activeIndex: -1, progress: 0, placedCount: 0,
    heartbeat: 0, heartbeatStalled: false, cloudConnected: true,
    vlmRollTimer: 0, heldFrame: null, organicRolled: false,
    events: [], popups: [], score: freshScore(), shiftElapsed: 0, grade: null,
    simTime: 0, hbAccum: 0, hbLastChange: 0, faultTime: 0, faultPenalized: false,
    palletDwell: 0, frameCounter: 0, palletSeq: 1, popupSeq: 0, orderSeq: 1,
  };
}

function pushEvent(s: CellSimState, kind: CellEvent['kind'], text: string) {
  s.events = [...s.events.slice(-59), { t: s.shiftElapsed, kind, text }];
}

function pushPopup(s: CellSimState, kind: Popup['kind'], text: string) {
  s.popupSeq += 1;
  s.popups = [...s.popups.filter((p) => s.simTime - p.t < 1.6).slice(-5), { id: s.popupSeq, t: s.simTime, text, kind }];
}

function award(s: CellSimState, base: number, label: string) {
  const pts = Math.round(base * s.multiplier);
  s.score.points += pts;
  pushPopup(s, 'good', `+${pts} ${label}`);
}

function penalize(s: CellSimState, amount: number, label: string) {
  s.score.points = Math.max(0, s.score.points - amount);
  pushPopup(s, 'bad', `−${amount} ${label}`);
}

function breakStreak(s: CellSimState) {
  if (s.streak >= 5) pushPopup(s, 'bad', `Streak ×${s.multiplier.toFixed(2)} lost`);
  s.streak = 0;
  s.multiplier = 1;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
export function actionStartShift(s: CellSimState, setup: ShiftSetup, seedRef: { seed: number }): CellSimState {
  const orders = generateOrders(seedRef.seed, 1, 6, 0);
  const first = orders[0];
  const n: CellSimState = {
    ...createSetupState(), phase: 'running', setup, queuedSetup: setup,
    speedOverride: s.speedOverride,
    orderQueue: orders.slice(1), activeOrder: first, orderSeq: 7,
    plan: buildPlan(setup, first.profile, 1),
  };
  pushEvent(n, 'info', `Shift started — ${orders.length} orders inbound`);
  pushEvent(n, 'order', `${first.id} (${PROFILES[first.profile].label}) armed as pattern ${n.plan.plan_id}: ${n.plan.boxes.length} placements, due ${first.deadline}s`);
  const c = setup.constraints;
  const parts = [c.max_height_mm ? `max_height ${c.max_height_mm}mm` : '', c.heavy_low ? 'heavy_low' : '', c.fragile_high ? 'fragile_high' : ''].filter(Boolean);
  if (parts.length) pushEvent(n, 'info', `Optimizer constraints active: ${parts.join(', ')}`);
  return n;
}

export function actionSetSpeed(s: CellSimState, speed: number): CellSimState {
  if (speed === s.speedOverride) return s;
  const n = { ...s, speedOverride: speed };
  pushEvent(n, 'operator', `Speed override -> ${Math.round(speed * 100)}% (URScript v-scale ${(0.25 * speed).toFixed(3)} m/s)${speed > 1 ? ' — misfeed risk and wear elevated' : ''}`);
  return n;
}

export function actionQueueSetup(s: CellSimState, setup: ShiftSetup): CellSimState {
  const n = { ...s, queuedSetup: setup, setupQueued: true };
  pushEvent(n, 'operator', 'Constraint re-plan queued for next pattern');
  return n;
}

/** Move an order to the front of the queue — the operator's scheduling call. */
export function actionPrioritizeOrder(s: CellSimState, orderId: string): CellSimState {
  const idx = s.orderQueue.findIndex((o) => o.id === orderId);
  if (idx <= 0) return s;
  const q = [...s.orderQueue];
  const [o] = q.splice(idx, 1);
  q.unshift(o);
  const n = { ...s, orderQueue: q };
  pushEvent(n, 'order', `${o.id} pulled to the front of the queue (due ${Math.max(0, Math.round(o.deadline - s.shiftElapsed))}s)`);
  return n;
}

/** 8s maintenance stop: resets gripper wear. Costs real shift time. */
export function actionServiceGripper(s: CellSimState): CellSimState {
  if (s.maintenance > 0 || s.state === 'FAULT_ESTOP' || s.state === 'EXCEPTION_HANDLING') return s;
  const n: CellSimState = { ...s, maintenance: SERVICE_TIME_S, state: 'IDLE', activeIndex: s.activeIndex, score: { ...s.score, services: s.score.services + 1 } };
  pushEvent(n, 'operator', `Gripper service started — ${SERVICE_TIME_S}s downtime, wear ${(s.gripperWear * 100).toFixed(0)}% -> 0%`);
  return n;
}

export function actionCutCloud(s: CellSimState): CellSimState {
  const n = { ...s, cloudConnected: false };
  pushEvent(n, 'autonomy', 'Cloud link severed — patterns keep flowing from local cache');
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
  breakStreak(n);
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

export function actionOperatorApprove(s: CellSimState, seedRef: { seed: number }): CellSimState {
  if (s.state !== 'EXCEPTION_HANDLING' || !s.heldFrame) return s;
  const rand = mulberry32(seedRef.seed * 48271 + s.heldFrame.frame * 17 + 5);
  const clean = rand() < 0.7;
  const n: CellSimState = { ...s, score: { ...s.score, operatorOverrides: s.score.operatorOverrides + 1 }, heldFrame: null, state: 'MOVING' };
  if (clean) {
    pushEvent(n, 'operator', `Operator override: applied dx=${s.heldFrame.dx} dy=${s.heldFrame.dy} mm at conf ${s.heldFrame.confidence.toFixed(4)} — placement clean`);
  } else {
    n.score.reworks += 1;
    penalize(n, 15, 'rework');
    breakStreak(n);
    pushEvent(n, 'rework', `Operator override at conf ${s.heldFrame.confidence.toFixed(4)} misplaced the box — flagged for rework. The gate was right.`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------
function grade(score: CellScore): 'S' | 'A' | 'B' | 'C' {
  if (score.uptimePct >= 97 && score.reworks === 0 && score.points >= 1400) return 'S';
  if (score.points >= 1000) return 'A';
  if (score.points >= 550) return 'B';
  return 'C';
}

export function tickCellSim(prev: CellSimState, dt: number, seedRef: { seed: number }): CellSimState {
  if (prev.phase !== 'running') return prev;
  const s: CellSimState = { ...prev, score: { ...prev.score } };
  s.simTime += dt;
  s.shiftElapsed += dt;
  s.popups = s.popups.filter((p) => s.simTime - p.t < 1.6);

  if (s.shiftElapsed >= SHIFT_LENGTH_S) {
    s.phase = 'report';
    s.grade = grade(s.score);
    pushEvent(s, 'pallet', `Shift complete — ${s.score.palletsCompleted} pallets, ${s.score.points} pts, grade ${s.grade}`);
    return s;
  }

  if (!s.heartbeatStalled) {
    s.hbAccum += dt;
    while (s.hbAccum >= HEARTBEAT_INTERVAL_S) {
      s.hbAccum -= HEARTBEAT_INTERVAL_S;
      s.heartbeat += 1;
      s.hbLastChange = s.simTime;
    }
  }

  if (s.state !== 'FAULT_ESTOP' && s.simTime - s.hbLastChange > HEARTBEAT_TIMEOUT_S) {
    s.state = 'FAULT_ESTOP';
    breakStreak(s);
    if (!s.faultPenalized) {
      s.faultPenalized = true;
      penalize(s, 20, 'E-stop');
    }
    pushEvent(s, 'fault', `Heartbeat stalled > ${HEARTBEAT_TIMEOUT_S}s — FAULT_ESTOP latched, no motion commands issued`);
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

  // Maintenance stop blocks dispatch, everything else stays alive.
  if (s.maintenance > 0) {
    s.maintenance -= dt;
    if (s.maintenance <= 0) {
      s.maintenance = 0;
      s.gripperWear = 0;
      pushEvent(s, 'operator', 'Gripper service complete — wear reset to 0%');
      pushPopup(s, 'neutral', 'Gripper serviced');
    }
    return finalize();
  }

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
        award(s, 10, 'gate-passed fix');
        s.state = 'MOVING';
        s.heldFrame = null;
        pushEvent(s, 'vlm_pass', `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} > ${VLM_CONFIDENCE_GATE} — correction dx=${dx} dy=${dy} mm written, move re-armed`);
      } else {
        s.score.vlmEscalated += 1;
        s.heldFrame = { confidence, dx, dy, frame: s.frameCounter };
        s.vlmRollTimer = VLM_INFERENCE_S;
        pushEvent(s, 'vlm_reject', `frame-${s.frameCounter}: conf ${confidence.toFixed(4)} ≤ ${VLM_CONFIDENCE_GATE} — held. Wait for the gate, or override at your own risk.`);
      }
    }
    return finalize();
  }

  if (s.palletDwell > 0) {
    s.palletDwell -= dt;
    if (s.palletDwell <= 0) {
      s.palletSeq += 1;
      if (s.setupQueued) {
        s.setup = s.queuedSetup;
        s.setupQueued = false;
      }
      // Pull the next order; top up the queue so the shift never starves.
      let queue = s.orderQueue;
      if (queue.length < 3) {
        queue = [...queue, ...generateOrders(seedRef.seed, s.orderSeq, 3, s.shiftElapsed)];
        s.orderSeq += 3;
      }
      const next = queue[0] ?? null;
      s.orderQueue = queue.slice(1);
      s.activeOrder = next;
      const profile = next ? next.profile : 'beverage';
      s.plan = buildPlan(s.setup, profile, s.palletSeq);
      s.placedCount = 0;
      s.activeIndex = -1;
      s.progress = 0;
      const src = s.cloudConnected ? 'cloud' : 'LOCAL CACHE';
      pushEvent(s, s.cloudConnected ? 'order' : 'autonomy', `${next ? next.id : 'AUTO'} armed from ${src} as ${s.plan.plan_id}: ${s.plan.boxes.length} placements (${PROFILES[profile].label})${next ? `, due ${Math.max(0, Math.round(next.deadline - s.shiftElapsed))}s` : ''}`);
    }
    return finalize();
  }

  if (s.placedCount >= s.plan.boxes.length) {
    s.score.palletsCompleted += 1;
    const order = s.activeOrder;
    const profile = order ? order.profile : 'beverage';
    const bonus = PROFILES[profile].palletBonus;
    if (order) {
      if (s.shiftElapsed <= order.deadline) {
        s.score.onTimeOrders += 1;
        award(s, bonus + ON_TIME_BONUS, `${order.id} on time`);
        pushEvent(s, 'pallet', `${order.id} shipped ON TIME — pallet #${s.score.palletsCompleted} (${Math.round(order.deadline - s.shiftElapsed)}s to spare)`);
      } else {
        s.score.lateOrders += 1;
        award(s, Math.round(bonus / 2), `${order.id} late`);
        pushEvent(s, 'pallet', `${order.id} shipped LATE — pallet #${s.score.palletsCompleted} (half bonus)`);
      }
    } else {
      award(s, bonus, 'pallet');
      pushEvent(s, 'pallet', `Pattern ${s.plan.plan_id} complete — pallet #${s.score.palletsCompleted}`);
    }
    s.state = 'IDLE';
    s.activeIndex = -1;
    s.palletDwell = 1.4;
    return finalize();
  }

  if (s.state === 'IDLE') {
    s.state = 'MOVING';
    s.activeIndex = s.placedCount;
    s.progress = 0;
    s.organicRolled = false;
  }

  if (s.state === 'MOVING') {
    s.progress += dt * BASE_PLACEMENT_SPEED * s.speedOverride;

    // Organic misfeed roll — risk scales with speed, box fragility, AND wear.
    if (!s.organicRolled && s.progress >= 0.4) {
      s.organicRolled = true;
      const box = s.plan.boxes[s.activeIndex];
      const fragility = (box as { fragility?: number }).fragility ?? 0;
      const speedFactor = s.speedOverride <= 0.75 ? 0.4 : s.speedOverride <= 1.0 ? 1.0 : 3.2;
      const p = 0.05 * speedFactor * (1 + fragility * 1.5) * (1 + s.gripperWear * 2);
      const rand = mulberry32(seedRef.seed * 7907 + s.score.placementsDone * 13 + s.palletSeq);
      if (rand() < p) {
        s.state = 'EXCEPTION_HANDLING';
        s.vlmRollTimer = VLM_INFERENCE_S;
        s.heldFrame = null;
        breakStreak(s);
        pushEvent(s, 'exception', `Gripper slip on ${box.sku_id ?? 'box'} at ${Math.round(s.speedOverride * 100)}% speed, wear ${(s.gripperWear * 100).toFixed(0)}%${fragility > 0.5 ? ' (fragile)' : ''} — VLM engaged`);
        return finalize();
      }
    }

    if (s.progress >= 1) {
      s.placedCount += 1;
      s.score.placementsDone += 1;
      // Wear accumulates per placement, faster above nominal speed.
      s.gripperWear = Math.min(1, s.gripperWear + 0.005 * (s.speedOverride > 1 ? 3 : 1));
      s.streak += 1;
      s.score.bestStreak = Math.max(s.score.bestStreak, s.streak);
      s.multiplier = Math.min(2, 1 + Math.min(s.streak, 20) * 0.05);
      award(s, 5, `place ×${s.multiplier.toFixed(2)}`);
      if (!s.cloudConnected) s.score.autonomyPlacements += 1;
      s.progress = 0;
      s.activeIndex = s.placedCount < s.plan.boxes.length ? s.placedCount : -1;
      s.state = 'IDLE';
    }
  }

  return finalize();
}
