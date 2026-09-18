import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StaticWire } from './StaticWire'
import { ICO_EDGES, ICO_VERTICES } from './geometry'

/**
 * The static wireframe is the source of truth for the 3D layer's composition —
 * it is what renders on the server, without WebGL, and under reduced motion. Two
 * things must hold: it draws the actual icosahedron (so the fallback is the same
 * object, not a decorative stand-in), and it is inert.
 */

describe('icosahedron geometry', () => {
  it('is the twelve vertices and thirty edges of a real icosahedron', () => {
    expect(ICO_VERTICES).toHaveLength(12)
    expect(ICO_EDGES).toHaveLength(30)
  })

  it('references only real vertices in its edges', () => {
    for (const [a, b] of ICO_EDGES) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(12)
      expect(a).not.toBe(b)
    }
  })
})

describe('<StaticWire>', () => {
  it('draws one line per edge and one node per vertex', () => {
    const { container } = render(<StaticWire size={200} />)
    expect(container.querySelectorAll('line')).toHaveLength(ICO_EDGES.length)
    // 12 vertex nodes + the halo circle + the construction ring.
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(ICO_VERTICES.length)
  })

  it('is inert: presentational, hidden from the accessibility tree', () => {
    const { container } = render(<StaticWire size={200} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('role', 'presentation')
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(0)
  })

  it('omits the halo when glow is off, for the small passport seal', () => {
    const { container } = render(<StaticWire size={160} glow={false} />)
    // Without the halo there is no gradient def and no halo fill circle, so the
    // only circles are the vertex nodes plus the construction ring.
    expect(container.querySelector('radialGradient')).toBeNull()
  })
})
