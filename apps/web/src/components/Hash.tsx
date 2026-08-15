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

import { useCallback, useEffect, useState } from 'react'

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
}: {
  label: string
  value: string
  href?: string
  hrefLabel?: string
  note?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
      <div className="label pt-0.5">{label}</div>
      <div className="min-w-0">
        <Hash value={value} href={href} hrefLabel={hrefLabel} title={label} />
        {note ? <p className="mt-1 text-xs leading-relaxed text-faint">{note}</p> : null}
      </div>
    </div>
  )
}
