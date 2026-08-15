/**
 * Display helpers. The hash truncation rule matters more than it looks: a 66
 * character hex string will blow out any mobile layout, and truncating the tail
 * only (`0xb4f76a88…`) destroys the one property that makes a hash skimmable —
 * you compare the *ends*. So we always truncate the middle and keep both.
 */

/** 1 0G = 1e18 neuron. Derived and confirmed in docs/FIELD_NOTES.md. */
export const NEURON_PER_OG = 10n ** 18n

/**
 * Truncate the middle of a long identifier, keeping `head` leading characters
 * (after any `0x`) and `tail` trailing ones.
 *
 * Strings short enough to render whole are returned untouched, so a truncation
 * never makes a value *longer* than the original.
 */
export function truncateHash(value: string, head = 8, tail = 6): string {
  if (!value) return ''

  const prefix = value.startsWith('0x') ? '0x' : ''
  const body = value.slice(prefix.length)

  // Nothing is gained by replacing 1 character with a 1-character ellipsis.
  if (body.length <= head + tail + 1) return value

  return `${prefix}${body.slice(0, head)}…${body.slice(-tail)}`
}

/** Exact decimal rendering of a neuron amount in 0G, with no trailing zeros. */
export function formatOg(neuron: bigint | string): string {
  const value = typeof neuron === 'bigint' ? neuron : BigInt(neuron)
  const negative = value < 0n
  const abs = negative ? -value : value

  const whole = abs / NEURON_PER_OG
  const fraction = abs % NEURON_PER_OG
  const sign = negative ? '-' : ''

  if (fraction === 0n) return `${sign}${whole}`

  const padded = fraction.toString().padStart(18, '0').replace(/0+$/, '')
  return `${sign}${whole}.${padded}`
}

/** Binary units — LoRA adapters are quoted in MB by 0G's own docs. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)} ${units[unit]}`
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

/**
 * A duration as `47h 12m 03s`. Hours are not wrapped into days: the 48-hour
 * acknowledgement window is *stated* in hours, so showing "1d 23h" would force
 * the reader to do arithmetic to check it against the rule.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'

  const clamped = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60
  const pad = (n: number) => n.toString().padStart(2, '0')

  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}

/** Compact elapsed-time form for durations we are not counting down. */
export function formatElapsed(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`

  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toISOString().slice(0, 10)
}

/** "3 hours ago" — for lists, where absolute timestamps are noise. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(deltaSeconds)

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ]

  let value = deltaSeconds
  for (const [unit, size] of units) {
    if (Math.abs(value) < size || unit === 'year') {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        Math.round(value),
        unit,
      )
    }
    value /= size
  }

  return `${abs}s`
}

/** `0.0002` must never render as `2e-4` — 0G rejects exponent notation. */
export function formatLearningRate(lr: number): string {
  if (!Number.isFinite(lr)) return '—'
  return lr.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}
