import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Backdrop } from './Backdrop'

/**
 * The backdrop is the one thing on screen that is always running, so the two
 * properties worth proving are the two that would otherwise rot silently:
 *
 *   - under `prefers-reduced-motion: reduce` it still renders, and renders the
 *     SAME composition — the drift stops, the picture does not disappear;
 *   - nothing in it can be reached by a pointer, a keyboard, or a screen reader.
 *
 * jsdom applies no stylesheet (`css: false` in vitest.config.ts), so these
 * assertions deliberately target the markup contract — classes, attributes and
 * focusability — rather than computed style, which would pass vacuously.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')

type Listener = () => void

/**
 * Installs a `matchMedia` whose listeners actually fire, so the preference can
 * be flipped mid-test the way a user flipping it in their OS would.
 */
function stubMatchMedia(reduced: boolean) {
  const listeners = new Set<Listener>()
  let matches = reduced

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      matches: query === REDUCED_MOTION ? matches : false,
      onchange: null,
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
      addListener: (fn: Listener) => listeners.add(fn),
      removeListener: (fn: Listener) => listeners.delete(fn),
      dispatchEvent: vi.fn(),
    }),
  })

  return {
    set(next: boolean) {
      matches = next
      act(() => {
        listeners.forEach((fn) => fn())
      })
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

/** The composition, as a comparable fingerprint: which orb, in which hue. */
function composition() {
  return screen.getAllByTestId('backdrop-orb').map((orb) => ({
    id: orb.getAttribute('data-orb'),
    tone: Array.from(orb.classList).find((c) => c.startsWith('backdrop-orb--')),
  }))
}

function motionClasses() {
  return screen
    .getAllByTestId('backdrop-orb')
    .flatMap((orb) => Array.from(orb.classList).filter((c) => c.startsWith('animate-')))
}

afterEach(() => {
  if (original) Object.defineProperty(window, 'matchMedia', original)
})

describe('<Backdrop>', () => {
  it('renders the drifting composition behind the app when motion is allowed', () => {
    stubMatchMedia(false)
    render(<Backdrop />)

    const field = screen.getByTestId('backdrop')
    // `.backdrop-field` is what pins it to `z-index: -1`, fixed, behind content.
    expect(field).toHaveClass('backdrop-field')
    expect(screen.getAllByTestId('backdrop-orb')).toHaveLength(4)
    expect(screen.getByTestId('backdrop-grid')).toBeInTheDocument()
    expect(field).toHaveAttribute('data-motion', 'drift')

    // Long cycles only — 34s and 44s. Nothing else is permitted to animate here.
    const animations = motionClasses()
    expect(animations).toHaveLength(4)
    animations.forEach((name) => expect(['animate-drift', 'animate-driftalt']).toContain(name))
  })

  it('renders the identical composition, static, under prefers-reduced-motion', () => {
    stubMatchMedia(false)
    const { unmount } = render(<Backdrop />)
    const moving = composition()
    unmount()

    stubMatchMedia(true)
    render(<Backdrop />)

    // The picture survives: same orbs, same hues, same grid. Only drift stops.
    expect(screen.getByTestId('backdrop')).toBeInTheDocument()
    expect(composition()).toEqual(moving)
    expect(screen.getAllByTestId('backdrop-orb')).toHaveLength(4)
    expect(screen.getByTestId('backdrop-grid')).toBeInTheDocument()
    expect(screen.getByTestId('backdrop')).toHaveAttribute('data-motion', 'static')

    // No keyframes attached at all, rather than keyframes we hope CSS overrides.
    expect(motionClasses()).toEqual([])
  })

  it('stops and restarts the drift when the preference changes', () => {
    const media = stubMatchMedia(false)
    render(<Backdrop />)
    expect(screen.getByTestId('backdrop')).toHaveAttribute('data-motion', 'drift')

    media.set(true)
    expect(screen.getByTestId('backdrop')).toHaveAttribute('data-motion', 'static')
    expect(motionClasses()).toEqual([])

    media.set(false)
    expect(screen.getByTestId('backdrop')).toHaveAttribute('data-motion', 'drift')
    expect(motionClasses()).toHaveLength(4)
  })

  it('is inert: no orb is interactive, focusable, or announced', () => {
    stubMatchMedia(false)
    const { container } = render(<Backdrop />)

    const field = screen.getByTestId('backdrop')
    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field).toHaveClass('pointer-events-none')
    expect(field).toHaveClass('select-none')

    // Nothing a pointer or a keyboard can land on, anywhere in the subtree.
    expect(container.querySelectorAll('a, button, input, select, textarea, [href]')).toHaveLength(0)
    expect(container.querySelectorAll('[tabindex], [role], [onclick]')).toHaveLength(0)

    for (const orb of screen.getAllByTestId('backdrop-orb')) {
      expect(orb).not.toHaveAttribute('tabindex')
      expect(orb).not.toHaveAttribute('role')
      expect(orb.tagName).toBe('DIV')
      expect(orb).toBeEmptyDOMElement()
    }
  })

  it('never paints over a printed passport', () => {
    stubMatchMedia(false)
    render(<Backdrop />)
    expect(screen.getByTestId('backdrop')).toHaveClass('no-print')
  })

  it('renders without matchMedia at all, rather than throwing', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
    expect(() => render(<Backdrop />)).not.toThrow()
    expect(screen.getAllByTestId('backdrop-orb')).toHaveLength(4)
  })

  it('detaches its only listener on unmount, leaving nothing running', () => {
    const media = stubMatchMedia(false)
    const { unmount } = render(<Backdrop />)
    expect(media.listenerCount).toBe(1)

    unmount()
    expect(media.listenerCount).toBe(0)
  })
})
