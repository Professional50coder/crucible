'use client'

/**
 * The single most-used component in the app.
 *
 * A 66-character hex string is the atom of everything Crucible claims, and it
 * has three jobs on screen: be readable, be copyable, and be checkable. So every
 * hash renders middle-truncated in monospace, carries a copy button, and — where
 * a verification target exists — links out to the explorer that proves it.
 *
 * Middle truncation, not tail truncation: you compare hashes by their ends.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { truncateHash } from '@/lib/format'
import { CheckIcon, CopyIcon, ExternalIcon } from './icons'

export interface HashProps {
  value: string
  /** Verification target. Renders an external link when present. */
  href?: string
  /** Host or explorer name, shown next to the link. */
  hrefLabel?: string
  head?: number
  tail?: number
  /** Render the whole value, wrapped, instead of truncating. */
  full?: boolean
  className?: string
  /** Accessible description, e.g. "dataset root hash". */
  title?: string
  tone?: 'default' | 'muted' | 'accent'
}

const toneClass: Record<NonNullable<HashProps['tone']>, string> = {
  default: 'text-fg',
  muted: 'text-dim',
  accent: 'text-phosphor',
}

export function Hash({
  value,
  href,
  hrefLabel,
  head = 8,
  tail = 6,
  full = false,
  className = '',
  title,
  tone = 'default',
}: HashProps) {
  const display = full ? value : truncateHash(value, head, tail)

  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}>
      <span
        className={`font-mono text-[13px] leading-5 ${toneClass[tone]} ${
          full ? 'break-hash' : 'truncate'
        }`}
        title={title ? `${title}: ${value}` : value}
        data-testid="hash-value"
      >
        {display}
      </span>

      <CopyButton value={value} label={title ?? 'value'} />

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-faint no-underline transition-colors hover:text-phosphor"
          aria-label={`Verify ${title ?? 'value'} on ${hrefLabel ?? 'the explorer'}`}
          title={`Verify on ${hrefLabel ?? 'the explorer'}`}
        >
          <ExternalIcon className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </span>
  )
}

export function CopyButton({ value, label = 'value' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard permission denied or unavailable (insecure context). The value
      // is still selectable by hand, so there is nothing useful to say here.
    }
  }, [value])

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center rounded px-1 py-0.5 text-faint transition-colors hover:text-fg"
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-ok" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

/**
 * A labelled hash row — the repeating unit of the passport's lineage table.
 */
export function HashRow({
  label,
  value,
  href,
  hrefLabel,
  note,
  full = false,
}: {
  label: string
  value: string
  href?: string
  hrefLabel?: string
  note?: string
  /** Print the whole value. On a certificate the complete hash *is* the content. */
  full?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
      <div className="label pt-0.5">{label}</div>
      <div className="min-w-0">
        <Hash value={value} href={href} hrefLabel={hrefLabel} title={label} full={full} />
        {note ? <p className="mt-1 text-xs leading-relaxed text-faint">{note}</p> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typed field rows
// ---------------------------------------------------------------------------

/**
 * The ABI types a passport's fields decode to.
 *
 * Reimplemented from the *idea* in the Ethereum Attestation Service's
 * single-attestation view (easscan.org), which prints decoded schema data as a
 * type-and-name cell beside its value. Nothing was copied; the win borrowed is
 * that naming the type turns a column of hashes into a readable record format.
 */
export type FieldType = 'bytes32' | 'address' | 'string' | 'uint256' | 'uint8' | 'bool'

/**
 * Two chip styles, and the distinction is meaningful rather than decorative.
 *
 * `bytes32` and `address` are *references*: values that point at something a
 * stranger can go and check. They get the informational tint the rest of the app
 * already uses for "here is where to look". Everything else is plain data and
 * stays grey. The state palette — ok / warn / danger — is never spent on a type
 * chip, because on this page those three colours mean verified, at-risk and
 * lost, and nothing else.
 */
const REFERENCE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(['bytes32', 'address'])

/**
 * One decoded field: a recessed left cell carrying `BYTES32 · datasetRootHash`,
 * the value on the right.
 */
export function TypedRow({
  type,
  name,
  value,
  href,
  hrefLabel,
  note,
  tone = 'default',
  hash = false,
  unverifiable = false,
}: {
  type: FieldType
  /** The field's name in the manifest, dotted where it is nested. */
  name: string
  value: string
  href?: string
  hrefLabel?: string
  note?: string
  tone?: 'default' | 'ok' | 'warn' | 'danger'
  /** Render through <Hash>: full value, copy button, optional verification link. */
  hash?: boolean
  /** A real value with no reachable proof. Says so rather than linking nowhere. */
  unverifiable?: boolean
}) {
  const reference = REFERENCE_TYPES.has(type)

  const valueTone = {
    default: 'text-fg',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[16.5rem_minmax(0,1fr)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-sub px-3 py-2.5 sm:border-b-0 sm:border-r sm:px-4 sm:py-3">
        <span
          className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-px font-mono text-[10px] uppercase tracking-widest2 ${
            reference
              ? 'border-info/25 bg-info/[0.06] text-info/80'
              : 'border-line-bright bg-ink text-faint'
          }`}
        >
          {type}
        </span>
        <span className="min-w-0 break-words font-mono text-xs text-dim">{name}</span>
      </div>

      <div className="min-w-0 px-3 py-2.5 sm:px-4 sm:py-3">
        {hash ? (
          <Hash value={value} href={href} hrefLabel={hrefLabel} title={name} full />
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 break-hash font-mono text-[13px] leading-5 no-underline hover:text-phosphor ${valueTone}`}
          >
            {value}
            <ExternalIcon className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <span className={`break-hash font-mono text-[13px] leading-5 ${valueTone}`}>{value}</span>
        )}

        {unverifiable ? (
          <p className="mt-1 font-mono text-2xs text-faint">
            demo value — nothing to open at this hash
          </p>
        ) : null}

        {note ? (
          <p className="mt-1.5 text-xs leading-relaxed text-faint text-pretty">{note}</p>
        ) : null}
      </div>
    </div>
  )
}

/** The container that gives a run of {@link TypedRow}s its hairline grid. */
export function TypedRows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>
}
