"use client";

// Premium static pallet viewer.
//
// Upgrade over the original meshLambert box viewer:
//   * PBR cardboard/wood materials (meshStandardMaterial + roughness/metalness).
//   * HDRI image-based lighting (drei <Environment>) + a keyed directional light.
//   * Soft contact shadows and SSAO for grounded, enterprise-grade depth.
//   * Instanced-friendly structure and stable coordinate mapping (unchanged layout).
// Prop contract is identical to before, so it is a drop-in replacement.

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Html,
  Environment,
  SoftShadows,
  ContactShadows,
} from '@react-three/drei';
import { EffectComposer, SSAO, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface Placement {
  sku_id: string;
  x_mm: number;
  y_mm: number;
  z_mm: number;
  rot_deg: number;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  weight_kg: number;
  layer: number;
}

interface PalletPlan {
  boxes: Placement[];
  metrics: any;
}

const MM = 1 / 1000;

// Warm carton palette by layer — reads as real corrugated cardboard, not toy blocks.
const CARTON_TINTS = ['#c8935f', '#b9824f', '#cf9d6a', '#bd8a58', '#c69264', '#b57d49'];

function BoxMesh({ placement }: { placement: Placement }) {
  const { x_mm, y_mm, z_mm, length_mm, width_mm, height_mm, rot_deg, sku_id, layer } = placement;

  const color = useMemo(() => CARTON_TINTS[layer % CARTON_TINTS.length], [layer]);

  const position: [number, number, number] = [
    (x_mm + length_mm / 2) * MM - 0.6,
    (z_mm + height_mm / 2) * MM + 0.05,
    (y_mm + width_mm / 2) * MM - 0.5,
  ];
  const rotation: [number, number, number] = [0, rot_deg * (Math.PI / 180), 0];

  return (
    <group>
      <mesh position={position} rotation={rotation} castShadow receiveShadow>
        <boxGeometry args={[length_mm * MM, height_mm * MM, width_mm * MM]} />
        <meshStandardMaterial color={color} roughness={0.92} metalness={0.02} />
      </mesh>
      {/* subtle seam lines so cartons read as cardboard */}
      <lineSegments position={position} rotation={rotation}>
        <edgesGeometry args={[new THREE.BoxGeometry(length_mm * MM, height_mm * MM, width_mm * MM)]} />
        <lineBasicMaterial color="#5b4126" transparent opacity={0.35} />
      </lineSegments>
      <Html
        position={[position[0], position[1] + height_mm / 2000 + 0.14, position[2]]}
        style={{ pointerEvents: 'none' }}
        center
      >
        <div className="text-[9px] font-mono bg-black/80 px-1.5 py-0.5 rounded text-white/90 whitespace-nowrap border border-white/10">
          {sku_id} L{layer}
        </div>
      </Html>
    </group>
  );
}

export default function PalletVisualizer3D({ plan }: { plan: PalletPlan }) {
  const palletLength = 1.219;
  const palletWidth = 1.016;
  const stackH = Math.max(0.3, (plan.metrics?.stack_height_mm ?? 800) / 1000);
  const camR = Math.max(2.1, 1.35 * Math.max(1.6, stackH * 1.9));
  const target: [number, number, number] = [0, stackH * 0.45, 0];

  return (
    <div className="three-container w-full h-[420px] relative">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [camR, camR * 0.78, camR], fov: 42 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
        style={{ background: '#0a0f1a' }}
      >
        <color attach="background" args={['#0a0f1a']} />
        <hemisphereLight intensity={0.3} groundColor="#0b1220" />
        <directionalLight
          position={[5, 10, 5]}
          intensity={2.0}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0002}
        >
          <orthographicCamera attach="shadow-camera" args={[-3, 3, 3, -3, 0.1, 20]} />
        </directionalLight>
        <SoftShadows size={24} samples={16} focus={0.9} />
        <Environment preset="warehouse" background={false} />

        {/* Pallet base + runners (wood PBR) */}
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[palletLength, 0.04, palletWidth]} />
          <meshStandardMaterial color="#7c5a33" roughness={0.85} metalness={0.03} />
        </mesh>
        {[-0.4, 0, 0.4].map((f) => (
          <mesh key={f} position={[0, -0.01, f * palletWidth]} receiveShadow castShadow>
            <boxGeometry args={[palletLength, 0.05, 0.09]} />
            <meshStandardMaterial color="#5f4425" roughness={0.9} />
          </mesh>
        ))}

        {plan.boxes.map((placement, index) => (
          <BoxMesh key={index} placement={placement} />
        ))}

        <ContactShadows position={[0, 0.001, 0]} opacity={0.5} scale={6} blur={2.6} far={3} />
        <gridHelper args={[4, 20, '#243244', '#151f2e']} position={[0, -0.02, 0]} />

        <OrbitControls
          enablePan
          enableZoom
          minDistance={1.2}
          maxDistance={6}
          target={target}
          makeDefault
        />

        <EffectComposer enableNormalPass multisampling={0}>
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={16}
            radius={0.1}
            intensity={20}
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

      <div className="absolute bottom-4 right-4 text-[10px] bg-black/60 px-3 py-1 rounded text-white/60 pointer-events-none">
        Drag to orbit • Scroll to zoom • Hover boxes
      </div>
    </div>
  );
}
