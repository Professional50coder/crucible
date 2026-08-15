'use client'

/**
 * The 48-hour acknowledgement window — the product's reason to exist, made
 * legible.
 *
 * On 0G, reaching `Delivered` starts a 48-hour clock. Miss it and you lose the
 * adapter *and* 30% of the fee. There is no notification, no dashboard, no
 * reminder; you are expected to poll a CLI. People have lost models to this.
 *
 * So this component does two things at once, and the second matters more than
 * the first: it shows the deadline, and it shows that Crucible is already
 * handling it, with the timestamp at which it will act.
 *
 * What it must not do is promise the model back. On this project's first run both
 * of `acknowledgeModel`'s download paths failed on Windows, the deliverable went
 * unacknowledged, and exactly 30% of the fee was deducted; the second run was
 * only retrieved by moving to Linux. So the copy claims only what is true: the
 * daemon detects delivery, exhausts every download path, records the outcome,
 * and releases the queue with `acknowledgeDeliverable`.
 *
 * Legibility rules this panel is built to, all of them learned from watching it
 * on a recording rather than on a desk:
 *
 *  - **Every mark on the strip is printed.** The markers used to be `sr-only`,
 *    which meant a judge watching a video read none of them. A tick whose
 *    meaning lives in a `title` attribute is a tick nobody reads.
 *  - **Colour is never the only carrier.** Each urgency has a word — `in hand`,
 *    `under a day left`, `inside the escalation margin` — set next to the clock.
 *  - **Every digit is tabular.** A countdown in proportional figures reflows on
 *    every tick; the eye reads the movement as instability rather than as time.
 *  - **The ticking clock is not a live region.** An `aria-live` wrapper around a
 *    one-second counter announces itself once a second forever. The polite
 *    region here is the urgency word alone, which changes three times in
 *    forty-eight hours.
 *  - **Motion is entrance and transition only.** framer-motion moves the panel
 *    in once and cross-fades the urgency word when it changes; the bars use a
 *    plain CSS transition because they are values, not events. Nothing loops on
 *    data, and `useReducedMotion()` collapses all of it to zero.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import {
  ACK_WINDOW_HOURS,
  ACK_WINDOW_MS,
  AUTO_ACK_MARGIN_MS,
  AUTO_ACK_POLICY,
  AUTO_ACK_SETTLE_MS,
  autoAcknowledgeBackstop,
  deadlineStatus,
  missedAckPenaltyNeuron,
  type DeadlineUrgency,
} from '@/lib/deadline'
import { formatDuration, formatOg, formatTimestamp } from '@/lib/format'
import { AlertIcon, ClockIcon, ShieldIcon } from './icons'
import { Dot } from './ui'

export interface AckCountdownProps {
  /** ISO timestamp the task entered `Delivered`. */
  deliveredAt: string
  /** ISO timestamp Crucible's daemon will act (or acted). */
  acknowledgeScheduledFor?: string | null
  /** ISO timestamp acknowledgement actually completed. */
  acknowledgedAt?: string | null
  /** Total fee in neuron, to state the 30% penalty concretely. */
  totalNeuron?: string
  /** Injectable clock, for tests. Live component ticks once per second. */
  now?: number
}

const urgencyText: Record<DeadlineUrgency, string> = {
  safe: 'text-ok',
  warning: 'text-warn',
  critical: 'text-danger',
  expired: 'text-danger',
}

const urgencyBar: Record<DeadlineUrgency, string> = {
  safe: 'bg-ok',
  warning: 'bg-warn',
  critical: 'bg-danger',
  expired: 'bg-danger',
}

/** A word for the state, so colour is never the only carrier of meaning. */
const urgencyWord: Record<DeadlineUrgency, string> = {
  safe: 'in hand',
  warning: 'under a day left',
  critical: 'inside the escalation margin',
  // Deliberately not "window closed": the label above already says that, and two
  // identical strings on one panel is a reader asking which one is the real one.
  expired: 'deadline passed',
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function AckCountdown({
  deliveredAt,
  acknowledgeScheduledFor,
  acknowledgedAt,
  totalNeuron,
  now: fixedNow,
}: AckCountdownProps) {
  const reduced = useReducedMotion()
  const [tick, setTick] = useState(() => fixedNow ?? Date.now())

  useEffect(() => {
    if (fixedNow !== undefined) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [fixedNow])

  const now = fixedNow ?? tick
  const status = deadlineStatus(deliveredAt, now)
  const done = Boolean(acknowledgedAt)

  const scheduledMs = acknowledgeScheduledFor ? new Date(acknowledgeScheduledFor).getTime() : null
  const scheduledIn = scheduledMs === null ? null : scheduledMs - now

  const penalty = totalNeuron ? missedAckPenaltyNeuron(totalNeuron) : null

  // Positions along the 48-hour strip, as percentages of the window.
  const deliveredMs = new Date(deliveredAt).getTime()
  const actMs = scheduledMs ?? deliveredMs + AUTO_ACK_SETTLE_MS
  const actPercent = clampPercent(((actMs - deliveredMs) / ACK_WINDOW_MS) * 100)
  const escalationPercent = clampPercent(((ACK_WINDOW_MS - AUTO_ACK_MARGIN_MS) / ACK_WINDOW_MS) * 100)
  const nowPercent = clampPercent(100 - status.percentRemaining)

  /** The unattended zone: nothing is ever allowed past here silently. */
  const marginWidth = 100 - escalationPercent

  const alarmed = !done && (status.urgency === 'critical' || status.urgency === 'expired')

  return (
    <motion.section
      className={`overflow-hidden rounded-lg border ${
        done
          ? 'border-ok/30 bg-ok/[0.04]'
          : alarmed
            ? 'border-danger/40 bg-danger/[0.05]'
            : 'border-warn/30 bg-warn/[0.035]'
      }`}
      data-testid="ack-countdown"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-inherit px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <ClockIcon className={`h-4 w-4 ${done ? 'text-ok' : 'text-warn'}`} />
          <h2 className="font-mono text-xs uppercase tracking-widest2 text-fg">
            {ACK_WINDOW_HOURS}-hour acknowledgement window
          </h2>
        </div>

        {done ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest2 text-ok">
            <Dot tone="ok" />
            Handled by Crucible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest2 text-phosphor">
            <Dot tone="accent" pulse={!reduced} />
            Daemon armed
          </span>
        )}
      </div>

      <div className="px-4 py-5 sm:px-5">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Left: the clock you would otherwise be watching yourself. */}
          <div>
            <div className="label">
              {done
                ? 'Window at acknowledgement'
                : status.expired
                  ? 'Window closed'
                  : 'Time remaining'}
            </div>
            <div
              className={`mt-1.5 font-mono text-readout leading-none tabular-nums ${
                done ? 'text-ok' : urgencyText[status.urgency]
              }`}
              data-testid="ack-remaining"
            >
              {done ? 'Acknowledged' : formatDuration(status.remainingMs)}
            </div>

            {/*
              The one polite live region on the panel. It holds the urgency word
              and nothing else, so a screen reader is told "under a day left"
              when that becomes true instead of being read the clock every
              second for two days.
            */}
            {!done ? (
              <div className="mt-2 h-4" aria-live="polite" data-testid="ack-urgency">
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={status.urgency}
                    className={`inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest2 ${
                      urgencyText[status.urgency]
                    }`}
                    initial={reduced ? false : { opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.2 }}
                  >
                    {status.urgency === 'safe' ? (
                      <Dot tone="ok" />
                    ) : (
                      <AlertIcon className="h-3 w-3" />
                    )}
                    {urgencyWord[status.urgency]}
                  </motion.span>
                </AnimatePresence>
              </div>
            ) : null}

            <div className="mt-2.5 font-mono text-2xs tabular-nums text-faint">
              deadline {formatTimestamp(status.deadline.toISOString())}
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full transition-all duration-1000 ${
                  done ? 'bg-ok' : urgencyBar[status.urgency]
                }`}
                style={{ width: `${done ? 100 : Math.max(1, status.percentRemaining)}%` }}
                data-testid="ack-bar"
              />
            </div>
            <p className="mt-2 font-mono text-2xs tabular-nums text-faint">
              {done
                ? 'window closed with time to spare'
                : `${Math.round(status.percentRemaining)}% of the window still available`}
            </p>
          </div>

          {/* Right: the reason you do not have to watch it. */}
          <div className="border-t border-line pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div className="label flex items-center gap-1.5">
              <ShieldIcon className="h-3.5 w-3.5" />
              Crucible acknowledges
            </div>

            {done ? (
              <>
                <div
                  className="mt-1.5 font-mono text-lg leading-tight tabular-nums text-ok"
                  data-testid="ack-scheduled"
                >
                  Done
                </div>
                <div className="mt-2 font-mono text-2xs tabular-nums text-faint">
                  {formatTimestamp(acknowledgedAt!)}
                </div>
              </>
            ) : scheduledIn === null ? (
              <>
                <div
                  className="mt-1.5 font-mono text-lg leading-tight text-dim"
                  data-testid="ack-scheduled"
                >
                  On delivery
                </div>
                <div className="mt-2 text-xs text-faint">
                  The daemon arms itself the moment this task reaches Delivered.
                </div>
              </>
            ) : (
              <>
                <div
                  className="mt-1.5 font-mono text-lg leading-tight tabular-nums text-phosphor"
                  data-testid="ack-scheduled"
                >
                  {scheduledIn > 0 ? `in ${formatDuration(scheduledIn)}` : 'now — attempt in flight'}
                </div>
                <div className="mt-2 font-mono text-2xs tabular-nums text-faint">
                  {formatTimestamp(acknowledgeScheduledFor!)}
                </div>
              </>
            )}

            <p className="mt-3 text-xs leading-relaxed text-dim text-pretty">{AUTO_ACK_POLICY}</p>

            {!done ? (
              <p className="mt-3 font-mono text-2xs tabular-nums text-faint">
                escalation at {formatTimestamp(autoAcknowledgeBackstop(deliveredAt).toISOString())}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The window, to scale. Crucible acts in the first pixel of it.     */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="label">The window, to scale</span>
            <span className="font-mono text-2xs tabular-nums text-faint">
              0h → {ACK_WINDOW_HOURS}h · one percent ≈ {(ACK_WINDOW_HOURS * 60) / 100} minutes
            </span>
          </div>

          {/* 28px of ticks and track, then a printed label row beneath it. The
              labels are part of the drawing, not a tooltip: a mark whose meaning
              is only in a title attribute is a mark nobody reads. */}
          <div className="relative mt-4 h-7" data-testid="ack-window-strip">
            {/* Track. */}
            <div
              className="absolute inset-x-0 top-3 h-1.5 overflow-hidden rounded-full bg-line"
              aria-hidden="true"
            >
              {/* The last six hours: the zone the daemon escalates rather than
                  enter. Shaded, not merely bounded by a tick, because the point
                  is that it is territory and not a line. */}
              <div
                className="absolute inset-y-0 right-0 bg-danger/30"
                style={{ width: `${marginWidth}%` }}
              />
            </div>

            {/* Consumed so far. */}
            <div
              className={`absolute left-0 top-3 h-1.5 rounded-full transition-all duration-1000 ${
                done ? 'bg-ok/60' : 'bg-line-bright'
              }`}
              style={{ width: `${nowPercent}%` }}
              aria-hidden="true"
            />

            {/* Where Crucible acts — the whole point. */}
            <Marker percent={actPercent} tone="accent" label="Crucible acknowledges" tall />

            {/* The backstop, six hours before the cliff. */}
            <Marker percent={escalationPercent} tone="warn" label="Hard escalation" />

            {/* The cliff itself. */}
            <Marker percent={100} tone="danger" label="Deadline — model destroyed" tall />

            {/* Now. */}
            {!done ? (
              <div
                className="absolute top-0 h-7 w-px bg-fg/70 transition-all duration-1000"
                style={{ left: `${nowPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>

          {/* Printed labels, positioned under their ticks. */}
          <div className="relative mt-1 h-8" aria-hidden="true">
            <TickLabel percent={0} align="start" k="0h" v="delivered" />
            <TickLabel
              percent={actPercent}
              align="start"
              k="≈2m"
              v="Crucible acts"
              tone="text-phosphor"
              indent
            />
            <TickLabel
              percent={escalationPercent}
              align="center"
              k={`${ACK_WINDOW_HOURS - 6}h`}
              v="escalation"
              tone="text-warn"
            />
            <TickLabel
              percent={100}
              align="end"
              k={`${ACK_WINDOW_HOURS}h`}
              v="model destroyed"
              tone="text-danger"
            />
          </div>

          {/* The same four marks as a list, for screen readers and for anyone
              whose viewport is too narrow for the labels above to sit apart. */}
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Legend tone="bg-faint" k="0h · delivered" v={formatTimestamp(deliveredAt).slice(11)} />
            <Legend
              tone="bg-phosphor"
              k="Crucible acts"
              v={acknowledgedAt ? 'done' : '≈2m after delivery'}
            />
            <Legend tone="bg-warn" k="escalation" v={`${ACK_WINDOW_HOURS - 6}h`} />
            <Legend tone="bg-danger" k="deadline" v={`${ACK_WINDOW_HOURS}h`} />
          </dl>
        </div>

        {!done ? (
          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-dim text-pretty">
            <span className="text-warn">If nobody acknowledges:</span> the adapter is
            garbage-collected from 0G Storage and the TEE buffer, and 30% of the fee
            {penalty ? (
              <>
                {' '}
                — <span className="font-mono tabular-nums text-fg">{formatOg(penalty)} 0G</span> —
              </>
            ) : (
              ' '
            )}{' '}
            is deducted. Worse, the deliverable queue is then permanently locked: every later
            task reverts with{' '}
            <span className="font-mono">previous deliverable not acknowledged</span>. That is 0G
            Bug #4, and it has already happened to real users.
          </p>
        ) : null}
      </div>
    </motion.section>
  )
}

function Marker({
  percent,
  tone,
  label,
  tall = false,
}: {
  percent: number
  tone: 'accent' | 'warn' | 'danger'
  label: string
  tall?: boolean
}) {
  const colour = { accent: 'bg-phosphor', warn: 'bg-warn', danger: 'bg-danger' }[tone]

  return (
    <span
      className="absolute top-0 flex flex-col items-center"
      style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
      title={label}
    >
      <span className={`w-px ${tall ? 'h-7' : 'h-5 mt-1'} ${colour}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * A printed label under a tick.
 *
 * Alignment matters more than it looks: a centred label at 0% or 100% hangs off
 * the edge of the strip and clips, which on a countdown reads as a rendering
 * bug rather than a design choice.
 */
function TickLabel({
  percent,
  align,
  k,
  v,
  tone = 'text-faint',
  indent = false,
}: {
  percent: number
  align: 'start' | 'center' | 'end'
  k: string
  v: string
  tone?: string
  indent?: boolean
}) {
  const transform =
    align === 'center' ? 'translateX(-50%)' : align === 'end' ? 'translateX(-100%)' : 'none'

  return (
    <span
      className={`absolute top-0 flex flex-col ${
        align === 'end' ? 'items-end text-right' : align === 'center' ? 'items-center' : 'items-start'
      }`}
      style={{ left: `${percent}%`, transform, paddingLeft: indent ? '0.375rem' : undefined }}
    >
      <span className={`font-mono text-2xs leading-tight tabular-nums ${tone}`}>{k}</span>
      <span className="whitespace-nowrap font-mono text-[10px] leading-tight text-faint">{v}</span>
    </span>
  )
}

function Legend({ tone, k, v }: { tone: string; k: string; v: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <dt className="label truncate">{k}</dt>
        <dd className="truncate font-mono text-2xs tabular-nums text-dim">{v}</dd>
      </div>
    </div>
  )
}
