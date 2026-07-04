"use client";

// CellScene — the industrial 3D view for Live Cell OS.
//
// What a buyer of palletizing software expects to see (RoboDK / Visual
// Components / Pally-class visuals), built honestly on the sim's real state:
//   - 4-axis palletizer arm (base yaw, shoulder, elbow, vertical wrist) with
//     analytic 2-link IK — the standard kinematic class for this machine
//   - infeed conveyor with queued cartons; the active box is VISIBLY picked,
//     carried along a lift-traverse-lower path, and released onto the pallet
//   - andon stack light wired 1:1 to the edge state machine
//     (green IDLE, blue MOVING, amber EXCEPTION_HANDLING, red FAULT_ESTOP)
//   - VLM camera over the pick station; its view cone flares amber while the
//     exception engine is analyzing frames
//   - safety fencing, hazard floor striping, camera presets
// Nothing here invents data: pose comes from (activeIndex, progress,
// placedCount), colors come from EdgeState, wear tints the gripper pads.

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DEFAULT_PALLET, PalletSpec, Placement } from '@/lib/palletizer/types';
import type { EdgeState } from '@/lib/palletizer/cellsim';
import {
  AndonStatus, AndonTower, CELL_LAYER_COLORS, CellFloor, Conveyor, PalletizerArm,
  SafetyFence, VlmCamera, armBaseFor, pickPosFor,
} from './IndustrialCell';



export interface CellSceneProps {
  boxes: Placement[];
  activeIndex: number;
  progress: number;
  placedCount: number;
  state: EdgeState;
  gripperWear: number;
  palletTag?: string;
  pallet?: PalletSpec;
  heightClass?: string;
}

const MMc = 1 / 1000;
const ANDON_OF: Record<EdgeState, AndonStatus> = {
  IDLE: 'ok', MOVING: 'busy', EXCEPTION_HANDLING: 'warn', FAULT_ESTOP: 'bad',
};

function PalletDeck({ pallet, tag }: { pallet: PalletSpec; tag?: string }) {
  const L = pallet.length_mm * MMc;
  const W = pallet.width_mm * MMc;
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
        <boxGeometry args={[L, 0.144, W]} />
        <meshStandardMaterial color="#7c4a21" roughness={0.9} />
      </mesh>
      {[-L / 2 + 0.05, 0, L / 2 - 0.05].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]}>
          <boxGeometry args={[0.09, 0.09, W]} />
          <meshStandardMaterial color="#5c3517" roughness={0.95} />
        </mesh>
      ))}
      {tag && (
        <Html position={[-L / 2, 0.02, W / 2 + 0.12]} style={{ pointerEvents: 'none' }}>
          <div className="text-[9px] font-mono text-white/45 bg-black/50 px-1.5 py-0.5 rounded whitespace-nowrap">{tag}</div>
        </Html>
      )}
    </group>
  );
}

function PlacedBoxes({ boxes, placedCount }: { boxes: Placement[]; placedCount: number }) {
  return (
    <group>
      {boxes.slice(0, placedCount).map((p, i) => {
        const x = (p.x_mm + p.length_mm / 2 - DEFAULT_PALLET.length_mm / 2) * MMc;
        const z = (p.y_mm + p.width_mm / 2 - DEFAULT_PALLET.width_mm / 2) * MMc;
        const y = (p.z_mm + p.height_mm / 2) * MMc + 0.145;
        return (
          <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
            <boxGeometry args={[p.length_mm * MMc - 0.004, p.height_mm * MMc - 0.002, p.width_mm * MMc - 0.004]} />
            <meshStandardMaterial color={CELL_LAYER_COLORS[p.layer % CELL_LAYER_COLORS.length]} roughness={0.75} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera presets — viewpoint jumps buyers expect from cell software
// ---------------------------------------------------------------------------
const PRESETS = {
  overview: { pos: new THREE.Vector3(3.4, 2.6, 3.6), tgt: new THREE.Vector3(0.4, 0.5, 0) },
  gripper: { pos: new THREE.Vector3(2.3, 1.5, 1.9), tgt: new THREE.Vector3(1.05, 0.8, 0.2) },
  pallet: { pos: new THREE.Vector3(0.1, 3.4, 0.15), tgt: new THREE.Vector3(0, 0.2, 0) },
} as const;
type PresetKey = keyof typeof PRESETS;

function CameraRig({ preset, jump }: { preset: PresetKey; jump: number }) {
  const applied = useRef(-1);
  useFrame(({ camera }) => {
    if (applied.current === jump) return;
    const p = PRESETS[preset];
    camera.position.lerp(p.pos, 0.12);
    if (camera.position.distanceTo(p.pos) < 0.03) applied.current = jump;
  });
  return null;
}

// ---------------------------------------------------------------------------
// Scene root
// ---------------------------------------------------------------------------
export default function CellScene({
  boxes, activeIndex, progress, placedCount, state, gripperWear,
  palletTag, pallet = DEFAULT_PALLET, heightClass = 'h-[460px]',
}: CellSceneProps) {
  const [preset, setPreset] = useState<PresetKey>('overview');
  const [jump, setJump] = useState(0);
  const active = activeIndex >= 0 && activeIndex < boxes.length ? boxes[activeIndex] : null;
  const carrying = active !== null && progress >= 0.18 && progress < 0.94 && state === 'MOVING';

  return (
    <div className={`relative w-full ${heightClass}`}>
      <Canvas shadows camera={{ position: PRESETS.overview.pos.toArray(), fov: 42 }} style={{ background: '#0a0f1a' }} dpr={[1, 2]}>
        <fog attach="fog" args={['#0a0f1a', 9, 16]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 9, 4]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} />
        <pointLight position={[-4, 3, -4]} intensity={0.3} />
        <pointLight position={[2.2, 2.4, 1.8]} intensity={0.35} color="#93c5fd" />

        <CellFloor />
        <SafetyFence />
        <PalletDeck pallet={pallet} tag={palletTag} />
        <PlacedBoxes boxes={boxes} placedCount={placedCount} />
        <Conveyor pick={pickPosFor(armBaseFor(pallet))} activeBox={active} carrying={carrying} />
        <PalletizerArm
          boxes={boxes}
          robot={{ activeIndex, progress, placedCount }}
          pallet={pallet}
          deckTop={0.145}
          gripperWear={gripperWear}
          hold={state === 'EXCEPTION_HANDLING' || state === 'FAULT_ESTOP'}
        />
        <AndonTower status={ANDON_OF[state]} position={[armBaseFor(pallet).x + 1.0, 0, -1.7]} />
        <VlmCamera analyzing={state === 'EXCEPTION_HANDLING'} x={pickPosFor(armBaseFor(pallet)).x} z={pickPosFor(armBaseFor(pallet)).z} />

        <ContactShadows position={[0, -0.045, 0]} opacity={0.4} scale={10} blur={2.2} far={2.4} />
        <gridHelper args={[11, 44, '#1f2a3d', '#141d2e']} position={[0, -0.05, 0]} />
        <OrbitControls target={PRESETS[preset].tgt.toArray()} maxPolarAngle={Math.PI / 2.05} minDistance={1.4} maxDistance={9} />
        <CameraRig preset={preset} jump={jump} />
      </Canvas>

      {/* viewpoint presets */}
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <button key={k} onClick={() => { setPreset(k); setJump((j) => j + 1); }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono tracking-wider border backdrop-blur transition ${
              preset === k ? 'border-sky-400/60 bg-sky-400/15 text-sky-300' : 'border-white/15 bg-black/40 text-white/50 hover:text-white/80'}`}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 text-[9px] font-mono text-white/35 bg-black/40 px-2 py-1 rounded">
        Orbit / scroll to zoom
      </div>
    </div>
  );
}
