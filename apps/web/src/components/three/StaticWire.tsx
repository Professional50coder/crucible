/**
 * The static composition behind the 3D layer.
 *
 * This is what renders on the server, before hydration, on a machine with no
 * WebGL, and — most importantly — the moment `prefers-reduced-motion` is set. It
 * is not a placeholder: it is the same icosahedron the WebGL scene animates,
 * frozen mid-rotation and drawn as hairline SVG in the house palette, so the
 * reduced-motion experience is the identical picture with the drift removed
 * rather than a different, lesser one.
 *
 * Depth is honoured — edges and nodes further from the camera fade — so the
 * still already reads as a solid rather than a flat wire tangle.
 */

import { ICO_EDGES, projectIcosahedron } from './geometry'

const PHOSPHOR = '#c8f050'
const LINE = '#383a38'
const NODE = '#82847e'

export function StaticWire({
  size = 320,
  radius = 0.4,
  className = '',
  glow = true,
}: {
  size?: number
  radius?: number
  className?: string
  /** The faint phosphor halo behind the object. Off for the small passport seal. */
  glow?: boolean
}) {
  const points = projectIcosahedron(size, 0.62, 0.9, radius)

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      className={className}
      aria-hidden="true"
      role="presentation"
      preserveAspectRatio="xMidYMid meet"
    >
      {glow ? (
        <defs>
          <radialGradient id="wire-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={PHOSPHOR} stopOpacity="0.14" />
            <stop offset="55%" stopColor={PHOSPHOR} stopOpacity="0.04" />
            <stop offset="100%" stopColor={PHOSPHOR} stopOpacity="0" />
          </radialGradient>
        </defs>
      ) : null}

      {glow ? <circle cx={size / 2} cy={size / 2} r={size * radius * 1.25} fill="url(#wire-halo)" /> : null}

      {/* A faint construction ring, the same drawing register as the page guides. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size * radius * 1.18}
        fill="none"
        stroke={LINE}
        strokeWidth={1}
        strokeDasharray="2 6"
        opacity={0.5}
      />

      {ICO_EDGES.map(([a, b], i) => {
        const p = points[a]!
        const q = points[b]!
        const depth = (p.z + q.z) / 2 // -1 (far) .. 1 (near)
        const near = depth > 0
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={near ? PHOSPHOR : LINE}
            strokeWidth={near ? 1.1 : 0.9}
            opacity={0.3 + (depth + 1) * 0.32}
            strokeLinecap="round"
          />
        )
      })}

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.z > 0.2 ? 2.4 : 1.6}
          fill={p.z > 0.2 ? PHOSPHOR : NODE}
          opacity={0.35 + (p.z + 1) * 0.3}
        />
      ))}
    </svg>
  )
}

export default StaticWire
