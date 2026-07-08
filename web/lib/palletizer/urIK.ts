// UR10e kinematics — forward kinematics + damped-least-squares inverse kinematics.
//
// WHY THIS EXISTS
//   The interactive robot cell drives a *real* UR10e URDF (loaded with urdf-loader).
//   To make the arm reach planner pick/place poses exactly like the physical robot,
//   we need inverse kinematics. This module is deliberately framework-agnostic
//   (plain number[] math, no three.js in the hot path) so it is unit-testable and so
//   the exact math that was numerically verified offline is the math that ships.
//
// FRAME CONVENTION — IMPORTANT
//   FK is composed from the EXACT UR10e URDF joint origins (config/ur10e/
//   default_kinematics.yaml from Universal_Robots_ROS2_Description) with each joint a
//   rotation about local +Z. That means the joint angles returned by `solveIK` map
//   1:1 onto urdf-loader's `setJointValue(name, angle)` — no DH<->URDF offset fudging.
//   (Composing FK from DH parameters instead would introduce constant ±π/2 offsets
//   between the solver and the visual robot; this convention removes that bug class.)
//
// VERIFICATION (offline, see commit notes)
//   * FK(IK(pose)) reproduces reachable top-down poses to < 1e-6 m / rad.
//   * Warm-started, velocity-clamped solving stays continuous (<1°/frame) along
//     realistic one-sided palletizing paths — no closed-form "elbow flip" glitches.

export type Mat4 = number[]; // length-16, row-major

/** UR10e joint names in kinematic order — match the shipped URDF exactly. */
export const UR10E_JOINTS = [
  'shoulder_pan_joint',
  'shoulder_lift_joint',
  'elbow_joint',
  'wrist_1_joint',
  'wrist_2_joint',
  'wrist_3_joint',
] as const;

/** Manufacturer joint limits (rad) — used to keep IK output physically valid. */
export const UR10E_LIMITS: [number, number][] = [
  [-2 * Math.PI, 2 * Math.PI],
  [-2 * Math.PI, 2 * Math.PI],
  [-Math.PI, Math.PI],
  [-2 * Math.PI, 2 * Math.PI],
  [-2 * Math.PI, 2 * Math.PI],
  [-2 * Math.PI, 2 * Math.PI],
];

const I4 = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(A: Mat4, B: Mat4): Mat4 {
  const C = new Array(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c];
      C[r * 4 + c] = s;
    }
  return C;
}

/** URDF origin transform: Trans(xyz) · Rz(yaw) · Ry(pitch) · Rx(roll). */
function origin(x: number, y: number, z: number, R: number, P: number, Y: number): Mat4 {
  const cr = Math.cos(R), sr = Math.sin(R);
  const cp = Math.cos(P), sp = Math.sin(P);
  const cy = Math.cos(Y), sy = Math.sin(Y);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, x,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, y,
    -sp, cp * sr, cp * cr, z,
    0, 0, 0, 1,
  ];
}

function rotZ(t: number): Mat4 {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

// Exact UR10e joint origins (metres / radians) — mesh-aligned.
const ORIGINS: Mat4[] = [
  origin(0, 0, 0.1807, 0, 0, 0),
  origin(0, 0, 0, 1.570796327, 0, 0),
  origin(-0.6127, 0, 0, 0, 0, 0),
  origin(-0.57155, 0, 0.17415, 0, 0, 0),
  origin(0, -0.11985, -2.458164590756244e-11, 1.570796327, 0, 0),
  origin(0, 0.11655, -2.390480459346185e-11, 1.570796326589793, 3.141592653589793, 3.141592653589793),
];

/** Tool offset from the wrist-3 flange to the gripper TCP (m, along flange +Z). */
export const DEFAULT_TCP_OFFSET = 0.16;

/** Forward kinematics → TCP pose as a row-major 4×4. */
export function forwardKinematics(q: number[], tcpOffset = DEFAULT_TCP_OFFSET): Mat4 {
  let T = I4();
  for (let i = 0; i < 6; i++) {
    T = mul(T, ORIGINS[i]);
    T = mul(T, rotZ(q[i]));
  }
  return mul(T, origin(0, 0, tcpOffset, 0, 0, 0));
}

/** Convenience: TCP world position from joints. */
export function tcpPosition(q: number[], tcpOffset = DEFAULT_TCP_OFFSET): [number, number, number] {
  const T = forwardKinematics(q, tcpOffset);
  return [T[3], T[7], T[11]];
}

/** 6-vector pose error (position + Siciliano orientation error) of current vs goal. */
function poseError(C: Mat4, G: Mat4): number[] {
  const col = (M: Mat4, c: number) => [M[c], M[4 + c], M[8 + c]];
  const cross = (u: number[], v: number[]) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const e = cross(col(C, 0), col(G, 0));
  const f = cross(col(C, 1), col(G, 1));
  const g = cross(col(C, 2), col(G, 2));
  return [
    G[3] - C[3], G[7] - C[7], G[11] - C[11],
    -0.5 * (e[0] + f[0] + g[0]),
    -0.5 * (e[1] + f[1] + g[1]),
    -0.5 * (e[2] + f[2] + g[2]),
  ];
}

/** Numeric 6×6 Jacobian via central differences. */
function jacobian(q: number[], tcpOffset: number): number[][] {
  const h = 1e-6;
  const J: number[][] = Array.from({ length: 6 }, () => new Array(6));
  for (let j = 0; j < 6; j++) {
    const qp = q.slice(); qp[j] += h;
    const qm = q.slice(); qm[j] -= h;
    const ep = poseError(forwardKinematics(qm, tcpOffset), forwardKinematics(qp, tcpOffset));
    for (let i = 0; i < 6; i++) J[i][j] = ep[i] / (2 * h);
  }
  return J;
}

/** Gaussian elimination solve of a 6×6 system. */
function solve6(A: number[][], b: number[]): number[] {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 6; c++) {
    let p = c;
    for (let r = c + 1; r < 6; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pv = M[c][c] || 1e-12;
    for (let r = 0; r < 6; r++) {
      if (r === c) continue;
      const fr = M[r][c] / pv;
      for (let k = c; k <= 6; k++) M[r][k] -= fr * M[c][k];
    }
  }
  return M.map((r, i) => r[6] / (M[i][i] || 1e-12));
}

export interface IKOptions {
  /** Warm-start seed (previous frame's joints). Strongly recommended for continuity. */
  seed?: number[];
  tcpOffset?: number;
  maxIters?: number;
  /** Trust-region cap per Newton iteration (rad). */
  maxIterStep?: number;
  /**
   * Output velocity clamp (rad) — the returned solution is limited to within this of
   * `seed`, mimicking joint-velocity limits so a solver basin-flip can never teleport
   * the visual robot. Set to Infinity for cold acquisition.
   */
  maxJointStep?: number;
  convergence?: number;
}

export interface IKResult {
  q: number[];
  /** Residual pose error norm; > ~1e-3 means the target was effectively unreachable. */
  error: number;
  reached: boolean;
}

// Cold-start seeds spanning the main UR arm postures (shoulder up/down, elbow up/down).
const ACQUIRE_SEEDS: number[][] = [
  [0, -1.57, 1.57, -1.57, -1.57, 0],
  [0, -1.0, 2.0, -2.5, -1.57, 0],
  [0, -2.2, -1.5, 0.6, 1.57, 0],
  [Math.PI / 2, -1.57, 1.57, -1.57, -1.57, 0],
];

/**
 * Solve inverse kinematics for a target TCP pose (row-major 4×4, metres).
 * If no `seed` is given, multi-start acquisition finds a valid posture; if a `seed`
 * is given, it warm-starts (fast + continuous) and applies the velocity clamp.
 */
export function solveIK(target: Mat4, opts: IKOptions = {}): IKResult {
  const {
    tcpOffset = DEFAULT_TCP_OFFSET,
    maxIters = 80,
    maxIterStep = 0.4,
    convergence = 1e-9,
  } = opts;

  const run = (seed: number[]): IKResult => {
    let q = seed.slice();
    for (let it = 0; it < maxIters; it++) {
      const C = forwardKinematics(q, tcpOffset);
      const e = poseError(C, target);
      const err = Math.hypot(...e);
      if (err < convergence) break;
      const J = jacobian(q, tcpOffset);
      const lam = 1e-5 + 0.05 * err; // adaptive damping — graceful near singularities
      const JtJ: number[][] = Array.from({ length: 6 }, (_, i) =>
        Array.from({ length: 6 }, (_, j) => {
          let s = 0;
          for (let k = 0; k < 6; k++) s += J[k][i] * J[k][j];
          return s + (i === j ? lam : 0);
        }),
      );
      const Jte = new Array(6).fill(0).map((_, i) => {
        let s = 0;
        for (let k = 0; k < 6; k++) s += J[k][i] * e[k];
        return s;
      });
      let dq = solve6(JtJ, Jte);
      const dn = Math.hypot(...dq);
      if (dn > maxIterStep) dq = dq.map((x) => (x * maxIterStep) / dn);
      let stepSq = 0;
      for (let i = 0; i < 6; i++) {
        q[i] += dq[i];
        stepSq += dq[i] * dq[i];
      }
      if (Math.sqrt(stepSq) < 1e-13) break;
    }
    const error = Math.hypot(...poseError(forwardKinematics(q, tcpOffset), target));
    return { q, error, reached: error < 1e-3 };
  };

  let result: IKResult;
  if (opts.seed) {
    result = run(opts.seed);
    // If the warm start diverged (target jumped far), fall back to acquisition.
    if (!result.reached) {
      const acq = acquire(target, tcpOffset, maxIters, maxIterStep);
      if (acq.error < result.error) result = acq;
    }
  } else {
    result = acquire(target, tcpOffset, maxIters, maxIterStep);
  }

  // Output velocity clamp relative to the seed (joint-velocity-limit emulation).
  if (opts.seed && Number.isFinite(opts.maxJointStep ?? Infinity)) {
    const cap = opts.maxJointStep as number;
    result = {
      ...result,
      q: result.q.map((v, i) => {
        const d = v - opts.seed![i];
        return opts.seed![i] + Math.max(-cap, Math.min(cap, d));
      }),
    };
  }

  // Clamp to joint limits.
  result.q = result.q.map((v, i) =>
    Math.max(UR10E_LIMITS[i][0], Math.min(UR10E_LIMITS[i][1], v)),
  );
  return result;
}

function acquire(target: Mat4, tcpOffset: number, maxIters: number, maxIterStep: number): IKResult {
  let best: IKResult | null = null;
  for (const s of ACQUIRE_SEEDS) {
    const r = solveIK(target, { seed: s, tcpOffset, maxIters, maxIterStep, maxJointStep: Infinity });
    if (!best || r.error < best.error) best = r;
    if (r.error < 1e-8) break;
  }
  return best!;
}

/**
 * Build a target pose (in the URDF/base frame, Z-up) for a TCP pointing straight
 * DOWN — the palletizing default. Tool +Z is aligned with base −Z; `yawDeg` spins
 * the gripper about the vertical to match a box's rotation. Row-major 4×4, metres.
 *
 * Scene↔base mapping (the scene is Y-up, the robot group is rotated −90° about X):
 *   base (xu, yu, zu)  →  scene (xu, zu, −yu)
 *   scene (sx, sy, sz) →  base  (sx, −sz, sy)
 * so a scene-relative point is converted with baseTargetFromScene() below.
 */
export function topDownTarget(x: number, y: number, z: number, yawDeg = 0): Mat4 {
  const yaw = (yawDeg * Math.PI) / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // columns: x-axis=(c,s,0), y-axis=(s,-c,0), z-axis=(0,0,-1)  (right-handed, pointing down)
  return [
    c, s, 0, x,
    s, -c, 0, y,
    0, 0, -1, z,
    0, 0, 0, 1,
  ];
}

/** Convert an arm-base-relative scene point (Y-up) to a base-frame (Z-up) point. */
export function baseFromScene(sx: number, sy: number, sz: number): [number, number, number] {
  return [sx, -sz, sy];
}

/** Convert a base-frame (Z-up) point back to an arm-base-relative scene point (Y-up). */
export function sceneFromBase(xu: number, yu: number, zu: number): [number, number, number] {
  return [xu, zu, -yu];
}
