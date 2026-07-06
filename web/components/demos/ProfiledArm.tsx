"use client";

// ProfiledArm — a schematic, spec-driven articulated arm.
//
// Reuses the 2-link IK approach proven in IndustrialCell.tsx, but every
// dimension, colour and motion rate comes from a RobotProfile
// (lib/palletizer/robotProfiles.ts). Swapping the profile changes the
// silhouette (cobot vs parallel-link palletizer vs double-link), the scale
// (from real reach), the colours, and the animation pace (from real joint
// speed). Boxes appear where the real optimizer placed them.
//
// This is a stylised representation of each mechanism, not a CAD model — the
// demo page says so.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Placement, PalletSpec } from '@/lib/palletizer/types';
import { RobotProfile } from '@/lib/palletizer/robotProfiles';

const MM = 0.001;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

interface ArmState {
  index: number; // which placement is being placed
  progress: number; // 0..1 within the current pick->place cycle
  placed: number; // how many boxes have landed
}

function boxTarget(p: Placement, pallet: PalletSpec, deckTop: number): THREE.Vector3 {
  return new THREE.Vector3(
    (p.x_mm + p.length_mm / 2 - pallet.length_mm / 2) * MM,
    (p.z_mm + p.height_mm) * MM + deckTop,
    (p.y_mm + p.width_mm / 2 - pallet.width_mm / 2) * MM,
  );
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

const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export function ProfiledArm({
  profile,
  boxes,
  pallet,
  pick,
  running,
  speed = 1,
}: {
  profile: RobotProfile;
  boxes: Placement[];
  pallet: PalletSpec;
  pick: THREE.Vector3;
  running: boolean;
  speed?: number;
}) {
  const v = profile.visual;
  const LINK1 = v.link1 * v.scale;
  const LINK2 = v.link2 * v.scale;
  const SHOULDER_H = v.shoulderH * v.scale;
  const safeH = SHOULDER_H + LINK1 * 0.7;

  const yawRef = useRef<THREE.Group>(null);
  const shoulderRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);
  const wristRef = useRef<THREE.Group>(null);
  const backLinkRef = useRef<THREE.Group>(null);
  const carriedRef = useRef<THREE.Group>(null);

  const base = useMemo(() => new THREE.Vector3(pick.x - 1.1, 0, pick.z), [pick]);
  const state = useRef<ArmState>({ index: 0, progress: 0, placed: 0 });
  const smooth = useRef({ yaw: 0, shoulder: 0.6, elbow: -1.2, tcp: pick.clone().setY(safeH), carrying: false });

  // Motion pace scales with real joint speed: faster arm = shorter cycle.
  const cycleS = useMemo(() => 3.2 * (120 / profile.maxJointSpeedDegS), [profile.maxJointSpeedDegS]);

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
    const st = state.current;
    if (running && boxes.length > 0) {
      st.progress += (dt * speed) / cycleS;
      if (st.progress >= 1) {
        st.progress = 0;
        st.placed = Math.min(st.placed + 1, boxes.length);
        st.index = st.placed % boxes.length;
      }
    }

    const active = boxes[st.index];
    const s = smooth.current;
    let target = pick.clone().setY(safeH);
    let carrying = false;
    if (active) {
      const res = tcpOnPath(THREE.MathUtils.clamp(st.progress, 0, 1), pick, boxTarget(active, pallet, 0.04), safeH);
      target = res.tcp;
      carrying = res.carrying;
    }
    s.tcp.lerp(target, Math.min(1, dt * 10));
    s.carrying = carrying;

    const ik = solveArm(s.tcp);
    const k = Math.min(1, dt * 8);
    s.yaw = THREE.MathUtils.lerp(s.yaw, ik.yaw, k);
    s.shoulder = THREE.MathUtils.lerp(s.shoulder, ik.shoulder, k);
    s.elbow = THREE.MathUtils.lerp(s.elbow, ik.elbow, k);

    if (yawRef.current) yawRef.current.rotation.y = s.yaw;
    if (shoulderRef.current) shoulderRef.current.rotation.x = -s.shoulder;
    if (elbowRef.current) elbowRef.current.rotation.x = -s.elbow;
    // 4-axis palletizers keep the gripper level; 6-axis follows link angles.
    if (wristRef.current) wristRef.current.rotation.x = v.levelWrist ? 0 : s.shoulder + s.elbow;
    // Cosmetic parallel back-link mirrors the shoulder to read as a palletizer.
    if (backLinkRef.current) backLinkRef.current.rotation.x = -s.shoulder * 0.5;
    if (carriedRef.current) carriedRef.current.visible = s.carrying && !!active;
  });

  const placedBoxes = boxes.slice(0, state.current.placed);

  return (
    <group>
      {/* base */}
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
            {/* upper link */}
            <mesh position={[0, 0, LINK1 / 2]} castShadow>
              <boxGeometry args={[0.16 * v.scale, 0.2 * v.scale, LINK1]} />
              <meshStandardMaterial color={v.color} roughness={0.34} metalness={0.82} envMapIntensity={0.9} />
            </mesh>
            {/* cosmetic parallel back-link for palletizer silhouettes */}
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
                      {boxes[state.current.index] && (
                        <mesh position={[0, -(boxes[state.current.index].height_mm * MM) / 2, 0]} castShadow>
                          <boxGeometry
                            args={[
                              boxes[state.current.index].length_mm * MM,
                              boxes[state.current.index].height_mm * MM,
                              boxes[state.current.index].width_mm * MM,
                            ]}
                          />
                          <meshStandardMaterial color={LAYER_COLORS[boxes[state.current.index].layer % LAYER_COLORS.length]} roughness={0.7} />
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

      {/* pallet deck */}
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[pallet.length_mm * MM, 0.04, pallet.width_mm * MM]} />
        <meshStandardMaterial color="#5b3a1e" roughness={0.9} />
      </mesh>

      {/* placed boxes */}
      {placedBoxes.map((b, i) => (
        <mesh
          key={`${b.sku_id}-${i}`}
          position={[
            (b.x_mm + b.length_mm / 2 - pallet.length_mm / 2) * MM,
            (b.z_mm + b.height_mm / 2) * MM + 0.04,
            (b.y_mm + b.width_mm / 2 - pallet.width_mm / 2) * MM,
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
          <meshStandardMaterial color={LAYER_COLORS[b.layer % LAYER_COLORS.length]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
