'use client'

/**
 * The passport seal wrapper — the same fallback contract as the hero.
 *
 * Static SVG by default (server render, no WebGL, and reduced motion), the live
 * `<Canvas>` faded in only when the browser can afford it and motion is allowed.
 * Reduced motion gets the identical still, never a different picture.
 */

import dynamic from 'next/dynamic'

import { usePrefersReducedMotion } from '@/components/Backdrop'
import { StaticWire } from './StaticWire'
import { useWebglReady } from './webgl'

const PassportSeal = dynamic(() => import('./PassportSeal'), { ssr: false })

export function PassportSealVisual({ className = '' }: { className?: string }) {
  const reduced = usePrefersReducedMotion()
  const webgl = useWebglReady()
  const live = webgl && !reduced

  return (
    <div
      className={`relative ${className}`}
      aria-hidden="true"
      data-testid="passport-seal"
      data-mode={live ? 'live' : 'static'}
    >
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-out"
        style={{ opacity: live ? 0 : 1 }}
      >
        <StaticWire size={160} radius={0.4} glow={false} />
      </div>
      {live ? (
        <div className="absolute inset-0">
          <PassportSeal />
        </div>
      ) : null}
    </div>
  )
}

export default PassportSealVisual
