'use client'

/**
 * The forged core — the landing page's 3D hero.
 *
 * A wireframe icosahedron turning slowly inside a faint node field: the raw
 * lineage a fine-tuning run emits, drawn as an object being forged rather than a
 * marketing gradient. It obeys the same rules the rest of the interface does —
 * near-monochrome, one phosphor accent, hairline edges, motion slow enough that
 * it never competes with the type beside it.
 *
 * This module is the heavy half and is code-split away: it is only ever reached
 * through `next/dynamic(..., { ssr: false })`, so `three` never enters the server
 * bundle and never runs during SSR of a passport's on-chain values.
 *
 * Interaction is a whisper of pointer parallax, nothing more — no controls, no
 * zoom, no scroll capture. The canvas sits behind the hero copy with
 * `pointer-events: none`, so it can never intercept a click meant for a CTA.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Points, PointMaterial } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import type { Group, Mesh } from 'three'

const PHOSPHOR = '#c8f050'
const EDGE_DIM = '#4a4d48'

function dustField(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  // A deterministic pseudo-random spread — a fixed seed so the field is the same
  // composition every load rather than a different scatter each time.
  let seed = 1337
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < count; i += 1) {
    const r = 2.6 + rand() * 2.8
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(2 * rand() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  return positions
}

function Core() {
  const group = useRef<Group>(null)
  const inner = useRef<Mesh>(null)
  const { pointer } = useThree()

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.16
      group.current.rotation.x += delta * 0.045
      // Whisper of parallax toward the pointer; eased, never snapping.
      group.current.position.x += (pointer.x * 0.25 - group.current.position.x) * Math.min(1, delta * 2)
      group.current.position.y += (pointer.y * 0.18 - group.current.position.y) * Math.min(1, delta * 2)
    }
    if (inner.current) {
      inner.current.rotation.y -= delta * 0.22
      inner.current.rotation.z += delta * 0.05
    }
  })

  return (
    <group ref={group}>
      {/* The outer shell: near-invisible faces, phosphor hairline edges. */}
      <mesh>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshBasicMaterial color={PHOSPHOR} transparent opacity={0.04} />
        <Edges threshold={1} color={PHOSPHOR} />
      </mesh>

      {/* An inner core, counter-rotating, dimmer — depth without a light rig. */}
      <mesh ref={inner} scale={0.62}>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshBasicMaterial color={EDGE_DIM} transparent opacity={0.05} />
        <Edges threshold={1} color={EDGE_DIM} />
      </mesh>

      {/* The twelve vertices as small phosphor nodes. */}
      <Vertices />
    </group>
  )
}

function Vertices() {
  const positions = useMemo(() => {
    const PHI = (1 + Math.sqrt(5)) / 2
    const len = Math.hypot(1, PHI)
    const raw: [number, number, number][] = [
      [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
      [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
      [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
    ]
    return raw.map(([x, y, z]) => [(x / len) * 1.5, (y / len) * 1.5, (z / len) * 1.5] as const)
  }, [])

  return (
    <>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color={PHOSPHOR} />
        </mesh>
      ))}
    </>
  )
}

function Dust() {
  const points = useRef<import('three').Points>(null)
  const positions = useMemo(() => dustField(220), [])

  useFrame((_, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.02
  })

  return (
    <Points ref={points} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#82847e"
        size={0.02}
        sizeAttenuation
        depthWrite={false}
        opacity={0.55}
      />
    </Points>
  )
}

export default function HeroCanvas() {
  return (
    <Canvas
      // Transparent so the app's own backdrop and grid read through the render.
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 4.6], fov: 42 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
      frameloop="always"
    >
      <Core />
      <Dust />
    </Canvas>
  )
}
