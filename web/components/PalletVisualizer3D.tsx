"use client";

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
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

function BoxMesh({ placement, index }: { placement: Placement; index: number }) {
  const { x_mm, y_mm, z_mm, length_mm, width_mm, height_mm, rot_deg, sku_id, layer } = placement;
  
  const color = useMemo(() => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[layer % colors.length];
  }, [layer]);

  const position: [number, number, number] = [
    (x_mm + length_mm / 2) / 1000 - 0.6, 
    (z_mm + height_mm / 2) / 1000 + 0.01, 
    (y_mm + width_mm / 2) / 1000 - 0.5
  ];

  const rotation: [number, number, number] = [0, rot_deg * (Math.PI / 180), 0];

  return (
    <group>
      <mesh position={position} rotation={rotation}>
        <boxGeometry args={[length_mm / 1000, height_mm / 1000, width_mm / 1000]} />
        <meshLambertMaterial color={color} transparent opacity={0.92} />
      </mesh>
      {/* Simple label on hover via Html */}
      <Html position={[position[0], position[1] + height_mm / 2000 + 0.15, position[2]]} style={{ pointerEvents: 'none' }}>
        <div className="text-[9px] font-mono bg-black/80 px-1.5 py-0.5 rounded text-white/90 whitespace-nowrap">
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
  // camera distance scales with the larger of footprint diagonal and stack height
  const camR = Math.max(2.1, 1.35 * Math.max(1.6, stackH * 1.9));
  const target: [number, number, number] = [0, stackH * 0.45, 0];

  return (
    <div className="three-container w-full h-[420px] relative">
      <Canvas 
        camera={{ position: [camR, camR * 0.78, camR], fov: 42 }} 
        style={{ background: '#0a0f1a' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
        <pointLight position={[-5, 3, -5]} intensity={0.4} />

        {/* Pallet base */}
        <mesh position={[0, 0.01, 0]} receiveShadow>
          <boxGeometry args={[palletLength, 0.04, palletWidth]} />
          <meshLambertMaterial color="#78350f" />
        </mesh>

        {/* Pallet boards / edges */}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[palletLength + 0.03, 0.015, palletWidth + 0.03]} />
          <meshLambertMaterial color="#451a03" wireframe={false} />
        </mesh>

        {/* Render all boxes */}
        {plan.boxes.map((placement, index) => (
          <BoxMesh key={index} placement={placement} index={index} />
        ))}

        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          minDistance={1.2} 
          maxDistance={6}
          target={target}
        />
        
        {/* Grid / floor hint */}
        <gridHelper args={[4, 20, '#334155', '#1e2937']} position={[0, -0.02, 0]} />
      </Canvas>

      <div className="absolute bottom-4 right-4 text-[10px] bg-black/60 px-3 py-1 rounded text-white/60 pointer-events-none">
        Drag to orbit • Scroll to zoom • Hover boxes
      </div>
    </div>
  );
}
