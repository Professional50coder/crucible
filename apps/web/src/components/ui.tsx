'use client'

/**
 * Shared presentation primitives: panels, labels, badges, structural texture,
 * and the three states every data-driven screen owes the viewer — loading,
 * empty, and error.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

import { AlertIcon } from './icons'
import type { Network, TaskState } from '@/lib/types'

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/**
 * The dashed guide lines that mark the content column edges, drawn behind
 * everything. They are the drawing's construction lines: the page is built to a
 * measured column, and the lines say so. Desktop only — at phone widths the
 * column edge *is* the screen edge, so the lines would be noise.
 */
export function ColumnGuides() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 hidden select-none lg:block" aria-hidden="true">
      <div className="mx-auto h-full max-w-6xl px-4 sm:px-6">
        <div className="h-full border-x border-dashed border-line-bright/45" />
      </div>
    </div>
  )
}

/**
 * A hatched band. Marks the seam between major sections the way hatching marks
 * a cut on an engineering drawing: this is an edge, not an empty gap.
 */
export function HatchBand({
  className = '',
  accent = false,
  height = 'h-10',
}: {
  className?: string
  accent?: boolean
  height?: string
}) {
  return (
    <div
      className={`${height} border-y border-line ${accent ? 'hatch-accent' : 'hatch'} ${className}`}
      aria-hidden="true"
    />
  )
}

/** A small square icon tile. The left-hand anchor of a card or a chain link. */
export function IconTile({
  children,
  tone = 'default',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
  size?: 'sm' | 'md'
  className?: string
}) {
  const tones = {
    default: 'border-line bg-sub text-dim',
    accent: 'border-phosphor/35 bg-phosphor/[0.07] text-phosphor',
    ok: 'border-ok/30 bg-ok/[0.07] text-ok',
    warn: 'border-warn/30 bg-warn/[0.07] text-warn',
    danger: 'border-danger/30 bg-danger/[0.07] text-danger',
  }[tone]

  const sizes = size === 'sm' ? 'h-7 w-7 rounded' : 'h-9 w-9 rounded-md'

  return (
    <span
      className={`grid shrink-0 place-items-center border ${sizes} ${tones} ${className}`}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/** A page-level section heading with the eyebrow the rest of the app uses. */
export function SectionHead({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string
  title: ReactNode
  children?: ReactNode
  id?: string
}) {
  return (
    <div className="max-w-2xl">
      <p className="label">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-title font-medium text-fg text-balance">
        {title}
      </h2>
      {children ? (
        <div className="mt-4 measure text-sm leading-relaxed text-dim text-pretty">{children}</div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/**
 * The one hover gesture the app uses on a surface: the panel lifts by a single
 * pixel and its hairline brightens, in 150ms of ease-out. Nothing pulses,
 * nothing loops, and nothing moves on a value that is not changing — the motion
 * is a response to the pointer and ends the moment the pointer leaves.
 */
export const HOVER_LIFT =
  'transition-[border-color,box-shadow,transform] duration-150 ease-out ' +
  'hover:-translate-y-px hover:border-line-bright hover:shadow-panel-lg'

export function Panel({
  children,
  className = '',
  hover = false,
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  /** Lift on hover. For panels a reader is meant to treat as one object. */
  hover?: boolean
  as?: 'div' | 'section' | 'article'
}) {
  return (
    <As className={`panel rounded-lg ${hover ? HOVER_LIFT : ''} ${className}`}>{children}</As>
  )
}

export function PanelHeader({
  title,
  aside,
  icon,
  className = '',
}: {
  title: ReactNode
  aside?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <IconTile size="sm">{icon}</IconTile>
        ) : null}
        <h2 className="label text-dim">{title}</h2>
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
  )
}

/** A labelled scalar. The workhorse of the passport and job pages. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
}) {
  const toneClass = {
    default: 'text-fg',
    accent: 'text-phosphor',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone]

  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`mt-1 font-mono text-sm leading-6 ${toneClass} break-hash`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-faint">{hint}</div> : null}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' | 'info'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-line text-dim',
  ok: 'border-ok/35 text-ok',
  warn: 'border-warn/40 text-warn',
  danger: 'border-danger/40 text-danger',
  accent: 'border-phosphor/40 text-phosphor',
  info: 'border-info/35 text-info',
}

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-widest2 ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral', pulse = false }: { tone?: BadgeTone; pulse?: boolean }) {
  const colours: Record<BadgeTone, string> = {
    neutral: 'bg-faint',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
    accent: 'bg-phosphor',
    info: 'bg-info',
  }

  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${colours[tone]} ${
        pulse ? 'animate-pulseline' : ''
      }`}
      aria-hidden="true"
    />
  )
}

export function NetworkBadge({ network }: { network: Network }) {
  return (
    <Badge tone={network === 'mainnet' ? 'accent' : 'info'}>
      <Dot tone={network === 'mainnet' ? 'accent' : 'info'} />
      {network === 'mainnet' ? '0G mainnet' : '0G Galileo'}
    </Badge>
  )
}

const stateTone: Record<TaskState, BadgeTone> = {
  Init: 'neutral',
  SettingUp: 'info',
  SetUp: 'info',
  Training: 'accent',
  Trained: 'accent',
  Delivering: 'info',
  Delivered: 'warn',
  UserAcknowledged: 'ok',
  Finished: 'ok',
  Failed: 'danger',
}

export function StateBadge({ state, queued = false }: { state: TaskState; queued?: boolean }) {
  if (queued) {
    return (
      <Badge tone="neutral">
        <Dot tone="neutral" pulse />
        Queued
      </Badge>
    )
  }

  const tone = stateTone[state]
  const active = !['Finished', 'Failed'].includes(state)

  return (
    <Badge tone={tone}>
      <Dot tone={tone} pulse={active} />
      {state}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Loading / empty / error
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-line/60 bg-raised ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  )
}

/**
 * A loading state that says what is being loaded and roughly what shape it will
 * take, rather than a spinner that says only "wait".
 */
export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <Panel className="p-5">
      <div className="label mb-4 flex items-center gap-2">
        <Dot tone="accent" pulse />
        {label}
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Panel>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: ReactNode
  action?: { href: string; label: string }
}) {
  return (
    <div className="panel dotfield rounded-lg px-6 py-14 text-center">
      <div
        className="mx-auto mb-5 h-11 w-11 rounded-md border border-dashed border-line-bright bg-ink"
        aria-hidden="true"
      />
      <h3 className="font-mono text-sm text-fg">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-dim text-pretty">{body}</p>
      {action ? (
        <Link href={action.href} className="btn-primary mt-6 no-underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

export function ErrorState({
  title = 'Could not load this',
  body,
  onRetry,
}: {
  title?: string
  body: ReactNode
  onRetry?: () => void
}) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/[0.05] px-5 py-6" role="alert">
      <div className="flex items-start gap-3">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-sm text-danger">{title}</h3>
          <div className="mt-1.5 text-sm leading-relaxed text-dim break-hash">{body}</div>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn-ghost mt-4">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** A short explanatory aside. Used to state a 0G footgun in context. */
export function Note({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warn' | 'ok'
  children: ReactNode
}) {
  const tones = {
    neutral: 'border-line bg-sub text-dim',
    warn: 'border-warn/30 bg-warn/[0.04] text-warn/90',
    ok: 'border-ok/30 bg-ok/[0.04] text-ok/90',
  }[tone]

  return (
    <div className={`rounded-md border px-4 py-3 text-xs leading-relaxed ${tones} text-pretty`}>
      {children}
    </div>
  )
}
