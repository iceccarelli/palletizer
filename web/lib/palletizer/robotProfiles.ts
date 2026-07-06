// Robot arm profiles for the interactive cell demos.
//
// Every number below is from the manufacturer's public spec sheet (see
// `source` on each profile). The on-screen geometry is a SCHEMATIC scaled
// from real reach/payload — it is intentionally NOT a to-scale CAD model, and
// the demos say so. What is faithful: relative reach, axis count, the distinct
// silhouette of each mechanism (6-axis cobot vs 4-axis parallel-link palletizer
// vs double-link heavy palletizer), and joint-speed-driven motion pacing.
//
// Adding a new arm = adding one entry here. Nothing else needs to change.

export type ArmKind =
  | 'cobot-6axis' // slender articulated collaborative arm
  | 'palletizer-4axis-parallel' // parallelogram linkage, wrist stays level
  | 'palletizer-double-link'; // heavy double-rocker palletizer

export interface RobotProfile {
  id: string;
  vendor: string;
  model: string;
  kind: ArmKind;

  // --- Real published specs ---
  reachMm: number;
  payloadKg: number;
  axes: number;
  repeatabilityMm: number;
  controller: string;
  /** Fastest published joint speed, deg/s — used to pace the animation. */
  maxJointSpeedDegS: number;
  /** One-line, honest positioning for the UI. */
  blurb: string;
  /** Citation shown in the UI so no spec is unsourced. */
  source: string;

  // --- Schematic rendering (scene units ~ metres) ---
  visual: {
    /** Overall on-screen scale multiplier vs the baseline cobot. */
    scale: number;
    baseRadius: number;
    /** Fraction of scene reach assigned to the two main links. */
    link1: number;
    link2: number;
    shoulderH: number;
    color: string; // primary structure
    accent: string; // joints / housings
    /** Palletizer kinds render an extra parallel back-link bar. */
    parallelLink: boolean;
    /** 4-axis palletizers keep the gripper level (no wrist pitch). */
    levelWrist: boolean;
  };
}

// UR10e — collaborative 6-axis. Payload 12.5 kg, reach 1300 mm, 6 rotating
// joints, base/shoulder 120 deg/s, elbow+wrists 180 deg/s, repeatability
// +/-0.05 mm, 190 mm base. Source: Universal Robots UR10e datasheet.
export const UR10E: RobotProfile = {
  id: 'ur10e',
  vendor: 'Universal Robots',
  model: 'UR10e',
  kind: 'cobot-6axis',
  reachMm: 1300,
  payloadKg: 12.5,
  axes: 6,
  repeatabilityMm: 0.05,
  controller: 'PolyScope 5 / URScript',
  maxJointSpeedDegS: 180,
  blurb: 'Collaborative low-payload cobot — light cases, mixed e-comm, fenceless cells.',
  source: 'universal-robots.com UR10e datasheet',
  visual: {
    scale: 0.85,
    baseRadius: 0.3,
    link1: 0.62,
    link2: 0.55,
    shoulderH: 0.42,
    color: '#e2e8f0',
    accent: '#3b82f6',
    parallelLink: false,
    levelWrist: false,
  },
};

// FANUC M-410iC/185 — 4-axis parallel-link palletizer. Payload 185 kg,
// H-reach 3143 mm, repeatability +/-0.5 mm, R-30iB controller, hollow wrist.
// Source: FANUC America M-410iC/185.
export const FANUC_M410IC: RobotProfile = {
  id: 'fanuc-m410ic-185',
  vendor: 'FANUC',
  model: 'M-410iC/185',
  kind: 'palletizer-4axis-parallel',
  reachMm: 3143,
  payloadKg: 185,
  axes: 4,
  repeatabilityMm: 0.5,
  controller: 'R-30iB',
  maxJointSpeedDegS: 120,
  blurb: 'Dedicated 4-axis case palletizer — high throughput, gripper stays level.',
  source: 'fanucamerica.com M-410iC/185',
  visual: {
    scale: 1.15,
    baseRadius: 0.42,
    link1: 0.72,
    link2: 0.6,
    shoulderH: 0.5,
    color: '#f6c453',
    accent: '#1e293b',
    parallelLink: true,
    levelWrist: true,
  },
};

// KUKA KR FORTEC PA — heavy palletizer, double-link (double rocker) arm,
// payload up to ~470 kg, reach up to ~3200 mm, KR C5 controller.
// Source: kuka.com KR FORTEC PA.
export const KUKA_KR_FORTEC: RobotProfile = {
  id: 'kuka-kr-fortec-pa',
  vendor: 'KUKA',
  model: 'KR FORTEC PA',
  kind: 'palletizer-double-link',
  reachMm: 3200,
  payloadKg: 470,
  axes: 4,
  repeatabilityMm: 0.06,
  controller: 'KR C5',
  maxJointSpeedDegS: 105,
  blurb: 'Heavy double-link palletizer — full layers, stone, drums, cold stores.',
  source: 'kuka.com KR FORTEC PA',
  visual: {
    scale: 1.25,
    baseRadius: 0.46,
    link1: 0.75,
    link2: 0.62,
    shoulderH: 0.54,
    color: '#f97316',
    accent: '#0f172a',
    parallelLink: true,
    levelWrist: true,
  },
};

export const ROBOT_PROFILES: RobotProfile[] = [UR10E, FANUC_M410IC, KUKA_KR_FORTEC];

export function profileById(id: string): RobotProfile {
  return ROBOT_PROFILES.find((p) => p.id === id) ?? UR10E;
}
