'use client'

/**
 * The 48-hour acknowledgement window — the product's core promise, made visible.
 *
 * On 0G, reaching `Delivered` starts a 48-hour clock. Miss it and you lose the
 * adapter *and* 30% of the fee. There is no notification, no dashboard, no
 * reminder; you are expected to poll a CLI. People have lost models to this.
 *
 * So this component does two things at once, and the second matters more than
 * the first: it shows the deadline, and it shows that Crucible is already
 * handling it, with the timestamp at which it will act.
 *
 * The window strip at the bottom is what makes "we handle this for you" a thing
 * you can see rather than a thing you are told. Crucible's mark sits hard
 * against the left edge of a 48-hour bar; the deadline is the whole width away.
 * The distance between those two points is the product.
 */

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
import { ClockIcon, ShieldIcon } from './icons'
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

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function AckCountdown({
  deliveredAt,
  acknowledgeScheduledFor,
  acknowledgedAt,
  totalNeuron,
  now: fixedNow,
}: AckCountdownProps) {
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

  return (
    <section
      className={`overflow-hidden rounded-lg border ${
        done ? 'border-ok/30 bg-ok/[0.04]' : 'border-warn/30 bg-warn/[0.035]'
      }`}
      data-testid="ack-countdown"
      aria-live="polite"
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
            <Dot tone="accent" pulse />
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
            <div className="mt-2.5 font-mono text-2xs text-faint">
              deadline {formatTimestamp(status.deadline.toISOString())}
            </div>

            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full transition-all duration-1000 ${
                  done ? 'bg-ok' : urgencyBar[status.urgency]
                }`}
                style={{ width: `${done ? 100 : Math.max(1, status.percentRemaining)}%` }}
                data-testid="ack-bar"
              />
            </div>
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
                  className="mt-1.5 font-mono text-lg leading-tight text-ok"
                  data-testid="ack-scheduled"
                >
                  Done
                </div>
                <div className="mt-2 font-mono text-2xs text-faint">
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
                  className="mt-1.5 font-mono text-lg leading-tight text-phosphor"
                  data-testid="ack-scheduled"
                >
                  {scheduledIn > 0 ? `in ${formatDuration(scheduledIn)}` : 'now — attempt in flight'}
                </div>
                <div className="mt-2 font-mono text-2xs text-faint">
                  {formatTimestamp(acknowledgeScheduledFor!)}
                </div>
              </>
            )}

            <p className="mt-3 text-xs leading-relaxed text-dim text-pretty">{AUTO_ACK_POLICY}</p>

            {!done ? (
              <p className="mt-3 font-mono text-2xs text-faint">
                escalation at {formatTimestamp(autoAcknowledgeBackstop(deliveredAt).toISOString())}
              </p>
            ) : null}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The window, to scale. Crucible acts in the first pixel of it.     */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label">The window, to scale</span>
            <span className="font-mono text-2xs text-faint">0h → {ACK_WINDOW_HOURS}h</span>
          </div>

          <div className="relative mt-3 h-6" data-testid="ack-window-strip">
            {/* Track. */}
            <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-line" aria-hidden="true" />

            {/* Consumed so far. */}
            <div
              className={`absolute left-0 top-2.5 h-1 rounded-full ${done ? 'bg-ok/50' : 'bg-line-bright'}`}
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
                className="absolute top-0 h-6 w-px bg-fg/70"
                style={{ left: `${nowPercent}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
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
                — <span className="font-mono text-fg">{formatOg(penalty)} 0G</span> —
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
    </section>
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
      <span className={`w-px ${tall ? 'h-6' : 'h-4 mt-1'} ${colour}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function Legend({ tone, k, v }: { tone: string; k: string; v: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <dt className="label truncate">{k}</dt>
        <dd className="truncate font-mono text-2xs text-dim">{v}</dd>
      </div>
    </div>
  )
}
