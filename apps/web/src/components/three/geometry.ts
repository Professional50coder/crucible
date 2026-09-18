/**
 * The one shape this app forges in 3D — an icosahedron — expressed once, as pure
 * data, so the animated WebGL scene and the static SVG fallback draw the *same*
 * object. That is what makes the reduced-motion and no-WebGL fallbacks an
 * "identical composition" rather than a different picture that merely stands in.
 *
 * No three.js here on purpose: this module is imported by the static fallback,
 * which must stay in the main bundle and must never pull the 3D engine with it.
 */

const PHI = (1 + Math.sqrt(5)) / 2

/** The twelve icosahedron vertices, normalised to the unit sphere. */
export const ICO_VERTICES: readonly [number, number, number][] = (() => {
  const raw: [number, number, number][] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ]
  const len = Math.hypot(1, PHI)
  return raw.map(([x, y, z]) => [x / len, y / len, z / len])
})()

/** The thirty edges, as index pairs — every pair of vertices one edge-length apart. */
export const ICO_EDGES: readonly [number, number][] = (() => {
  const edges: [number, number][] = []
  const verts = ICO_VERTICES
  // On the unit icosahedron the squared edge length is a fixed constant; a small
  // epsilon absorbs floating-point noise so exactly the thirty real edges match.
  const target = squaredDistance(verts[0]!, verts[1]!) // any true edge
  for (let i = 0; i < verts.length; i += 1) {
    for (let j = i + 1; j < verts.length; j += 1) {
      if (Math.abs(squaredDistance(verts[i]!, verts[j]!) - target) < 1e-6) {
        edges.push([i, j])
      }
    }
  }
  return edges
})()

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  const dx = a[0]! - b[0]!
  const dy = a[1]! - b[1]!
  const dz = a[2]! - b[2]!
  return dx * dx + dy * dy + dz * dz
}

export interface Projected {
  x: number
  y: number
  /** Camera-space depth in [-1, 1]; higher is nearer, used to fade back edges. */
  z: number
}

/**
 * Rotate the vertices by fixed Euler angles and project them orthographically
 * into a `size`×`size` box. Deterministic: the fallback is a single, composed
 * still of the object mid-rotation, not a random frame.
 */
export function projectIcosahedron(
  size: number,
  rotX = 0.5,
  rotY = 0.7,
  radius = 0.4,
): Projected[] {
  const cx = Math.cos(rotX)
  const sx = Math.sin(rotX)
  const cy = Math.cos(rotY)
  const sy = Math.sin(rotY)
  const scale = size * radius
  const centre = size / 2

  return ICO_VERTICES.map(([x, y, z]) => {
    // rotate around X, then Y
    const y1 = y * cx - z * sx
    const z1 = y * sx + z * cx
    const x2 = x * cy + z1 * sy
    const z2 = -x * sy + z1 * cy
    return {
      x: centre + x2 * scale,
      y: centre - y1 * scale,
      z: z2,
    }
  })
}
