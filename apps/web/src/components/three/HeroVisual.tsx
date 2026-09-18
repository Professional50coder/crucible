'use client'

/**
 * The hero visual, and the switch that keeps it honest.
 *
 * It renders the static SVG composition by default and, only when the browser
 * can afford it and the viewer has not asked for less motion, fades the live
 * WebGL scene in over the top. The order matters:
 *
 *   reduced motion            → static SVG, always. The identical composition,
 *                               no drift. The 3D module is never even fetched.
 *   no WebGL / not yet mounted → static SVG. No crash, no layout shift.
 *   capable + motion allowed   → the `<Canvas>`, cross-faded in.
 *
 * The `<Canvas>` is pulled in through `next/dynamic(ssr:false)`, so `three`
 * stays out of the server bundle and this decoration can never delay or break
 * the server render of a passport's real on-chain values.
 */

import dynamic from 'next/dynamic'

import { usePrefersReducedMotion } from '@/components/Backdrop'
import { StaticWire } from './StaticWire'
import { useWebglReady } from './webgl'

const HeroCanvas = dynamic(() => import('./HeroCanvas'), { ssr: false })

export function HeroVisual({ className = '' }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  const webgl = useWebglReady()
  const live = webgl && !reduced

  return (
    <div className={`relative ${className}`} aria-hidden="true" data-testid="hero-visual" data-mode={live ? 'live' : 'static'}>
      {/* The static composition is always in the tree: it is the source of truth
          for the layout, and the thing that shows if the canvas never arrives. */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{ opacity: live ? 0 : 1 }}
      >
        <StaticWire size={360} radius={0.42} />
      </div>

      {live ? (
        <div className="absolute inset-0 animate-fadeup">
          <HeroCanvas />
        </div>
      ) : null}
    </div>
  )
}

export default HeroVisual
