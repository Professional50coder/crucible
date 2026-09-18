'use client'

/**
 * The certificate seal — the passport header's 3D treatment.
 *
 * The same forged core from the landing page, now small, sealed, and turning
 * quietly in the corner of the certificate like a watermark. It is decorative
 * only: every fact on the passport is stated in opaque, hairlined panels in
 * front of it, and this never carries a value.
 *
 * Split away behind `next/dynamic(ssr:false)` for the same reason as the hero —
 * `three` must not enter the server bundle, and the passport view is
 * server-rendered against real on-chain values that must not wait on WebGL.
 */

import { Canvas, useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { useRef } from 'react'
import type { Group } from 'three'

const PHOSPHOR = '#c8f050'

function Seal() {
  const group = useRef<Group>(null)

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.28
      group.current.rotation.x += delta * 0.06
    }
  })

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.4, 0]} />
        <meshBasicMaterial color={PHOSPHOR} transparent opacity={0.05} />
        <Edges threshold={1} color={PHOSPHOR} />
      </mesh>
      <mesh scale={0.55}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshBasicMaterial color={PHOSPHOR} transparent opacity={0.08} />
        <Edges threshold={1} color="#8fa83c" />
      </mesh>
    </group>
  )
}

export default function PassportSeal() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 4.2], fov: 40 }}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    >
      <Seal />
    </Canvas>
  )
}
