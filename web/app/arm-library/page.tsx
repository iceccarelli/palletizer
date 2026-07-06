"use client";

// /arm-library — pick a real-world arm, watch it build a real optimized plan.
//
// Each arm is a schematic of a real mechanism (specs cited in the panel). The
// boxes it stacks are placed exactly where palletizer_full/optimizer.py's port
// puts them. The point for a buyer: the same software drives whichever arm your
// line already runs.

import React, { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Environment, Lightformer, Grid } from '@react-three/drei';
import * as THREE from 'three';
import Link from 'next/link';
import { Play, Pause } from 'lucide-react';
import { ProfiledArm } from '@/components/demos/ProfiledArm';
import { ROBOT_PROFILES, profileById } from '@/lib/palletizer/robotProfiles';
import { planFromBoxes } from '@/lib/palletizer/optimizer';
import { DEFAULT_PALLET } from '@/lib/palletizer/types';
import { BEVERAGE_SKUS } from '@/lib/palletizer/sampleData';

export default function ArmLibraryPage() {
  const [profileId, setProfileId] = useState(ROBOT_PROFILES[0].id);
  const [running, setRunning] = useState(true);
  const [runNonce, setRunNonce] = useState(0);
  const [speed, setSpeed] = useState(1);

  const profile = profileById(profileId);
  const plan = useMemo(() => planFromBoxes(BEVERAGE_SKUS, {}, undefined, 'arm_library'), []);
  const pick = useMemo(() => new THREE.Vector3(1.1, 0.47, 0.6), []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-xs font-mono uppercase tracking-widest text-emerald-400">Hardware-agnostic</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">One engine. Whichever arm you run.</h1>
      <p className="mt-4 max-w-2xl text-white/60">
        The same packing plan, executed by three different mechanisms. Pick an arm and watch it build.
        These are schematic representations scaled from real published specs — not CAD models — driven
        by the actual optimizer output.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Viewport */}
        <div className="relative h-[460px] overflow-hidden rounded-xl border border-white/10 bg-[#0b1120]">
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [3.2, 2.6, 3.4], fov: 42 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
          >
            <fog attach="fog" args={['#0b1120', 9, 24]} />
            {/* three-point rig: cool ambient, warm key, cool fill, soft spot */}
            <hemisphereLight args={['#dbeafe', '#0b1120', 0.5]} />
            <directionalLight
              position={[5, 7, 4]}
              intensity={2.1}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-bias={-0.0004}
            />
            <directionalLight position={[-4, 3, -3]} intensity={0.5} color="#93c5fd" />
            <spotLight position={[-2, 5, 4]} angle={0.5} penumbra={0.8} intensity={0.7} />
            {/* procedural image-based lighting — real reflections on metal, no HDRI asset */}
            <Environment resolution={256}>
              <Lightformer form="rect" intensity={2} position={[0, 4, 2]} scale={[6, 3, 1]} color="#ffffff" />
              <Lightformer form="rect" intensity={0.8} position={[-4, 2, -2]} scale={[3, 3, 1]} color="#bfdbfe" />
              <Lightformer form="ring" intensity={1.2} position={[3, 3, 3]} scale={2} color="#fde68a" />
            </Environment>
            {/* professional floor: technical grid over a dark ground plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
              <planeGeometry args={[60, 60]} />
              <meshStandardMaterial color="#0b1120" roughness={1} metalness={0} />
            </mesh>
            <Grid
              position={[0, -0.048, 0]}
              args={[40, 40]}
              cellSize={0.5}
              cellThickness={0.6}
              cellColor="#1e293b"
              sectionSize={2.5}
              sectionThickness={1}
              sectionColor="#334155"
              fadeDistance={18}
              fadeStrength={1.6}
              infiniteGrid
            />
            <Suspense fallback={null}>
              <ProfiledArm
                key={`${profile.id}-${runNonce}`}
                profile={profile}
                boxes={plan.boxes}
                pallet={DEFAULT_PALLET}
                pick={pick}
                running={running}
                speed={speed}
              />
              <ContactShadows position={[0, -0.045, 0]} opacity={0.55} scale={14} blur={2.6} far={3} resolution={1024} color="#000000" />
            </Suspense>
            <OrbitControls target={[0, 0.5, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={9} />
          </Canvas>

          <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-black/50 px-3 py-2 backdrop-blur">
            <button
              onClick={() => setRunning((r) => !r)}
              className="inline-flex items-center gap-1.5 rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400"
            >
              {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {running ? 'Pause' : 'Run'}
            </button>
            <button
              onClick={() => { setRunNonce((n) => n + 1); setRunning(true); }}
              className="inline-flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Replay
            </button>
            <label className="flex items-center gap-2 text-[11px] text-white/60">
              Speed
              <input type="range" min={0.25} max={3} step={0.25} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
              {speed}×
            </label>
          </div>
        </div>

        {/* Selector + spec panel */}
        <div className="space-y-4">
          <div className="space-y-2">
            {ROBOT_PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfileId(p.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                  p.id === profileId
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: p.visual.color }} />
                  <span className="text-sm font-medium">{p.vendor} {p.model}</span>
                </div>
                <p className="mt-1 text-[11px] text-white/50">{p.blurb}</p>
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs">
            <Spec label="Reach" value={`${profile.reachMm.toLocaleString()} mm`} />
            <Spec label="Payload" value={`${profile.payloadKg} kg`} />
            <Spec label="Axes" value={`${profile.axes}`} />
            <Spec label="Repeatability" value={`±${profile.repeatabilityMm} mm`} />
            <Spec label="Controller" value={profile.controller} />
            <p className="mt-3 border-t border-white/10 pt-2 text-[10px] text-white/35">
              Specs: {profile.source}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
        <p className="text-sm text-white/60">
          Certified connectors per arm are on the roadmap. We partner on hardware — we don&apos;t build arms.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/wms-ingest" className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90">
            Feed it your WMS export
          </Link>
          <Link href="/hardware" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm text-white/80 hover:bg-white/5">
            Hardware & ROS 2
          </Link>
        </div>
      </div>
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0">
      <span className="text-white/40">{label}</span>
      <span className="font-mono text-white/80">{value}</span>
    </div>
  );
}
