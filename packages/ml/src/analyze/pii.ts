/**
 * PII and secret detection.
 *
 * Two rules govern this file.
 *
 * 1. NEVER echo a full match. A report that helpfully quotes the API key it found
 *    has copied that key into a new file, and in Crucible's case that file may end
 *    up rendered in a UI or pinned to public storage. Everything is redacted at the
 *    point of detection, not at the point of display.
 * 2. Prefer precision where a false positive is expensive. Card-shaped digit runs
 *    are Luhn-checked, because order IDs and timestamps are card-shaped and a
 *    detector that cries wolf gets switched off.
 *
 * Regex-based by design: no network, no model, no dependency.
 */

import type { NormalisedRecord } from './records.js'

export type PIIType =
  | 'email'
  | 'phone'
  | 'credit-card'
  | 'ip-address'
  | 'api-key'
  | 'private-key'

export type PIISeverity = 'low' | 'medium' | 'high'

export interface PIIFinding {
  line: number
  /** Which side of the record the match was on. */
  field: 'input' | 'output' | 'record'
  type: PIIType
  severity: PIISeverity
  /** A REDACTED sample. Never the raw match. */
  sample: string
  /** How many times this same value appeared on this line. */
  occurrences: number
}

/**
 * Redact a matched secret: a couple of leading characters for recognisability,
 * then stars. Short values are fully masked.
 */
export function redact(value: string, keep = 2): string {
  if (value.length <= keep * 2) return '*'.repeat(Math.max(value.length, 4))

  const head = value.slice(0, keep)
  const tail = value.length > 12 ? value.slice(-2) : ''
  const starCount = Math.min(value.length - keep - tail.length, 12)

  return `${head}${'*'.repeat(starCount)}${tail}`
}

/**
 * Luhn checksum, restricted to real card lengths (13–19 digits).
 *
 * Without this, every 16-digit order number in a customer-support dataset gets
 * reported as a leaked card and the whole PII report becomes noise.
 */
export function luhnCheck(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  if (!/^\d{13,19}$/.test(digits)) return false

  let sum = 0
  let double = false

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48

    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    double = !double
  }

  return sum % 10 === 0
}

const IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g

interface Detector {
  type: PIIType
  severity: PIISeverity
  pattern: RegExp
  /** Extra validation beyond the regex. */
  validate?: (match: string) => boolean
}

const DETECTORS: Detector[] = [
  {
    type: 'email',
    severity: 'medium',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    type: 'private-key',
    severity: 'high',
    pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
  },
  {
    // A 64-hex-character value is the shape of an EVM private key — the exact
    // thing a 0G user must never paste into a training file.
    type: 'private-key',
    severity: 'high',
    pattern: /\b0x[a-fA-F0-9]{64}\b/g,
  },
  {
    type: 'api-key',
    severity: 'high',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    type: 'api-key',
    severity: 'high',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    type: 'api-key',
    severity: 'high',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    type: 'api-key',
    severity: 'high',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    type: 'credit-card',
    severity: 'high',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    validate: luhnCheck,
  },
  {
    type: 'ip-address',
    severity: 'low',
    pattern: IPV4,
  },
  {
    // Requires a separator or a leading +, so bare years and small integers do
    // not match. Deliberately conservative.
    type: 'phone',
    severity: 'medium',
    pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{2,4}[\s.-]\d{2,4}\b/g,
  },
]

/** Scan one string, returning redacted findings keyed by (type, value). */
function scanText(
  text: string,
  line: number,
  field: PIIFinding['field'],
): Map<string, PIIFinding> {
  const findings = new Map<string, PIIFinding>()
  if (text === '') return findings

  for (const detector of DETECTORS) {
    // Fresh regex per scan: /g lastIndex is stateful and would skip matches.
    const pattern = new RegExp(detector.pattern.source, detector.pattern.flags)
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0]
      if (detector.validate !== undefined && !detector.validate(value)) continue

      const key = `${detector.type}:${value}`
      const existing = findings.get(key)

      if (existing !== undefined) {
        existing.occurrences += 1
        continue
      }

      findings.set(key, {
        line,
        field,
        type: detector.type,
        severity: detector.severity,
        sample: redact(value),
        occurrences: 1,
      })
    }
  }

  return findings
}

/**
 * Scan a dataset for PII and secrets.
 *
 * A value found on both sides of a record is reported once, attributed to the
 * answer side, because that is where a leak becomes something the model learns
 * to emit.
 */
export function detectPII(records: readonly NormalisedRecord[]): PIIFinding[] {
  const all: PIIFinding[] = []

  for (const record of records) {
    const merged = new Map<string, PIIFinding>()

    const sides: Array<[string, PIIFinding['field']]> =
      record.input === '' && record.output === ''
        ? [[record.full, 'record']]
        : [
            [record.input, 'input'],
            [record.output, 'output'],
          ]

    for (const [text, field] of sides) {
      for (const [key, finding] of scanText(text, record.line, field)) {
        const existing = merged.get(key)
        if (existing === undefined) {
          merged.set(key, finding)
        } else {
          existing.occurrences += finding.occurrences
          // The answer side is the more dangerous placement — prefer it.
          if (field === 'output') existing.field = 'output'
        }
      }
    }

    all.push(...merged.values())
  }

  const severityRank: Record<PIISeverity, number> = { high: 0, medium: 1, low: 2 }

  return all.sort(
    (a, b) =>
      a.line - b.line ||
      severityRank[a.severity] - severityRank[b.severity] ||
      a.type.localeCompare(b.type),
  )
}

/** Roll findings up into per-type counts, for the report summary. */
export function summarisePII(findings: readonly PIIFinding[]): {
  total: number
  byType: Record<string, number>
  highSeverityCount: number
  affectedLines: number[]
} {
  const byType: Record<string, number> = {}
  let highSeverityCount = 0

  for (const finding of findings) {
    byType[finding.type] = (byType[finding.type] ?? 0) + 1
    if (finding.severity === 'high') highSeverityCount += 1
  }

  return {
    total: findings.length,
    byType,
    highSeverityCount,
    affectedLines: [...new Set(findings.map((f) => f.line))].sort((a, b) => a - b),
  }
}
