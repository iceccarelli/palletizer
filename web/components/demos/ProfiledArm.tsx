"use client";

// ProfiledArm — a schematic, spec-driven palletizing cell.
//
// Layout is a real end-of-line cell: arm at a pallet corner, an infeed conveyor
// on the opposite side feeding cartons one at a time, a safety fence perimeter,
// and an andon light. Every dimension/colour/motion rate comes from a
// RobotProfile. Boxes land where palletizer_full/optimizer.py's port places
// them. Geometry is stylised primitives (no CAD/GLB), which the page states.

import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Placement, PalletSpec } from '@/lib/palletizer/types';
import { RobotProfile } from '@/lib/palletizer/robotProfiles';

const MM = 0.001;
const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
const easeInOut = (t: number) => t * t * (3 - 2 * t);

<<<<<<< ours
function boxTarget(p: Placement, pallet: PalletSpec, deckTop: number): THREE.Vector3 {
=======
// Cell layout (scene units ~ metres). Arm base at origin; pallet offset in +X
// so it sits BESIDE the arm (not under it); conveyor on the -X side.
const PALLET_CENTER = new THREE.Vector3(0.62, 0, -0.05);
const PICK = new THREE.Vector3(-0.66, 0.47, 0.18);
const BELT_SPACING = 0.42; // spacing between queued cartons on the belt

function boxWorld(p: Placement, pallet: PalletSpec, y: number): THREE.Vector3 {
>>>>>>> theirs
  return new THREE.Vector3(
    (p.x_mm + p.length_mm / 2 - pallet.length_mm / 2) * MM + PALLET_CENTER.x,
    y,
    (p.y_mm + p.width_mm / 2 - pallet.width_mm / 2) * MM + PALLET_CENTER.z,
  );
}

function placeTarget(p: Placement, pallet: PalletSpec): THREE.Vector3 {
  return boxWorld(p, pallet, (p.z_mm + p.height_mm) * MM + 0.04);
}

function tcpOnPath(progress: number, pick: THREE.Vector3, place: THREE.Vector3, safeH: number) {
  const pickUp = pick.clone().setY(safeH);
  const placeUp = place.clone().setY(Math.max(safeH, place.y + 0.15));
  if (progress < 0.18) return { tcp: pickUp.clone().lerp(pick, easeInOut(progress / 0.18)), carrying: false };
  if (progress < 0.32) return { tcp: pick.clone().lerp(pickUp, easeInOut((progress - 0.18) / 0.14)), carrying: true };
  if (progress < 0.72) return { tcp: pickUp.clone().lerp(placeUp, easeInOut((progress - 0.32) / 0.4)), carrying: true };
  if (progress < 0.94) return { tcp: placeUp.clone().lerp(place, easeInOut((progress - 0.72) / 0.22)), carrying: true };
  return { tcp: place.clone().lerp(placeUp, easeInOut((progress - 0.94) / 0.06) * 0.4), carrying: false };
}

export function ProfiledArm({
  profile,
  boxes,
  pallet,
  running,
  speed = 1,
}: {
  profile: RobotProfile;
  boxes: Placement[];
  pallet: PalletSpec;
  pick?: THREE.Vector3; // accepted for compatibility; layout is internal
  running: boolean;
  speed?: number;
}) {
  const v = profile.visual;
  const LINK1 = v.link1 * v.scale;
  const LINK2 = v.link2 * v.scale;
  const SHOULDER_H = v.shoulderH * v.scale;
  const safeH = SHOULDER_H + LINK1 * 0.7;
  const base = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  const yawRef = useRef<THREE.Group>(null);
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const wristRef = useRef<THREE.Group>(null);
  const backLinkRef = useRef<THREE.Group>(null);
  const carriedRef = useRef<THREE.Group>(null);
  const atPickRef = useRef<THREE.Group>(null);
  const andonRef = useRef<THREE.MeshStandardMaterial>(null);
  const beltSlots = useRef<(THREE.Group | null)[]>([]);

<<<<<<< ours
  const base = useMemo(() => new THREE.Vector3(pick.x - 1.1, 0, pick.z), [pick]);
  const [placedCount, setPlacedCount] = useState(0);
  const placedRef = useRef(0);
  const progressRef = useRef(0);
  const smooth = useRef({ yaw: 0, shoulder: 0.6, elbow: -1.2, tcp: pick.clone().setY(safeH), carrying: false });
=======
  const [placedCount, setPlacedCount] = useState(0);
  const placedRef = useRef(0);
  const progressRef = useRef(0);
  const smooth = useRef({ yaw: 0, shoulder: 0.6, elbow: -1.2, tcp: PICK.clone().setY(safeH), carrying: false });
>>>>>>> theirs

  const cycleS = useMemo(() => 3.2 * (120 / profile.maxJointSpeedDegS), [profile.maxJointSpeedDegS]);
  const done = placedCount >= boxes.length;

  function solveArm(tcp: THREE.Vector3) {
    const dx = tcp.x - base.x;
    const dz = tcp.z - base.z;
    const yaw = Math.atan2(dx, dz);
    const r = Math.max(0.25, Math.hypot(dx, dz));
    const h = tcp.y + 0.22 - SHOULDER_H;
    const d = Math.min(Math.hypot(r, h), LINK1 + LINK2 - 0.02);
    const a1 = Math.atan2(h, r);
    const cosElbow = (LINK1 * LINK1 + LINK2 * LINK2 - d * d) / (2 * LINK1 * LINK2);
    const elbowInner = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));
    const cosShoulder = (LINK1 * LINK1 + d * d - LINK2 * LINK2) / (2 * LINK1 * d);
    const shoulder = a1 + Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
    return { yaw, shoulder, elbow: elbowInner - Math.PI };
  }

  useFrame((_, dt) => {
<<<<<<< ours
    // Advance only while boxes remain. When the build completes the arm parks
    // and the finished stack stays put — nothing loops, nothing vanishes.
=======
>>>>>>> theirs
    if (running && placedRef.current < boxes.length) {
      progressRef.current += (dt * speed) / cycleS;
      if (progressRef.current >= 1) {
        progressRef.current = 0;
        placedRef.current += 1;
<<<<<<< ours
        setPlacedCount(placedRef.current); // re-render so the landed box persists
=======
        setPlacedCount(placedRef.current);
>>>>>>> theirs
      }
    }
    const prog = THREE.MathUtils.clamp(progressRef.current, 0, 1);
    const active = placedRef.current < boxes.length ? boxes[placedRef.current] : null;

<<<<<<< ours
    const active = placedRef.current < boxes.length ? boxes[placedRef.current] : null;
=======
>>>>>>> theirs
    const s = smooth.current;
    let target = PICK.clone().setY(safeH);
    let carrying = false;
    if (active) {
<<<<<<< ours
      const res = tcpOnPath(THREE.MathUtils.clamp(progressRef.current, 0, 1), pick, boxTarget(active, pallet, 0.04), safeH);
=======
      const res = tcpOnPath(prog, PICK, placeTarget(active, pallet), safeH);
>>>>>>> theirs
      target = res.tcp;
      carrying = res.carrying;
    }
    s.tcp.lerp(target, Math.min(1, dt * 10));
    const ik = solveArm(s.tcp);
    const k = Math.min(1, dt * 8);
    s.yaw = THREE.MathUtils.lerp(s.yaw, ik.yaw, k);
    s.shoulder = THREE.MathUtils.lerp(s.shoulder, ik.shoulder, k);
    s.elbow = THREE.MathUtils.lerp(s.elbow, ik.elbow, k);

    if (yawRef.current) yawRef.current.rotation.y = s.yaw;
    if (shoulderRef.current) shoulderRef.current.rotation.x = -s.shoulder;
    if (elbowRef.current) elbowRef.current.rotation.x = -s.elbow;
    if (wristRef.current) wristRef.current.rotation.x = v.levelWrist ? 0 : s.shoulder + s.elbow;
    if (backLinkRef.current) backLinkRef.current.rotation.x = -s.shoulder * 0.5;

    if (carriedRef.current) carriedRef.current.visible = carrying && !!active;
    if (atPickRef.current) atPickRef.current.visible = !!active && prog < 0.2;

    beltSlots.current.forEach((g, k2) => {
      if (!g) return;
      g.position.x = PICK.x - (k2 + 1) * BELT_SPACING + prog * BELT_SPACING;
    });

    if (andonRef.current) {
      const c = done ? '#3b82f6' : running ? '#22c55e' : '#f59e0b';
      andonRef.current.color.set(c);
      andonRef.current.emissive.set(c);
      andonRef.current.emissiveIntensity = 0.5 + 0.4 * Math.abs(Math.sin(performance.now() / 500));
    }
  });

  const placedBoxes = boxes.slice(0, placedCount);
<<<<<<< ours
=======
  const beltBoxes = [1, 2, 3, 4].map((k) => boxes[placedCount + k]).filter(Boolean) as Placement[];
  const current = placedCount < boxes.length ? boxes[placedCount] : null;
>>>>>>> theirs

  return (
    <group>
      <group position={base.toArray()}>
        <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[v.baseRadius * 0.85, v.baseRadius, 0.18, 28]} />
          <meshStandardMaterial color={v.accent} roughness={0.45} metalness={0.7} envMapIntensity={0.8} />
        </mesh>
        <group ref={yawRef}>
          <mesh position={[0, 0.38, 0]} castShadow>
            <cylinderGeometry args={[v.baseRadius * 0.55, v.baseRadius * 0.7, 0.48, 24]} />
            <meshStandardMaterial color={v.color} roughness={0.34} metalness={0.82} envMapIntensity={0.9} />
          </mesh>
          <mesh position={[0, SHOULDER_H, 0]} castShadow>
            <sphereGeometry args={[0.16 * v.scale, 20, 16]} />
            <meshStandardMaterial color={v.accent} roughness={0.3} metalness={0.92} envMapIntensity={1} />
          </mesh>
          <group position={[0, SHOULDER_H, 0]} ref={shoulderRef}>
            <mesh position={[0, 0, LINK1 / 2]} castShadow>
              <boxGeometry args={[0.16 * v.scale, 0.2 * v.scale, LINK1]} />
              <meshStandardMaterial color={v.color} roughness={0.34} metalness={0.82} envMapIntensity={0.9} />
            </mesh>
            {v.parallelLink && (
              <group ref={backLinkRef}>
                <mesh position={[0, 0.14 * v.scale, LINK1 * 0.45]} castShadow>
                  <boxGeometry args={[0.07 * v.scale, 0.07 * v.scale, LINK1 * 0.9]} />
                  <meshStandardMaterial color={v.accent} roughness={0.3} metalness={0.92} envMapIntensity={1} />
                </mesh>
              </group>
            )}
            <group position={[0, 0, LINK1]}>
              <mesh castShadow>
                <sphereGeometry args={[0.12 * v.scale, 20, 16]} />
                <meshStandardMaterial color={v.accent} roughness={0.3} metalness={0.92} envMapIntensity={1} />
              </mesh>
              <group ref={elbowRef}>
                <mesh position={[0, 0, LINK2 / 2]} castShadow>
                  <boxGeometry args={[0.12 * v.scale, 0.15 * v.scale, LINK2]} />
                  <meshStandardMaterial color={v.color} roughness={0.34} metalness={0.82} envMapIntensity={0.9} />
                </mesh>
                <group position={[0, 0, LINK2]}>
                  <group ref={wristRef}>
                    <mesh position={[0, -0.11, 0]} castShadow>
                      <cylinderGeometry args={[0.05, 0.05, 0.22, 14]} />
                      <meshStandardMaterial color={v.accent} metalness={0.88} roughness={0.28} envMapIntensity={1} />
                    </mesh>
                    <mesh position={[0, -0.235, 0]} castShadow>
                      <boxGeometry args={[0.3, 0.035, 0.34]} />
                      <meshStandardMaterial color={v.accent} roughness={0.4} metalness={0.6} envMapIntensity={0.8} />
                    </mesh>
                    <group ref={carriedRef} position={[0, -0.272, 0]} visible={false}>
<<<<<<< ours
                      {placedCount < boxes.length && (
                        <mesh position={[0, -(boxes[placedCount].height_mm * MM) / 2, 0]} castShadow>
                          <boxGeometry
                            args={[
                              boxes[placedCount].length_mm * MM,
                              boxes[placedCount].height_mm * MM,
                              boxes[placedCount].width_mm * MM,
                            ]}
                          />
                          <meshStandardMaterial color={LAYER_COLORS[boxes[placedCount].layer % LAYER_COLORS.length]} roughness={0.7} />
=======
                      {current && (
                        <mesh position={[0, -(current.height_mm * MM) / 2, 0]} castShadow>
                          <boxGeometry args={[current.length_mm * MM, current.height_mm * MM, current.width_mm * MM]} />
                          <meshStandardMaterial color={LAYER_COLORS[current.layer % LAYER_COLORS.length]} roughness={0.7} />
>>>>>>> theirs
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

<<<<<<< ours
      {/* infeed conveyor — feeds the next cartons toward the pick point */}
      <group>
        <mesh position={[pick.x, pick.y - 0.14, pick.z + 0.95]} receiveShadow castShadow>
          <boxGeometry args={[0.56, 0.08, 1.9]} />
          <meshStandardMaterial color="#111827" roughness={0.85} metalness={0.2} envMapIntensity={0.4} />
        </mesh>
        {[-0.3, 0.3].map((ox) => (
          <mesh key={ox} position={[pick.x + ox, pick.y - 0.1, pick.z + 0.95]}>
            <boxGeometry args={[0.04, 0.1, 1.9]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} envMapIntensity={0.8} />
          </mesh>
        ))}
        {[pick.z + 0.3, pick.z + 1.6].map((z) =>
          [-0.24, 0.24].map((ox) => (
            <mesh key={`${z}-${ox}`} position={[pick.x + ox, (pick.y - 0.14) / 2, z]}>
              <boxGeometry args={[0.05, pick.y - 0.14, 0.05]} />
=======
      <group>
        <mesh position={[PICK.x - 0.75, PICK.y - 0.14, PICK.z]} receiveShadow castShadow>
          <boxGeometry args={[1.9, 0.08, 0.56]} />
          <meshStandardMaterial color="#111827" roughness={0.85} metalness={0.2} envMapIntensity={0.4} />
        </mesh>
        {[-0.3, 0.3].map((oz) => (
          <mesh key={oz} position={[PICK.x - 0.75, PICK.y - 0.1, PICK.z + oz]}>
            <boxGeometry args={[1.9, 0.1, 0.04]} />
            <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.4} envMapIntensity={0.8} />
          </mesh>
        ))}
        {[PICK.x - 1.5, PICK.x - 0.1].map((x) =>
          [-0.24, 0.24].map((oz) => (
            <mesh key={x + '-' + oz} position={[x, (PICK.y - 0.14) / 2, PICK.z + oz]}>
              <boxGeometry args={[0.05, PICK.y - 0.14, 0.05]} />
>>>>>>> theirs
              <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.6} />
            </mesh>
          )),
        )}
<<<<<<< ours
        {/* upcoming cartons queued on the belt (real dims + layer colours) */}
        {[1, 2, 3].map((k) => {
          const b = boxes[placedCount + k];
          if (!b) return null;
          return (
            <mesh key={`up-${k}`} position={[pick.x, pick.y - 0.03, pick.z + 0.45 + k * 0.42]} castShadow receiveShadow>
              <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
              <meshStandardMaterial color={LAYER_COLORS[b.layer % LAYER_COLORS.length]} roughness={0.85} />
            </mesh>
          );
        })}
      </group>

      {/* pallet deck */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
=======
        <group ref={atPickRef} visible={false}>
          {current && (
            <mesh position={[PICK.x, PICK.y - 0.02, PICK.z]} castShadow>
              <boxGeometry args={[current.length_mm * MM, current.height_mm * MM, current.width_mm * MM]} />
              <meshStandardMaterial color={LAYER_COLORS[current.layer % LAYER_COLORS.length]} roughness={0.85} />
            </mesh>
          )}
        </group>
        {beltBoxes.map((b, k) => (
          <group key={'slot-' + k} ref={(el) => { beltSlots.current[k] = el; }} position={[PICK.x - (k + 1) * BELT_SPACING, PICK.y - 0.02, PICK.z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
              <meshStandardMaterial color={LAYER_COLORS[b.layer % LAYER_COLORS.length]} roughness={0.85} />
            </mesh>
          </group>
        ))}
      </group>

      <mesh position={[PALLET_CENTER.x, 0.02, PALLET_CENTER.z]} receiveShadow>
>>>>>>> theirs
        <boxGeometry args={[pallet.length_mm * MM, 0.04, pallet.width_mm * MM]} />
        <meshStandardMaterial color="#5b3a1e" roughness={0.9} />
      </mesh>

      {placedBoxes.map((b, i) => {
        const w = boxWorld(b, pallet, (b.z_mm + b.height_mm / 2) * MM + 0.04);
        return (
          <mesh key={b.sku_id + '-' + i} position={w.toArray()} castShadow receiveShadow>
            <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
            <meshStandardMaterial color={LAYER_COLORS[b.layer % LAYER_COLORS.length]} roughness={0.8} />
          </mesh>
        );
      })}

      <SafetyFence />

      <group position={[-0.15, 0, 0.55]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.2, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.32, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.14, 16]} />
          <meshStandardMaterial ref={andonRef} color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function SafetyFence() {
  const half = 1.9;
  const posts: [number, number][] = [];
  for (let x = -half; x <= half; x += 0.95) {
    posts.push([x, -half], [x, half], [-half, x], [half, x]);
  }
  const panels: { pos: [number, number, number]; rot: [number, number, number] }[] = [
    { pos: [0, 0.55, -half], rot: [0, 0, 0] },
    { pos: [-half, 0.55, 0], rot: [0, Math.PI / 2, 0] },
  ];
  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.55, z]} castShadow>
          <boxGeometry args={[0.05, 1.1, 0.05]} />
          <meshStandardMaterial color="#facc15" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {panels.map((p, i) => (
        <mesh key={'panel-' + i} position={p.pos} rotation={p.rot}>
          <planeGeometry args={[half * 2, 1.0]} />
          <meshStandardMaterial color="#94a3b8" transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
