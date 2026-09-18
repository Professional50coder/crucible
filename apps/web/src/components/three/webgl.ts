'use client'

/**
 * Whether this browser can actually run the 3D layer, resolved after mount.
 *
 * Every canvas in this app is an enhancement over a static composition that is
 * already correct on its own, so nothing may mount a `<Canvas>` until WebGL is
 * confirmed present. Three consequences follow from that, and all three are
 * deliberate:
 *
 *   1. Server render and first paint show the static fallback — the hook returns
 *      `false` until an effect has run, so there is never a hydration mismatch.
 *   2. A machine with WebGL disabled, blocked, or exhausted keeps the fallback
 *      rather than crashing on a context that cannot be created.
 *   3. jsdom has no WebGL, so the test environment stays on the fallback and no
 *      test ever spins up a real GL context — the same code path a headless CI
 *      box would take.
 *
 * The probe context is released immediately with `WEBGL_lose_context`: browsers
 * cap the number of live GL contexts, and a detection probe must not spend one.
 */

import { useEffect, useState } from 'react'

function probe(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl2') as WebGLRenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return true
  } catch {
    return false
  }
}

export function useWebglReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(probe())
  }, [])
  return ready
}
