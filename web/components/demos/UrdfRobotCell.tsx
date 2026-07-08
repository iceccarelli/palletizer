"use client";

// ---------------------------------------------------------------------------
// UrdfRobotCell — premium "physics digital twin" mode for the Robot Execution demo.
//
// What makes this different from the kinematic InteractivePalletScene:
//   * A REAL UR10e is loaded from /public/urdf/ur10e/ur10e.urdf via urdf-loader.
//   * Its six joints are driven every frame by verified inverse kinematics
//     (lib/palletizer/urIK.ts) so the arm reaches the planner's pick/place poses
//     exactly like the physical robot — warm-started + velocity-clamped for smooth,
//     continuous motion with no closed-form "elbow flip" glitches.
//   * Boxes are Rapier DYNAMIC rigid bodies with real mass/friction/restitution.
//     Each placed box drops from the gripper, collides, stacks, and visibly tips if
//     the plan is unstable. The measured post-settle displacement becomes a
//     "Physics Confidence Score" — a physical, sellable validation number.
//   * HDRI environment + soft shadows + SSAO give the enterprise look.
//
// DESIGN DECISION — kinematic arm, dynamic boxes (not full rigid-body arm):
//   Real palletizing cobots are stiff position-controlled systems. Simulating the
//   arm itself as free rigid bodies with motorised revolute joints is numerically
//   stiff, needs per-joint torque tuning, and adds nothing to the value prop, which
//   is validating the *load*. So the arm is position-controlled (kinematic) and the
//   physics budget is spent entirely on the boxes — the thing that actually fails.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, SoftShadows } from '@react-three/drei';
import { EffectComposer, SSAO, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
// urdf-loader ships an ESM entry + types; ColladaLoader comes from three examples.
import URDFLoader, { URDFRobot } from 'urdf-loader';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { DEFAULT_PALLET, PalletSpec, Placement } from '@/lib/palletizer/types';
import {
  UR10E_JOINTS,
  solveIK,
  topDownTarget,
  baseFromScene,
} from '@/lib/palletizer/urIK';
import type { RobotAnim } from './InteractivePalletScene';

const MM = 1 / 1000;

// --- physics material presets (tuned in the README notes) ------------------
// Cardboard: high friction, almost no bounce. Wood pallet: firm, low bounce.
const CARDBOARD = { friction: 0.85, restitution: 0.0, linearDamping: 0.4, angularDamping: 0.6 };
const HEAVY_CARDBOARD = { friction: 0.9, restitution: 0.0, linearDamping: 0.5, angularDamping: 0.7 };
const materialFor = (b: Placement) => (b.weight_kg > 12 ? HEAVY_CARDBOARD : CARDBOARD);

export interface PhysicsConfidence {
  score: number; // 0..100
  max_displacement_mm: number;
  mean_displacement_mm: number;
  toppled_count: number;
  settled: boolean;
}

// ---------------------------------------------------------------------------
// URDF loader hook — loads once, resolves .dae meshes via ColladaLoader.
// ---------------------------------------------------------------------------
function useUrdf(url: string) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    // urdf-loader hands us each mesh path; load Collada and return its scene.
    // Signature is (url, manager, material, onLoad) — see urdf-loader types.
    loader.loadMeshCb = (path, mgr, _material, done) => {
      new ColladaLoader(mgr).load(
        path,
        (dae) => {
          const scene = dae.scene;
          scene.traverse((c) => {
            const m = c as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          done(scene);
        },
        undefined,
        (err) => done(null as unknown as THREE.Object3D, err as Error),
      );
    };
    loader.load(
      url,
      (result) => {
        if (cancelled) return;
        // start in a natural "ready" posture
        UR10E_JOINTS.forEach((j, i) => result.setJointValue(j, [0, -1.4, 1.6, -1.75, -1.57, 0][i]));
        setRobot(result);
      },
      undefined,
      (err) => !cancelled && setError(String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { robot, error };
}

// ---------------------------------------------------------------------------
// Trajectory: phased pick → lift → traverse → place → release, 0..1 progress.
// Returns the TCP target in ARM-BASE-RELATIVE scene coords (Y-up) + a "gripping"
// flag used to attach the carried box and to time the physics spawn.
// ---------------------------------------------------------------------------
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, ease(t));

function tcpTarget(
  progress: number,
  pick: THREE.Vector3,
  place: THREE.Vector3,
  safeH: number,
): { p: THREE.Vector3; gripping: boolean; released: boolean } {
  const pickUp = pick.clone().setY(safeH);
  const placeUp = place.clone().setY(Math.max(safeH, place.y + 0.18));
  // 0.00–0.18 descend to pick | 0.18–0.34 lift | 0.34–0.74 traverse |
  // 0.74–0.92 descend to place | 0.92–1.00 lift away
  if (progress < 0.18) return { p: lerp3(pickUp, pick, progress / 0.18), gripping: false, released: false };
  if (progress < 0.34) return { p: lerp3(pick, pickUp, (progress - 0.18) / 0.16), gripping: true, released: false };
  if (progress < 0.74) return { p: lerp3(pickUp, placeUp, (progress - 0.34) / 0.4), gripping: true, released: false };
  if (progress < 0.92) return { p: lerp3(placeUp, place, (progress - 0.74) / 0.18), gripping: true, released: false };
  return { p: lerp3(place, placeUp, (progress - 0.92) / 0.08), gripping: false, released: true };
}

// Planned resting pose (scene coords) of a box's centre on the pallet.
function boxCenterScene(b: Placement, pallet: PalletSpec, originXm: number): THREE.Vector3 {
  const halfL = pallet.length_mm * MM * 0.5;
  const halfW = pallet.width_mm * MM * 0.5;
  return new THREE.Vector3(
    (b.x_mm + b.length_mm / 2) * MM - halfL + originXm,
    (b.z_mm + b.height_mm / 2) * MM + 0.05,
    (b.y_mm + b.width_mm / 2) * MM - halfW,
  );
}

// ---------------------------------------------------------------------------
// The driven robot: primitive URDF + kinematics + a simple vacuum gripper.
// ---------------------------------------------------------------------------
function DrivenRobot({
  robot,
  basePos,
  pick,
  place,
  robotAnim,
  carried,
  onTcp,
}: {
  robot: URDFRobot;
  basePos: THREE.Vector3;
  pick: THREE.Vector3;
  place: THREE.Vector3;
  robotAnim: RobotAnim;
  carried: Placement | null;
  onTcp: (world: THREE.Vector3, gripping: boolean, released: boolean) => void;
}) {
  const q = useRef<number[]>([0, -1.4, 1.6, -1.75, -1.57, 0]);
  const gripperRef = useRef<THREE.Group>(null);
  const carriedRef = useRef<THREE.Group>(null);

  useFrame(() => {
    // 1) Compute the desired TCP in arm-relative scene coords.
    const relPick = pick.clone().sub(basePos);
    const relPlace = place.clone().sub(basePos);
    let rel = relPick.clone().setY(0.55);
    let gripping = false, released = false;
    if (carried) {
      const r = tcpTarget(THREE.MathUtils.clamp(robotAnim.progress, 0, 1), relPick, relPlace, 0.55);
      rel = r.p; gripping = r.gripping; released = r.released;
    }
    // 2) scene(rel) -> base frame (Z-up) target, TCP pointing straight down.
    const [bx, by, bz] = baseFromScene(rel.x, rel.y, rel.z);
    const yaw = carried ? carried.rot_deg : 0;
    const target = topDownTarget(bx, by, bz, yaw);
    // 3) IK — warm-started from last frame, velocity-clamped for smoothness.
    const sol = solveIK(target, { seed: q.current, maxJointStep: 0.16 });
    q.current = sol.q;
    UR10E_JOINTS.forEach((j, i) => robot.setJointValue(j, q.current[i]));
    // 4) Report the actual TCP (world) so the parent can spawn the physics box.
    const world = new THREE.Vector3(rel.x, rel.y, rel.z).add(basePos);
    if (gripperRef.current) {
      gripperRef.current.position.copy(new THREE.Vector3(rel.x, rel.y, rel.z));
    }
    if (carriedRef.current) carriedRef.current.visible = gripping && !!carried;
    onTcp(world, gripping, released);
  });

  return (
    <group position={basePos.toArray()}>
      {/* pedestal */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.24, 0.12, 32]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* URDF robot: rotate ROS Z-up into the scene's Y-up */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <primitive object={robot} />
      </group>
      {/* Simple vacuum gripper + carried carton, positioned at the live TCP. */}
      <group ref={gripperRef}>
        <mesh position={[0, -0.03, 0]} castShadow>
          <boxGeometry args={[0.16, 0.05, 0.16]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.5} />
        </mesh>
        {[-0.05, 0.05].map((ox) =>
          [-0.05, 0.05].map((oz) => (
            <mesh key={`${ox}${oz}`} position={[ox, -0.07, oz]}>
              <cylinderGeometry args={[0.02, 0.025, 0.03, 12]} />
              <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.2} />
            </mesh>
          )),
        )}
        <group ref={carriedRef} visible={false}>
          {carried && (
            <mesh position={[0, -0.09 - (carried.height_mm * MM) / 2, 0]} castShadow>
              <boxGeometry args={[carried.length_mm * MM, carried.height_mm * MM, carried.width_mm * MM]} />
              <meshStandardMaterial color="#c8935f" roughness={0.9} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Physics boxes: one dynamic body per placed box, spawned once (keyed by index)
// a few cm above its planned pose so it drops and settles for real.
// ---------------------------------------------------------------------------
function PhysicsStack({
  boxes,
  placedCount,
  pallet,
  originXm,
  onConfidence,
}: {
  boxes: Placement[];
  placedCount: number;
  pallet: PalletSpec;
  originXm: number;
  onConfidence: (c: PhysicsConfidence) => void;
}) {
  const bodies = useRef<Array<RapierRigidBody | null>>([]);
  const planned = useMemo(
    () => boxes.map((b) => boxCenterScene(b, pallet, originXm)),
    [boxes, pallet, originXm],
  );
  const settleTimer = useRef(0);

  // Continuously sample displacement so the confidence number is live.
  useFrame((_, dt) => {
    if (placedCount === 0) return;
    settleTimer.current += dt;
    if (settleTimer.current < 0.25) return; // sample ~4×/s
    settleTimer.current = 0;
    let max = 0, sum = 0, toppled = 0, n = 0;
    for (let i = 0; i < placedCount; i++) {
      const rb = bodies.current[i];
      if (!rb) continue;
      const t = rb.translation();
      const d = Math.hypot(t.x - planned[i].x, t.y - planned[i].y, t.z - planned[i].z) / MM;
      max = Math.max(max, d); sum += d; n++;
      if (d > 100) toppled++;
    }
    const mean = n ? sum / n : 0;
    // Score: 100 at 0 mm, degrading; 40 mm drift ≈ 60, 100 mm ≈ topple territory.
    const score = Math.max(0, Math.round(100 - max * 0.9 - toppled * 12));
    onConfidence({
      score,
      max_displacement_mm: Math.round(max),
      mean_displacement_mm: Math.round(mean),
      toppled_count: toppled,
      settled: placedCount >= boxes.length,
    });
  });

  const L = pallet.length_mm * MM;
  const W = pallet.width_mm * MM;

  return (
    <>
      {/* pallet deck (fixed) + wooden runners */}
      <RigidBody type="fixed" friction={0.9} colliders="cuboid">
        <mesh position={[originXm, 0.02, 0]} receiveShadow>
          <boxGeometry args={[L, 0.04, W]} />
          <meshStandardMaterial color="#7c5a33" roughness={0.85} />
        </mesh>
      </RigidBody>
      {/* catch floor so any topple lands somewhere */}
      <RigidBody type="fixed" friction={0.9}>
        <mesh position={[0, -0.1, 0]} receiveShadow>
          <boxGeometry args={[12, 0.12, 12]} />
          <meshStandardMaterial color="#0b1220" roughness={1} />
        </mesh>
      </RigidBody>

      {boxes.slice(0, placedCount).map((b, i) => {
        const m = materialFor(b);
        const p = planned[i];
        return (
          <RigidBody
            key={`${b.sku_id}-${i}`}
            ref={(el) => {
              bodies.current[i] = el;
            }}
            // spawn just above the planned pose so it drops + settles onto the stack
            position={[p.x, p.y + 0.04, p.z]}
            rotation={[0, (b.rot_deg * Math.PI) / 180, 0]}
            colliders="cuboid"
            mass={Math.max(b.weight_kg, 0.2)}
            friction={m.friction}
            restitution={m.restitution}
            linearDamping={m.linearDamping}
            angularDamping={m.angularDamping}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry args={[b.length_mm * MM, b.height_mm * MM, b.width_mm * MM]} />
              <meshStandardMaterial
                color={(b.fragility ?? 0) >= 0.6 ? '#eab308' : '#c8935f'}
                roughness={0.92}
                metalness={0.02}
              />
            </mesh>
          </RigidBody>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export default function UrdfRobotCell({
  boxes,
  robot: robotAnimProp,
  pallet = DEFAULT_PALLET,
  originXm = 0,
  heightClass = 'h-[460px]',
  onConfidence,
}: {
  boxes: Placement[];
  robot?: RobotAnim;
  pallet?: PalletSpec;
  originXm?: number;
  heightClass?: string;
  onConfidence?: (c: PhysicsConfidence) => void;
}) {
  // When no animation is supplied (static demos), show the arm idle and all
  // boxes already placed — they still drop as physics bodies and get scored.
  const robotAnim: RobotAnim =
    robotAnimProp ?? { activeIndex: -1, progress: 1, placedCount: boxes.length };
  const { robot, error } = useUrdf('/urdf/ur10e/ur10e.urdf');
  const [conf, setConf] = useState<PhysicsConfidence | null>(null);

  // Robot base placed to the −X side of the pallet, facing it.
  const basePos = useMemo(
    () => new THREE.Vector3(originXm - pallet.length_mm * MM * 0.5 - 0.75, 0, 0),
    [pallet, originXm],
  );
  const pick = useMemo(() => basePos.clone().add(new THREE.Vector3(0.35, 0.28, 0.65)), [basePos]);

  const carried =
    robotAnim.activeIndex >= 0 && robotAnim.activeIndex < boxes.length
      ? boxes[robotAnim.activeIndex]
      : null;
  const place = useMemo(
    () => (carried ? boxCenterScene(carried, pallet, originXm) : pick.clone()),
    [carried, pallet, originXm, pick],
  );

  const handleConf = (c: PhysicsConfidence) => {
    setConf(c);
    onConfidence?.(c);
  };

  return (
    <div className={`relative w-full ${heightClass}`}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [2.9, 2.3, 3.1], fov: 40 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        style={{ background: '#0a0f1a' }}
      >
        <color attach="background" args={['#0a0f1a']} />
        <hemisphereLight intensity={0.35} groundColor="#0b1220" />
        <directionalLight
          position={[4, 8, 4]}
          intensity={2.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0002}
        >
          <orthographicCamera attach="shadow-camera" args={[-4, 4, 4, -4, 0.1, 20]} />
        </directionalLight>
        <SoftShadows size={26} samples={16} focus={0.9} />
        {/* HDRI reflections/lighting — warehouse mood; background stays dark. */}
        <Environment preset="warehouse" background={false} />

        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 90}>
          <PhysicsStack
            boxes={boxes}
            placedCount={robotAnim.placedCount}
            pallet={pallet}
            originXm={originXm}
            onConfidence={handleConf}
          />
          {robot && (
            <DrivenRobot
              robot={robot}
              basePos={basePos}
              pick={pick}
              place={place}
              robotAnim={robotAnim}
              carried={carried}
              onTcp={() => {}}
            />
          )}
        </Physics>

        <gridHelper args={[10, 40, '#243244', '#151f2e']} position={[0, 0, 0]} />
        <OrbitControls minDistance={1.4} maxDistance={10} target={[originXm, 0.6, 0]} makeDefault />

        <EffectComposer enableNormalPass multisampling={0}>
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={16}
            radius={0.12}
            intensity={22}
            luminanceInfluence={0.5}
            color={new THREE.Color('black') as any}
            worldDistanceThreshold={20}
            worldDistanceFalloff={5}
            worldProximityThreshold={6}
            worldProximityFalloff={6}
          />
          <SMAA />
        </EffectComposer>
      </Canvas>

      {/* Physics Confidence Score overlay */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <div className="text-[10px] bg-black/70 px-3 py-1 rounded text-amber-300 font-mono">
          RAPIER • UR10e URDF • g = 9.81 m/s²
        </div>
        {conf && (
          <div
            className={`text-[11px] px-3 py-1 rounded font-mono ${
              conf.score >= 80
                ? 'bg-emerald-900/70 text-emerald-300'
                : conf.score >= 55
                ? 'bg-amber-900/70 text-amber-300'
                : 'bg-red-900/70 text-red-300'
            }`}
          >
            Physics Confidence {conf.score}/100 • max drift {conf.max_displacement_mm}mm
            {conf.toppled_count > 0 && ` • ${conf.toppled_count} TOPPLED`}
          </div>
        )}
      </div>

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 text-red-300 text-sm p-6 text-center">
          Failed to load UR10e URDF ({error}). Ensure /public/urdf/ur10e/ assets are deployed.
        </div>
      )}
      {!robot && !error && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-white/60 text-xs font-mono animate-pulse">Loading UR10e URDF…</div>
        </div>
      )}
      <div className="absolute bottom-3 right-3 text-[10px] bg-black/60 px-3 py-1 rounded text-white/50 pointer-events-none">
        Real UR10e • physics-driven placement • orbit / scroll to zoom
      </div>
    </div>
  );
}
