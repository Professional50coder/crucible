import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HeroVisual } from './HeroVisual'
import { PassportSealVisual } from './PassportSealVisual'

/**
 * The two 3D wrappers share one contract, and it is the contract that keeps SSR,
 * headless CI, no-WebGL machines and reduced-motion readers all working: until
 * WebGL is confirmed present (it never is in jsdom, exactly as on a server or a
 * headless box), they render the static SVG composition and never mount a
 * `<Canvas>`. That is what proves the passport still server-renders its real
 * on-chain values without waiting on — or crashing on — the 3D engine.
 */

describe('<HeroVisual>', () => {
  it('falls back to the static wireframe when WebGL is unavailable', () => {
    const { container } = render(<HeroVisual />)
    const root = screen.getByTestId('hero-visual')
    expect(root).toHaveAttribute('data-mode', 'static')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    // The static SVG is present; no WebGL canvas was ever created.
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('<PassportSealVisual>', () => {
  it('renders the static seal, never a canvas, in a non-WebGL environment', () => {
    const { container } = render(<PassportSealVisual />)
    const root = screen.getByTestId('passport-seal')
    expect(root).toHaveAttribute('data-mode', 'static')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('canvas')).toBeNull()
  })
})
