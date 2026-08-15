/**
 * Inline icons. Hand-drawn on a 16-unit grid rather than pulled from a package —
 * a dozen glyphs is not worth a dependency, and these match the 1px hairline
 * weight the rest of the interface uses.
 *
 * Every glyph carries explicit `width`/`height` attributes as well as its
 * utility classes. Classes win when the stylesheet is present; the attributes
 * are what stop a viewBox-only SVG from expanding to fill the viewport if the
 * stylesheet ever fails to load. A demo recording survives a CSS hiccup as an
 * ugly document rather than a page-sized logo.
 */

type IconProps = { className?: string }

const base = 'h-4 w-4 shrink-0'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: '1.2',
  'aria-hidden': true as const,
}

export function CopyIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} className={className}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
      <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
    </svg>
  )
}

export function CheckIcon({ className = base }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 8.5 6.2 11.7 13 5" />
    </svg>
  )
}

export function ExternalIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" className={className}>
      <path d="M6.5 3.5H3.2A1.2 1.2 0 0 0 2 4.7v8.1A1.2 1.2 0 0 0 3.2 14h8.1a1.2 1.2 0 0 0 1.2-1.2V9.5" />
      <path d="M9.5 2.5H14v4.5M14 2.5 7.5 9" />
    </svg>
  )
}

export function ShieldIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinejoin="round" className={className}>
      <path d="M8 1.8 13.2 3.6v4.1c0 3.1-2.1 5.4-5.2 6.5-3.1-1.1-5.2-3.4-5.2-6.5V3.6Z" />
      <path d="m5.7 7.9 1.7 1.7 3-3.4" strokeLinecap="round" />
    </svg>
  )
}

export function ClockIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" className={className}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.4V8l2.5 1.7" />
    </svg>
  )
}

export function AlertIcon({ className = base }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 2.2 14.5 13.4h-13Z" />
      <path d="M8 6.4v3.1M8 11.6h.01" />
    </svg>
  )
}

export function UploadIcon({ className = base }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
      <path d="M8 10.2V2.4M5 5.4 8 2.4l3 3" />
    </svg>
  )
}

export function ArrowIcon({ className = base }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      {...stroke}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

/** Weights the adapter was trained on top of. */
export function ModelIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinejoin="round" className={className}>
      <path d="M8 1.9 14 5 8 8.1 2 5Z" />
      <path d="m2 8 6 3.1L14 8" />
      <path d="m2 11 6 3.1L14 11" />
    </svg>
  )
}

/** The dataset: content-addressed rows in storage. */
export function DatasetIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} className={className}>
      <ellipse cx="8" cy="3.7" rx="5.3" ry="2" />
      <path d="M2.7 3.7v8.6c0 1.1 2.4 2 5.3 2s5.3-.9 5.3-2V3.7" />
      <path d="M2.7 8c0 1.1 2.4 2 5.3 2s5.3-.9 5.3-2" />
    </svg>
  )
}

/** Training configuration: five dials, no more. */
export function SlidersIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" className={className}>
      <path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" />
      <circle cx="5.6" cy="4.4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.8" cy="11.6" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** The trained adapter artifact. */
export function AdapterIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinejoin="round" className={className}>
      <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2" />
      <path d="M6.6 4.2V1.9M9.4 4.2V1.9M6.6 14.1v-2.3M9.4 14.1v-2.3M11.8 6.6h2.3M11.8 9.4h2.3M1.9 6.6h2.3M1.9 9.4h2.3" strokeLinecap="round" />
    </svg>
  )
}

/** The on-chain anchor. */
export function AnchorIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="3.4" r="1.7" />
      <path d="M8 5.1v8.6" />
      <path d="M4.6 6.6h6.8" />
      <path d="M2.4 9.4a5.6 5.6 0 0 0 11.2 0" />
    </svg>
  )
}

/** The TEE enclave. */
export function EnclaveIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinejoin="round" className={className}>
      <rect x="3.4" y="6.6" width="9.2" height="7" rx="1.3" />
      <path d="M5.6 6.6V4.9a2.4 2.4 0 0 1 4.8 0v1.7" />
      <path d="M8 9.4v1.8" strokeLinecap="round" />
    </svg>
  )
}

/** A link in the chain of custody. */
export function ChainIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" className={className}>
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l2-2a2.6 2.6 0 0 0-3.7-3.7l-1.1 1.1" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3l-2 2a2.6 2.6 0 0 0 3.7 3.7l1.1-1.1" />
    </svg>
  )
}

export function SearchIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" className={className}>
      <circle cx="7.1" cy="7.1" r="4.6" />
      <path d="m10.6 10.6 3 3" />
    </svg>
  )
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeWidth="1.4" strokeLinecap="round" className={className}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  )
}

export function TerminalIcon({ className = base }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" {...stroke} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="1.3" />
      <path d="m4.8 6.4 2 1.9-2 1.9M8.6 10.5h3" />
    </svg>
  )
}

export function CrucibleMark({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" className={className} aria-hidden="true">
      {/* A crucible: a vessel, and the thing coming out of it. */}
      <path
        d="M3.5 5.5h13l-1.6 7.2a3.5 3.5 0 0 1-3.4 2.8H8.5a3.5 3.5 0 0 1-3.4-2.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7.6 9.4h4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10 1.6v2.4" stroke="#c8f050" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
