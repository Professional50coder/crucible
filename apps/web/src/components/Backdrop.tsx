'use client'

/**
 * The motion register.
 *
 * A continuous, slow, volumetric render that sits behind the entire application:
 * four blurred radial orbs drifting on 34s and 44s cycles, over a masked hairline
 * grid. Mounted once, in the root layout, so every route carries it.
 *
 * Four rules govern it, and none of them are negotiable:
 *
 *   1. It renders BEHIND content, never under a hash. `.backdrop-field` is fixed
 *      at `z-index: -1`; every surface carrying a hash, an address or a number
 *      sits on an opaque `.surface` panel above it.
 *   2. It is inert. `pointer-events: none`, `aria-hidden`, `user-select: none`,
 *      no focusable descendant. It cannot be tabbed to, clicked, or read out.
 *   3. It costs nothing measurable. Composited `transform` and `opacity` only —
 *      no canvas, no WebGL, no `requestAnimationFrame`, no scroll or resize
 *      listener, no layout read. The browser's compositor owns every frame.
 *   4. Under `prefers-reduced-motion: reduce` the composition is IDENTICAL and
 *      static. Same orbs, same colours, same positions, same grid; the drift
 *      simply stops.
 *
 * Rule 4 is enforced twice on purpose. The CSS layer (`globals.css`) sets
 * `animation: none !important` inside the media query, which is correct before
 * hydration and with JavaScript disabled entirely. The JS layer below omits the
 * animation utilities altogether, so the keyframes are never even attached. Two
 * independent layers, because a backdrop that ignores the setting is the kind of
 * defect nobody files and everybody feels.
 *
 * It also carries `no-print`: a passport is a certificate, certificates get
 * printed, and a fixed dark plate would otherwise paint over the entire page.
 */

import { useSyncExternalStore, type CSSProperties } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Module scope keeps the reference stable, so React never resubscribes. */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }

  const query = window.matchMedia(REDUCED_MOTION)

  // Safari shipped `addEventListener` on MediaQueryList only in 14; the
  // deprecated `addListener` is the fallback, not the primary path.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onStoreChange)
    return () => query.removeEventListener('change', onStoreChange)
  }
  if (typeof query.addListener === 'function') {
    query.addListener(onStoreChange)
    return () => query.removeListener(onStoreChange)
  }
  return () => {}
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION).matches
}

/**
 * The server cannot know the preference, so it renders the animated markup and
 * the CSS media query suppresses it. `useSyncExternalStore` uses this snapshot
 * during hydration and reconciles afterwards, which is why this does not produce
 * a hydration mismatch.
 */
function getServerSnapshot(): boolean {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

interface Orb {
  /** Stable key, and the value asserted in the test. */
  id: string
  /** Which of the three permitted hues this orb carries. */
  tone: 'phosphor' | 'deep' | 'warm'
  /** `animate-drift` (34s) or `animate-driftalt` (44s). */
  motion: string
  style: CSSProperties
}

/**
 * Sizes are in `vmax` so the composition holds its proportions from a 360px
 * phone to a 2560px display without a breakpoint. The negative
 * `animationDelay`s start each orb part-way through its cycle: without them all
 * four would swell and settle in unison, which reads as a pulse rather than as
 * drift.
 */
const ORBS: readonly Orb[] = [
  {
    id: 'phosphor-lead',
    tone: 'phosphor',
    motion: 'animate-drift',
    style: { top: '-16%', left: '-10%', width: '64vmax', height: '64vmax' },
  },
  {
    id: 'deep-field',
    tone: 'deep',
    motion: 'animate-driftalt',
    style: { top: '-26%', right: '-18%', width: '72vmax', height: '72vmax', animationDelay: '-7s' },
  },
  {
    id: 'warm-low',
    tone: 'warm',
    motion: 'animate-drift',
    style: {
      bottom: '-32%',
      left: '18%',
      width: '58vmax',
      height: '58vmax',
      animationDelay: '-13s',
    },
  },
  {
    id: 'phosphor-trail',
    tone: 'phosphor',
    motion: 'animate-driftalt',
    style: {
      bottom: '-24%',
      right: '4%',
      width: '38vmax',
      height: '38vmax',
      animationDelay: '-21s',
      opacity: 0.3,
    },
  },
]

const TONE_CLASS: Record<Orb['tone'], string> = {
  phosphor: 'backdrop-orb--phosphor',
  deep: 'backdrop-orb--deep',
  warm: 'backdrop-orb--warm',
}

/**
 * A vignette that pulls the render away from the reading column. The orbs are
 * generous at the edges and restrained behind the centre, where the type lives —
 * this is the layer that guarantees it, independently of where an orb happens to
 * be in its cycle.
 */
const VIGNETTE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse 88% 66% at 50% 4%, rgba(19,20,20,0) 38%, rgba(19,20,20,0.68) 100%)',
}

export function Backdrop() {
  const reduced = usePrefersReducedMotion()

  return (
    <div
      className="backdrop-field no-print pointer-events-none select-none"
      aria-hidden="true"
      data-testid="backdrop"
      data-motion={reduced ? 'static' : 'drift'}
    >
      {ORBS.map((orb) => (
        <div
          key={orb.id}
          data-testid="backdrop-orb"
          data-orb={orb.id}
          className={`backdrop-orb ${TONE_CLASS[orb.tone]}${reduced ? '' : ` ${orb.motion}`}`}
          style={orb.style}
        />
      ))}

      {/* Drawn over the orbs, so the render reads as light behind engineering
          paper rather than as a gradient with a grid pasted on top. */}
      <div className="backdrop-grid" data-testid="backdrop-grid" />

      <div style={VIGNETTE} data-testid="backdrop-vignette" />
    </div>
  )
}

export default Backdrop
