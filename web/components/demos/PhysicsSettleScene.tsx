"use client";

// Rigid-body gravity settle of the CURRENT layout using Rapier.
// Every box becomes a dynamic body with its real dimensions and mass; the
// pallet deck is fixed. After `durationS` seconds we sample how far each box
// moved from its planned pose and report the max displacement — a physical,
// measured number, not a vibe. A stable plan holds within a few mm; a bad one
// visibly collapses.
//
// This component is loaded lazily (next/dynamic) so the Rapier WASM bundle is
// only fetched when the user actually runs the simulation.

import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { AndonStatus, AndonTower, CellFloor, SafetyFence } from './IndustrialCell';
import { OrbitControls } from '@react-three/drei';
import { Physics, RapierRigidBody, RigidBody } from '@react-three/rapier';
import { DEFAULT_PALLET, PalletSpec, Placement } from '@/lib/palletizer/types';

const MM = 1 / 1000;

export interface SettleResult {
  max_displacement_mm: number;
  mean_displacement_mm: number;
  toppled_count: number; // boxes displaced > 100 mm
}

function SettleBodies({
  boxes,
  pallet,
  durationS,
  onResult,
}: {
  boxes: Placement[];
  pallet: PalletSpec;
  durationS: number;
  onResult: (r: SettleResult) => void;
}) {
  const refs = useRef<Array<RapierRigidBody | null>>([]);
  const reported = useRef(false);

  const halfL = pallet.length_mm * MM * 0.5;
  const halfW = pallet.width_mm * MM * 0.5;

  const initial = useMemo(
    () =>
      boxes.map((b) => ({
        x: (b.x_mm + b.length_mm / 2) * MM - halfL,
        y: (b.z_mm + b.height_mm / 2) * MM + 0.05,
        z: (b.y_mm + b.width_mm / 2) * MM - halfW,
      })),
    [boxes, halfL, halfW],
  );

  useEffect(() => {
    reported.current = false;
    const t = setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      const disps = refs.current.map((rb, i) => {
        if (!rb) return 0;
        const p = rb.translation();
        return (
          Math.hypot(p.x - initial[i].x, p.y - initial[i].y, p.z - initial[i].z) / MM
        );
      });
      const max = Math.max(0, ...disps);
      const mean = disps.length ? disps.reduce((a, b) => a + b, 0) / disps.length : 0;
      onResult({
        max_displacement_mm: Math.round(max),
        mean_displacement_mm: Math.round(mean),
        toppled_count: disps.filter((d) => d > 100).length,
      });
    }, durationS * 1000);
    return () => clearTimeout(t);
  }, [durationS, initial, onResult]);

  return (
    <>
      <RigidBody type="fixed">
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[pallet.length_mm * MM, 0.06, pallet.width_mm * MM]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
      </RigidBody>
      {/* floor so toppled boxes land somewhere */}
      <RigidBody type="fixed">
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[10, 0.1, 10]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </RigidBody>

      {boxes.map((b, i) => (
        <RigidBody
          key={`${b.sku_id}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[initial[i].x, initial[i].y, initial[i].z]}
          colliders="cuboid"
          mass={Math.max(b.weight_kg, 0.1)}
          friction={0.75}
          restitution={0.02}
        >
          <mesh castShadow>
            <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
            <meshStandardMaterial
              color={(b.fragility ?? 0) >= 0.6 ? '#fbbf24' : '#3b82f6'}
              transparent
              opacity={0.95}
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

export default function PhysicsSettleScene({
  boxes,
  pallet = DEFAULT_PALLET,
  durationS = 4,
  onResult,
  heightClass = 'h-[460px]',
  andonStatus = 'busy',
}: {
  boxes: Placement[];
  pallet?: PalletSpec;
  durationS?: number;
  onResult: (r: SettleResult) => void;
  heightClass?: string;
  andonStatus?: AndonStatus;
}) {
  return (
    <div className={`relative w-full ${heightClass}`}>
      <Canvas shadows camera={{ position: [2.6, 2.1, 2.8], fov: 42 }} style={{ background: '#0a0f1a' }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
        <fog attach="fog" args={['#0a0f1a', 9, 16]} />
        <CellFloor />
        <SafetyFence />
        <AndonTower status={andonStatus} position={[pallet.length_mm / 1000 / 2 + 1.54, 0, -1.7]} />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
          <SettleBodies boxes={boxes} pallet={pallet} durationS={durationS} onResult={onResult} />
        </Physics>
        <gridHelper args={[8, 32, '#334155', '#1e2937']} position={[0, -0.02, 0]} />
        <OrbitControls minDistance={1.2} maxDistance={9} target={[0, 0.7, 0]} />
      </Canvas>
      <div className="absolute top-3 left-3 text-[10px] bg-black/70 px-3 py-1 rounded text-amber-300 font-mono pointer-events-none">
        RAPIER RIGID-BODY SIMULATION • REAL MASSES • g = 9.81 m/s²
      </div>
    </div>
  );
}
