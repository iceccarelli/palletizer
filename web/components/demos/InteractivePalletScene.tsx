"use client";

// Interactive 3D pallet scene shared by all demos.
//
// Dragging is kinematic + deterministic: the box follows a raycast onto a
// horizontal plane, and on release it settles onto the highest supporting
// surface (lib/palletizer/stability.settleZ). Validation during drag uses the
// exact same support/CoM math as the optimizer, so the colors you see are the
// numbers the engine scores — not a separate approximation.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BoxStability, CoG, DEFAULT_PALLET, PalletSpec, Placement } from '@/lib/palletizer/types';
import { AndonStatus, AndonTower, CellFloor, Conveyor, PalletizerArm, SafetyFence, armBaseFor, pickPosFor } from './IndustrialCell';

const MM = 1 / 1000;

export interface SceneHandlePayload {
  index: number;
  x_mm: number;
  y_mm: number;
}

export interface RobotAnim {
  /** index into boxes currently being placed, -1 = idle */
  activeIndex: number;
  /** 0..1 progress of the active placement */
  progress: number;
  /** boxes with index < placedCount are already on the pallet */
  placedCount: number;
}

interface Props {
  boxes: Placement[];
  perBox?: BoxStability[];
  selectedIndex?: number | null;
  onSelect?: (index: number | null) => void;
  /** live drag updates (throttled by parent as needed) */
  onDragMove?: (p: SceneHandlePayload) => void;
  /** drag released — parent should settle + validate + commit */
  onDragEnd?: (p: SceneHandlePayload) => void;
  interactive?: boolean;
  cog?: CoG | null;
  pallet?: PalletSpec;
  /** number of boxes to show (build animation). undefined = all */
  visibleCount?: number;
  robot?: RobotAnim | null;
  heightClass?: string;
  /** offset the whole pallet group (for multi-pallet layouts) */
  originXm?: number;
  labelAll?: boolean;
  paletteTag?: string;
  /** universal status lamp: green ok, blue busy, amber warn, red bad */
  andonStatus?: AndonStatus | null;
  /** render the shared plant environment (floor striping, fencing) */
  environment?: boolean;
}

const LAYER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

function statusColor(status: BoxStability['status'] | undefined, layer: number, fragility?: number) {
  if (status === 'critical') return '#ef4444';
  if (status === 'warn') return '#f59e0b';
  if ((fragility ?? 0) >= 0.6) return '#fbbf24';
  return LAYER_COLORS[layer % LAYER_COLORS.length];
}

function DraggableBox({
  placement,
  index,
  status,
  selected,
  onSelect,
  onDragMove,
  onDragEnd,
  interactive,
  pallet,
  originXm,
  labelAll,
  setControlsEnabled,
  overridePos,
}: {
  placement: Placement;
  index: number;
  status?: BoxStability['status'];
  selected: boolean;
  onSelect?: (i: number | null) => void;
  onDragMove?: (p: SceneHandlePayload) => void;
  onDragEnd?: (p: SceneHandlePayload) => void;
  interactive?: boolean;
  pallet: PalletSpec;
  originXm: number;
  labelAll?: boolean;
  setControlsEnabled: (v: boolean) => void;
  overridePos?: [number, number, number] | null;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const groupRef = useRef<THREE.Group>(null);
  const hit = useRef(new THREE.Vector3());
  const grabOffset = useRef(new THREE.Vector3());

  const halfL = pallet.length_mm * MM * 0.5;
  const halfW = pallet.width_mm * MM * 0.5;

  const basePos: [number, number, number] = [
    (placement.x_mm + placement.length_mm / 2) * MM - halfL + originXm,
    (placement.z_mm + placement.height_mm / 2) * MM + 0.05,
    (placement.y_mm + placement.width_mm / 2) * MM - halfW,
  ];
  const pos = overridePos ?? basePos;

  const color = statusColor(status, placement.layer, placement.fragility);

  const toMm = useCallback(
    (v: THREE.Vector3) => ({
      x_mm: (v.x - originXm + halfL) / MM - placement.length_mm / 2,
      y_mm: (v.z + halfW) / MM - placement.width_mm / 2,
    }),
    [halfL, halfW, originXm, placement.length_mm, placement.width_mm],
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onSelect?.(index);
    setDragging(true);
    setControlsEnabled(false);
    dragPlane.current.set(new THREE.Vector3(0, 1, 0), -pos[1]);
    if (e.ray.intersectPlane(dragPlane.current, hit.current)) {
      grabOffset.current.set(hit.current.x - pos[0], 0, hit.current.z - pos[2]);
    } else {
      grabOffset.current.set(0, 0, 0);
    }
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging || !groupRef.current) return;
    e.stopPropagation();
    if (e.ray.intersectPlane(dragPlane.current, hit.current)) {
      const nx = hit.current.x - grabOffset.current.x;
      const nz = hit.current.z - grabOffset.current.z;
      groupRef.current.position.x = nx;
      groupRef.current.position.z = nz;
      const mm = toMm(new THREE.Vector3(nx, 0, nz));
      onDragMove?.({ index, ...mm });
    }
  };

  const finishDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging || !groupRef.current) return;
    e.stopPropagation();
    setDragging(false);
    setControlsEnabled(true);
    const mm = toMm(groupRef.current.position);
    onDragEnd?.({ index, ...mm });
  };

  const showLabel = hovered || selected || labelAll;

  return (
    <group
      ref={groupRef}
      position={pos}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(index);
      }}
    >
      <mesh castShadow>
        <boxGeometry
          args={[placement.length_mm * MM, placement.height_mm * MM, placement.width_mm * MM]}
        />
        <meshStandardMaterial
          color={color}
          roughness={0.65}
          metalness={0.05}
          transparent
          opacity={dragging ? 0.85 : 0.96}
          emissive={selected ? '#065f46' : hovered ? '#1e3a5f' : '#000000'}
        />
      </mesh>
      {/* edge outline */}
      <lineSegments>
        <edgesGeometry
          args={[
            new THREE.BoxGeometry(
              placement.length_mm * MM,
              placement.height_mm * MM,
              placement.width_mm * MM,
            ),
          ]}
        />
        <lineBasicMaterial color={selected ? '#34d399' : '#0f172a'} transparent opacity={0.5} />
      </lineSegments>
      {showLabel && (
        <Html
          position={[0, placement.height_mm * MM * 0.5 + 0.09, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="text-[9px] font-mono bg-black/85 px-1.5 py-0.5 rounded text-white/90 whitespace-nowrap border border-white/10">
            {placement.sku_id} L{placement.layer}
            {hovered && (
              <span className="text-white/60">
                {' '}
                • {placement.length_mm.toFixed(0)}×{placement.width_mm.toFixed(0)}×
                {placement.height_mm.toFixed(0)}mm • {placement.weight_kg.toFixed(1)}kg
                {placement.fragility !== undefined && ` • frag ${placement.fragility.toFixed(1)}`}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function PalletDeck({ pallet, originXm, tag }: { pallet: PalletSpec; originXm: number; tag?: string }) {
  const L = pallet.length_mm * MM;
  const W = pallet.width_mm * MM;
  return (
    <group position={[originXm, 0, 0]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[L, 0.04, W]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>
      {[-0.4, 0, 0.4].map((f) => (
        <mesh key={f} position={[0, -0.015, f * W]}>
          <boxGeometry args={[L, 0.05, 0.09]} />
          <meshStandardMaterial color="#451a03" roughness={0.95} />
        </mesh>
      ))}
      {tag && (
        <Html position={[0, 0.02, W / 2 + 0.14]} center style={{ pointerEvents: 'none' }}>
          <div className="text-[10px] font-mono tracking-widest text-white/50 bg-black/50 px-2 py-0.5 rounded">
            {tag}
          </div>
        </Html>
      )}
    </group>
  );
}

function CogMarker({ cog, pallet, originXm }: { cog: CoG; pallet: PalletSpec; originXm: number }) {
  const x = cog.x_mm * MM - pallet.length_mm * MM * 0.5 + originXm;
  const z = cog.y_mm * MM - pallet.width_mm * MM * 0.5;
  const y = cog.z_mm * MM + 0.05;
  return (
    <group>
      {/* vertical drop line from CoG to deck */}
      <mesh position={[x, y / 2 + 0.02, z]}>
        <cylinderGeometry args={[0.004, 0.004, y, 6]} />
        <meshBasicMaterial color="#f472b6" transparent opacity={0.8} />
      </mesh>
      <mesh position={[x, y, z]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshBasicMaterial color="#f472b6" />
      </mesh>
      {/* pallet-centre cross */}
      <mesh position={[originXm, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.03, 0.045, 24]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.9} />
      </mesh>
      <Html position={[x, y + 0.1, z]} center style={{ pointerEvents: 'none' }}>
        <div className="text-[9px] font-mono bg-pink-950/80 text-pink-300 px-1.5 py-0.5 rounded whitespace-nowrap">
          CoM
        </div>
      </Html>
    </group>
  );
}

/** Simplified pedestal robot: base + rotating boom + vertical mast + gripper, tracking the active box. */
export default function InteractivePalletScene({
  boxes,
  perBox,
  selectedIndex,
  onSelect,
  onDragMove,
  onDragEnd,
  interactive = true,
  cog,
  pallet = DEFAULT_PALLET,
  visibleCount,
  robot,
  heightClass = 'h-[460px]',
  originXm = 0,
  labelAll = false,
  paletteTag,
  andonStatus = null,
  environment = true,
}: Props) {
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const shown = visibleCount === undefined ? boxes.length : Math.min(visibleCount, boxes.length);

  return (
    <div className={`relative w-full ${heightClass}`}>
      <Canvas
        shadows
        camera={{ position: [2.6, 2.1, 2.8], fov: 42 }}
        style={{ background: '#0a0f1a' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
        <pointLight position={[-5, 3, -5]} intensity={0.35} />
        <fog attach="fog" args={['#0a0f1a', 9, 16]} />

        {environment && (
          <>
            <CellFloor />
            <SafetyFence />
          </>
        )}
        {andonStatus && <AndonTower status={andonStatus} position={[pallet.length_mm / 1000 / 2 + 1.54 + originXm, 0, -1.7]} />}

        <PalletDeck pallet={pallet} originXm={originXm} tag={paletteTag} />
        <gridHelper args={[8, 32, '#334155', '#1e2937']} position={[0, -0.045, 0]} />
        <ContactShadows position={[0, -0.04, 0]} opacity={0.35} scale={8} blur={2.4} far={2} />

        {boxes.slice(0, shown).map((p, i) => (
          <DraggableBox
            key={`${p.sku_id}-${i}`}
            placement={p}
            index={i}
            status={perBox?.[i]?.status}
            selected={selectedIndex === i}
            onSelect={onSelect}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            interactive={interactive && (!robot || i !== robot.activeIndex)}
            pallet={pallet}
            originXm={originXm}
            labelAll={labelAll && boxes.length <= 16}
            setControlsEnabled={setControlsEnabled}
          />
        ))}

        {cog && shown > 0 && <CogMarker cog={cog} pallet={pallet} originXm={originXm} />}
        {robot && (
          <>
            <PalletizerArm boxes={boxes} robot={robot} pallet={pallet} originXm={originXm} deckTop={0.04} />
            <Conveyor
              pick={pickPosFor(armBaseFor(pallet, originXm))}
              activeBox={robot.activeIndex >= 0 && robot.activeIndex < boxes.length ? boxes[robot.activeIndex] : null}
              carrying={robot.progress >= 0.18 && robot.progress < 0.94}
            />
          </>
        )}

        <OrbitControls
          enabled={controlsEnabled}
          enablePan
          enableZoom
          minDistance={1.2}
          maxDistance={9}
          target={[originXm * 0.5, 0.7, 0]}
        />
      </Canvas>

      <div className="absolute bottom-3 right-3 text-[10px] bg-black/60 px-3 py-1 rounded text-white/50 pointer-events-none">
        {interactive ? 'Drag a box to move it • Click to select • Orbit / scroll to zoom' : 'Orbit / scroll to zoom'}
      </div>
    </div>
  );
}
