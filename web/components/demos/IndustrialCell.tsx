"use client";

// IndustrialCell — the shared plant vocabulary for EVERY demo on the site.
//
// One arm, one conveyor, one andon tower, one floor, one fence. Whether the
// user is dragging boxes in Production Interactive or fighting the watchdog
// in Live Cell OS, they are looking at the same machine. The andon tower is
// the universal status language across all demos:
//   green  = plan stable / cell idle
//   blue   = robot executing
//   amber  = warnings / exception handling
//   red    = unstable plan / FAULT_ESTOP
// Environment meshes never intercept pointer events (raycast disabled), so
// interactive drag-and-drop demos keep working on top of them.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { PalletSpec, Placement } from '@/lib/palletizer/types';
import type { RobotAnim } from './InteractivePalletScene';

const MM = 1 / 1000;
export const CELL_LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

// Never let environment geometry swallow drag raycasts.
const NORAY = () => null;

export type AndonStatus = 'ok' | 'busy' | 'warn' | 'bad';

// Arm dimensioning — verified numerically (0 NaN, 0 reach clamps) over the
// pick point and all pallet targets for EUR/US pallet sizes.
const SHOULDER_H = 0.62;
const LINK1 = 1.12;
const LINK2 = 1.12;

export function armBaseFor(pallet: PalletSpec, originXm = 0): THREE.Vector3 {
  return new THREE.Vector3(pallet.length_mm * MM * 0.5 + 0.54 + originXm, 0, -0.55);
}
export function pickPosFor(base: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(base.x, 0.47, 0.75);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
export function CellFloor({ size = 12 }: { size?: number }) {
  const stripes = useMemo(() => {
    const arr: { x: number; z: number }[] = [];
    for (let i = -6; i <= 6; i++) {
      arr.push({ x: i * 0.45, z: -2.8 });
      arr.push({ x: i * 0.45, z: 2.8 });
      arr.push({ x: -2.8, z: i * 0.45 });
      arr.push({ x: 2.8, z: i * 0.45 });
    }
    return arr;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.051, 0]} receiveShadow raycast={NORAY}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#0b1120" roughness={0.95} />
      </mesh>
      {stripes.map((s, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[s.x, -0.049, s.z]} raycast={NORAY}>
          <planeGeometry args={[0.05, 0.5]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function SafetyFence() {
  const posts: [number, number][] = [
    [-2.8, -2.8], [-1.4, -2.8], [0, -2.8], [1.4, -2.8], [2.8, -2.8],
    [-2.8, -1.4], [-2.8, 0], [-2.8, 1.4], [-2.8, 2.8],
    [2.8, -1.4], [2.8, 0],
  ];
  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]} castShadow raycast={NORAY}>
          <boxGeometry args={[0.06, 1.1, 0.06]} />
          <meshStandardMaterial color="#facc15" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, -2.8]} raycast={NORAY}>
        <planeGeometry args={[5.6, 1.0]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-2.8, 0.55, 0]} rotation={[0, Math.PI / 2, 0]} raycast={NORAY}>
        <planeGeometry args={[5.6, 1.0]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The universal status object: same lamp stack on every demo. */
export function AndonTower({ status, position = [2.15, 0, -1.7] }: { status: AndonStatus; position?: [number, number, number] }) {
  const order: { key: AndonStatus; color: string }[] = [
    { key: 'bad', color: '#ef4444' },
    { key: 'warn', color: '#f59e0b' },
    { key: 'busy', color: '#38bdf8' },
    { key: 'ok', color: '#34d399' },
  ];
  const pulse = useRef(0);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame((_, dt) => {
    pulse.current += dt * 4;
    order.forEach((o, i) => {
      const m = mats.current[i];
      if (!m) return;
      const on = o.key === status;
      const target = on ? 0.85 + Math.sin(pulse.current) * 0.35 : 0.03;
      m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, target, 0.2);
    });
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]} castShadow raycast={NORAY}>
        <cylinderGeometry args={[0.025, 0.025, 1.4, 12]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {order.map((o, i) => (
        <mesh key={o.key} position={[0, 1.48 + i * 0.11, 0]} raycast={NORAY}>
          <cylinderGeometry args={[0.06, 0.06, 0.1, 20]} />
          <meshStandardMaterial
            ref={(m) => { mats.current[i] = m as THREE.MeshStandardMaterial; }}
            color={o.color} emissive={o.color} emissiveIntensity={0.03} transparent opacity={0.92}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.95, 0]} raycast={NORAY}>
        <cylinderGeometry args={[0.065, 0.065, 0.03, 20]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
}

/** VLM inspection camera. Cone flares amber while analyzing. */
export function VlmCamera({ analyzing, x, z }: { analyzing: boolean; x: number; z: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const target = analyzing ? 0.22 + Math.sin(clock.elapsedTime * 8) * 0.1 : 0.05;
    mat.current.opacity = THREE.MathUtils.lerp(mat.current.opacity, target, 0.2);
    mat.current.color.set(analyzing ? '#f59e0b' : '#38bdf8');
  });
  return (
    <group position={[x, 1.7, z]}>
      <mesh castShadow raycast={NORAY}>
        <boxGeometry args={[0.14, 0.09, 0.16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.62, 0]} raycast={NORAY}>
        <coneGeometry args={[0.42, 1.15, 24, 1, true]} />
        <meshBasicMaterial ref={mat} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html position={[0.12, 0.1, 0]} style={{ pointerEvents: 'none' }}>
        <div className="text-[8px] font-mono text-white/40 bg-black/50 px-1 py-0.5 rounded">VLM CAM</div>
      </Html>
    </group>
  );
}

function BeltSlats({ pick, beltLen, running }: { pick: THREE.Vector3; beltLen: number; running: boolean }) {
  const group = useRef<THREE.Group>(null);
  const off = useRef(0);
  useFrame((_, dt) => {
    if (running) off.current = (off.current + dt * 0.35) % 0.3;
    if (group.current) {
      group.current.children.forEach((c, i) => {
        c.position.z = pick.z + 0.12 + ((i * 0.3 - off.current + beltLen) % beltLen);
      });
    }
  });
  const n = Math.floor(1.9 / 0.3);
  return (
    <group ref={group}>
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[pick.x, 0.392, pick.z + 0.12 + i * 0.3]} raycast={NORAY}>
          <boxGeometry args={[0.5, 0.006, 0.05]} />
          <meshStandardMaterial color="#0f172a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Infeed conveyor aligned with the arm's pick station. */
export function Conveyor({ pick, activeBox, carrying, upcoming = [], running = true }: { pick: THREE.Vector3; activeBox: Placement | null; carrying: boolean; upcoming?: Placement[]; running?: boolean }) {
  const beltLen = 1.9;
  const queue = useRef<number[]>([0.55, 1.1, 1.65]);
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    for (let i = 0; i < queue.current.length; i++) {
      const target = 0.45 + i * 0.55;
      queue.current[i] = THREE.MathUtils.lerp(queue.current[i], target, dt * 2.2);
    }
    if (group.current) {
      group.current.children.forEach((c, i) => {
        if (queue.current[i] !== undefined) c.position.z = pick.z + queue.current[i];
      });
    }
  });
  return (
    <group>
      <mesh position={[pick.x, 0.36, pick.z + beltLen / 2]} castShadow receiveShadow raycast={NORAY}>
        <boxGeometry args={[0.52, 0.06, beltLen + 0.3]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </mesh>
      {[-0.28, 0.28].map((ox) => (
        <mesh key={ox} position={[pick.x + ox, 0.41, pick.z + beltLen / 2]} raycast={NORAY}>
          <boxGeometry args={[0.035, 0.09, beltLen + 0.3]} />
          <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[0.15, beltLen - 0.1].map((oz) => (
        <group key={oz}>
          {[-0.2, 0.2].map((ox) => (
            <mesh key={ox} position={[pick.x + ox, 0.17, pick.z + oz]} raycast={NORAY}>
              <boxGeometry args={[0.05, 0.34, 0.05]} />
              <meshStandardMaterial color="#334155" />
            </mesh>
          ))}
        </group>
      ))}
      {/* moving belt surface: dark slats translate toward the pick point */}
      <BeltSlats pick={pick} beltLen={beltLen} running={running} />
      {/* the REAL next cartons from the plan, correct dims and layer colors */}
      <group ref={group}>
        {[0, 1, 2].map((i) => {
          const b = upcoming[i];
          return (
            <mesh key={i} position={[pick.x, 0.47, pick.z + 0.55 + i * 0.55]} castShadow raycast={NORAY}>
              <boxGeometry args={b
                ? [b.length_mm / 1000, b.height_mm / 1000, b.width_mm / 1000]
                : [0.32, 0.22, 0.36]} />
              <meshStandardMaterial
                color={b ? CELL_LAYER_COLORS[b.layer % CELL_LAYER_COLORS.length] : '#a16207'}
                roughness={0.85}
                transparent
                opacity={b ? 0.95 : 0.35}
              />
            </mesh>
          );
        })}
      </group>
      {activeBox && !carrying && (
        <mesh position={[pick.x, 0.47, pick.z]} castShadow raycast={NORAY}>
          <boxGeometry args={[activeBox.length_mm * MM, activeBox.height_mm * MM, activeBox.width_mm * MM]} />
          <meshStandardMaterial color={CELL_LAYER_COLORS[activeBox.layer % CELL_LAYER_COLORS.length]} roughness={0.75} />
        </mesh>
      )}
      <Html position={[pick.x + 0.45, 0.6, pick.z]} style={{ pointerEvents: 'none' }}>
        <div className="text-[8px] font-mono text-white/40 bg-black/50 px-1 py-0.5 rounded">INFEED</div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Path + IK
// ---------------------------------------------------------------------------
const easeInOut = (t: number) => t * t * (3 - 2 * t);

function boxTopTarget(p: Placement, pallet: PalletSpec, deckTop: number, originXm: number): THREE.Vector3 {
  return new THREE.Vector3(
    (p.x_mm + p.length_mm / 2 - pallet.length_mm / 2) * MM + originXm,
    (p.z_mm + p.height_mm) * MM + deckTop,
    (p.y_mm + p.width_mm / 2 - pallet.width_mm / 2) * MM,
  );
}

function tcpOnPath(progress: number, pick: THREE.Vector3, place: THREE.Vector3, safeH: number): { tcp: THREE.Vector3; carrying: boolean } {
  const pickUp = pick.clone().setY(safeH);
  const placeUp = place.clone().setY(Math.max(safeH, place.y + 0.15));
  if (progress < 0.18) {
    const t = easeInOut(progress / 0.18);
    return { tcp: pickUp.clone().lerp(pick, t), carrying: false };
  }
  if (progress < 0.32) {
    const t = easeInOut((progress - 0.18) / 0.14);
    return { tcp: pick.clone().lerp(pickUp, t), carrying: true };
  }
  if (progress < 0.72) {
    const t = easeInOut((progress - 0.32) / 0.4);
    return { tcp: pickUp.clone().lerp(placeUp, t), carrying: true };
  }
  if (progress < 0.94) {
    const t = easeInOut((progress - 0.72) / 0.22);
    return { tcp: placeUp.clone().lerp(place, t), carrying: true };
  }
  const t = easeInOut((progress - 0.94) / 0.06);
  return { tcp: place.clone().lerp(placeUp, t * 0.4), carrying: false };
}

function solveArm(tcp: THREE.Vector3, base: THREE.Vector3) {
  const dx = tcp.x - base.x;
  const dz = tcp.z - base.z;
  const yaw = Math.atan2(dx, dz);
  const wristDrop = 0.22;
  const r = Math.max(0.25, Math.hypot(dx, dz));
  const h = tcp.y + wristDrop - SHOULDER_H;
  const d = Math.min(Math.hypot(r, h), LINK1 + LINK2 - 0.02);
  const a1 = Math.atan2(h, r);
  const cosElbow = (LINK1 * LINK1 + LINK2 * LINK2 - d * d) / (2 * LINK1 * LINK2);
  const elbowInner = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));
  const cosShoulder = (LINK1 * LINK1 + d * d - LINK2 * LINK2) / (2 * LINK1 * d);
  const shoulder = a1 + Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
  const elbow = elbowInner - Math.PI;
  return { yaw, shoulder, elbow };
}

// ---------------------------------------------------------------------------
// The one arm every demo shares
// ---------------------------------------------------------------------------
export function PalletizerArm({
  boxes, robot, pallet, originXm = 0, deckTop = 0.04, gripperWear = 0, hold = false,
}: {
  boxes: Placement[];
  robot: RobotAnim;
  pallet: PalletSpec;
  originXm?: number;
  deckTop?: number;
  gripperWear?: number;
  hold?: boolean;
}) {
  const yawRef = useRef<THREE.Group>(null);
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const wristRef = useRef<THREE.Group>(null);
  const carriedRef = useRef<THREE.Group>(null);

  const base = useMemo(() => armBaseFor(pallet, originXm), [pallet, originXm]);
  const pick = useMemo(() => pickPosFor(base), [base]);
  const smooth = useRef({ yaw: 0, shoulder: 0.6, elbow: -1.2, tcp: pick.clone().setY(1.05), carrying: false });

  const active = robot.activeIndex >= 0 && robot.activeIndex < boxes.length ? boxes[robot.activeIndex] : null;

  useFrame((_, dt) => {
    const s = smooth.current;
    let target = pick.clone().setY(1.05);
    let carrying = false;
    if (active) {
      const res = tcpOnPath(
        THREE.MathUtils.clamp(robot.progress, 0, 1),
        pick,
        boxTopTarget(active, pallet, deckTop, originXm),
        1.05,
      );
      target = res.tcp;
      carrying = res.carrying;
    }
    const k = hold ? 0 : Math.min(1, dt * 10);
    s.tcp.lerp(target, k);
    s.carrying = carrying;

    const ik = solveArm(s.tcp, base);
    s.yaw = THREE.MathUtils.lerp(s.yaw, ik.yaw, Math.min(1, dt * 8));
    s.shoulder = THREE.MathUtils.lerp(s.shoulder, ik.shoulder, Math.min(1, dt * 8));
    s.elbow = THREE.MathUtils.lerp(s.elbow, ik.elbow, Math.min(1, dt * 8));

    if (yawRef.current) yawRef.current.rotation.y = s.yaw;
    if (shoulderRef.current) shoulderRef.current.rotation.x = -s.shoulder;
    if (elbowRef.current) elbowRef.current.rotation.x = -s.elbow;
    if (wristRef.current) wristRef.current.rotation.x = s.shoulder + s.elbow;
    if (carriedRef.current) carriedRef.current.visible = s.carrying && !!active;
  });

  const wearColor = gripperWear > 0.8 ? '#ef4444' : gripperWear > 0.5 ? '#f59e0b' : '#10b981';
  const gripScaleX = active ? THREE.MathUtils.clamp((active.length_mm / 1000) / 0.3, 0.7, 1.6) : 1;
  const gripScaleZ = active ? THREE.MathUtils.clamp((active.width_mm / 1000) / 0.34, 0.7, 1.6) : 1;

  return (
    <group position={base.toArray()}>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow raycast={NORAY}>
        <cylinderGeometry args={[0.34, 0.4, 0.18, 28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.3} />
      </mesh>
      <group ref={yawRef}>
        <mesh position={[0, 0.38, 0]} castShadow raycast={NORAY}>
          <cylinderGeometry args={[0.19, 0.24, 0.48, 24]} />
          <meshStandardMaterial color="#ea580c" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, SHOULDER_H, 0]} castShadow raycast={NORAY}>
          <sphereGeometry args={[0.16, 20, 16]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.4} />
        </mesh>
        <group position={[0, SHOULDER_H, 0]} ref={shoulderRef}>
          <mesh position={[0, 0, LINK1 / 2]} castShadow raycast={NORAY}>
            <boxGeometry args={[0.16, 0.2, LINK1]} />
            <meshStandardMaterial color="#ea580c" roughness={0.45} metalness={0.25} />
          </mesh>
          <group position={[0, 0, LINK1]}>
            <mesh castShadow raycast={NORAY}>
              <sphereGeometry args={[0.12, 20, 16]} />
              <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.4} />
            </mesh>
            <group ref={elbowRef}>
              <mesh position={[0, 0, LINK2 / 2]} castShadow raycast={NORAY}>
                <boxGeometry args={[0.12, 0.15, LINK2]} />
                <meshStandardMaterial color="#ea580c" roughness={0.45} metalness={0.25} />
              </mesh>
              <group position={[0, 0, LINK2]}>
                <group ref={wristRef}>
                  <mesh position={[0, -0.11, 0]} castShadow raycast={NORAY}>
                    <cylinderGeometry args={[0.045, 0.045, 0.22, 14]} />
                    <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
                  </mesh>
                  {/* gripper adapts to the carton: plate + pad spread scale to its footprint */}
                  <group scale={[gripScaleX, 1, gripScaleZ]}>
                    <mesh position={[0, -0.235, 0]} castShadow raycast={NORAY}>
                      <boxGeometry args={[0.3, 0.035, 0.34]} />
                      <meshStandardMaterial color="#0f172a" roughness={0.6} />
                    </mesh>
                    {[-0.1, 0.1].map((ox) => [-0.12, 0.12].map((oz) => (
                      <mesh key={`${ox}${oz}`} position={[ox, -0.262, oz]} raycast={NORAY}>
                        <cylinderGeometry args={[0.028, 0.034, 0.02, 12]} />
                        <meshStandardMaterial color={wearColor} emissive={wearColor} emissiveIntensity={0.25} roughness={0.7} />
                      </mesh>
                    )))}
                  </group>
                  <group ref={carriedRef} position={[0, -0.272, 0]} visible={false}>
                    {active && (
                      <mesh position={[0, -(active.height_mm * MM) / 2, 0]} castShadow raycast={NORAY}>
                        <boxGeometry args={[active.length_mm * MM, active.height_mm * MM, active.width_mm * MM]} />
                        <meshStandardMaterial color={CELL_LAYER_COLORS[active.layer % CELL_LAYER_COLORS.length]} roughness={0.7} />
                      </mesh>
                    )}
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
