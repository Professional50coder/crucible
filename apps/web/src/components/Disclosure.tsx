'use client'

/**
 * A section a reader can choose the depth of.
 *
 * The passport carries about forty facts and every one of them is load-bearing
 * for a verification claim, so none of them may be deleted. What can change is
 * how many of them a reader is asked to hold at once. Three rules make that
 * trade honest rather than merely tidier:
 *
 * 1. **The closed state still teaches.** A summary states what is inside *and*
 *    its verdict — "Decoded manifest — 16 fields, all consistent" — so a reader
 *    who never opens it has still learned the finding. A section that hides a
 *    negative finding behind a neutral label is worse than one left open.
 * 2. **It is a real `<details>`.** Native disclosure works with JavaScript
 *    disabled, is a real button for the keyboard, prints open, and stays
 *    findable by the browser's own in-page search. framer-motion animates the
 *    *content*, never the element, precisely so none of that is given up.
 * 3. **It remembers.** Open state persists per section id in `sessionStorage`,
 *    so a reader who expands everything, follows a link to an explorer and
 *    comes back does not land on a page that has forgotten where they were.
 *
 * The no-JS guarantee is what shapes the render: before hydration the body is a
 * plain `<div>` with no inline styles, so a natively-opened `<details>` shows
 * it. Only after mount does the body become a `motion.div` whose height and
 * opacity are animated — and it mounts with `initial={false}`, so restoring a
 * remembered section snaps rather than performing.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'

import { IconTile } from './ui'

export type DisclosureTone = 'default' | 'ok' | 'warn' | 'danger'

/** 160ms — inside the 120–180ms band everything else on the page moves in. */
export const DISCLOSURE_MS = 160

/** The app's ease-out curve. Fast to start, settles rather than stops. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const

const STORAGE_PREFIX = 'crucible:disclosure:'

/** Exported so a test can seed or assert the remembered state directly. */
export function disclosureStorageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`
}

function readStored(id: string): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(disclosureStorageKey(id))
    if (raw === 'open') return true
    if (raw === 'closed') return false
    return null
  } catch {
    // Private-mode Safari and locked-down embeds throw on access. A section
    // that cannot remember is a smaller failure than one that cannot render.
    return null
  }
}

function writeStored(id: string, open: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(disclosureStorageKey(id), open ? 'open' : 'closed')
  } catch {
    /* see readStored */
  }
}

const verdictTone: Record<DisclosureTone, string> = {
  default: 'text-faint',
  ok: 'text-ok/90',
  warn: 'text-warn',
  danger: 'text-danger',
}

const shellTone: Record<DisclosureTone, string> = {
  default: 'border-line bg-panel hover:border-line-bright',
  ok: 'border-line bg-panel hover:border-line-bright',
  warn: 'border-warn/30 bg-panel hover:border-warn/50',
  danger: 'border-danger/35 bg-panel hover:border-danger/55',
}

function mediaPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function Disclosure({
  id,
  title,
  verdict,
  tone = 'default',
  icon,
  defaultOpen = false,
  className = '',
  children,
}: {
  /** Stable across renders and unique on the page: the sessionStorage key. */
  id: string
  /** What is inside. */
  title: ReactNode
  /** Its finding. Required — a summary without one teaches nothing closed. */
  verdict: ReactNode
  tone?: DisclosureTone
  icon?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  /**
   * `useReducedMotion` is the primary source; the media query is read directly
   * as well because the preference must resolve the animation *instantly*, and
   * a stale hook value would leave a reader who asked for no motion waiting out
   * a 160ms collapse.
   */
  const hookReduced = useReducedMotion()
  const [mediaReduced, setMediaReduced] = useState(false)
  const reduced = hookReduced === true || mediaReduced

  const [open, setOpen] = useState(defaultOpen)
  /** True while the body animates shut; the element stays open until it lands. */
  const [closing, setClosing] = useState(false)
  /** False until mount, which is what keeps the no-JS render style-free. */
  const [enhanced, setEnhanced] = useState(false)

  const hydrated = useRef(false)

  useEffect(() => {
    const stored = readStored(id)
    if (stored !== null) setOpen(stored)
    hydrated.current = true
    setEnhanced(true)
    setMediaReduced(mediaPrefersReducedMotion())
  }, [id])

  useEffect(() => {
    if (!hydrated.current) return
    writeStored(id, open)
  }, [id, open])

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => setClosing(false), reduced ? 0 : DISCLOSURE_MS)
    return () => clearTimeout(timer)
  }, [closing, reduced])

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (was) setClosing(true)
      else setClosing(false)
      return !was
    })
  }, [])

  /**
   * With JavaScript disabled this handler never runs and `<details>` toggles
   * itself, which is the entire reason the element is native. With it running,
   * the default is prevented so React owns `open` and the body can finish
   * animating shut before the element hides it.
   */
  const onSummaryClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      toggle()
    },
    [toggle],
  )

  const domOpen = open || closing

  const body = <div className="border-t border-inherit">{children}</div>

  return (
    <details
      open={domOpen}
      data-disclosure={id}
      data-open={open ? 'true' : 'false'}
      className={`group overflow-hidden rounded-lg border shadow-panel transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:shadow-panel-lg ${shellTone[tone]} ${className}`}
    >
      <summary
        onClick={onSummaryClick}
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-1 focus-visible:ring-phosphor sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ? <IconTile size="sm">{icon}</IconTile> : null}
          <span className="min-w-0 text-pretty">
            <span className="label text-dim">{title}</span>{' '}
            <span className={`font-mono text-2xs ${verdictTone[tone]}`}>— {verdict}</span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {/* The affordance reveals itself on hover and on keyboard focus
              rather than shouting at every reader all of the time. */}
          <span className="font-mono text-2xs text-faint opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100">
            {open ? 'hide' : 'show'}
          </span>
          <Chevron open={open} />
        </span>
      </summary>

      {enhanced ? (
        <motion.div
          initial={false}
          animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduced ? 0 : DISCLOSURE_MS / 1000, ease: EASE_OUT }}
          style={{ overflow: 'hidden' }}
        >
          {body}
        </motion.div>
      ) : (
        body
      )}
    </details>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3.5 w-3.5 text-faint transition-transform duration-150 ease-out ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
