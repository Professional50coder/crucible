'use client'

/**
 * 0G's task lifecycle, rendered as an instrument rather than a checklist.
 *
 * Every state is always visible — including the ones a job has not reached —
 * because the value of showing the machine is that you can see where you are
 * *in* it and how much is left. A list that reveals steps as they happen tells
 * you what already occurred; this one tells you what is coming.
 *
 * Three decisions carry the "instrument" register:
 *
 *  - **The progress figure is the subject.** It is set at a display size in
 *    tabular figures, with `step n / 9` under it, so the number reads as a
 *    measurement rather than a caption. Tabular matters: at 2s poll intervals a
 *    proportional `88%` and `100%` are different widths and the readout jitters.
 *  - **Motion is entrance and transition only.** The bar animates when the state
 *    changes and the rows fade in once. Nothing loops on the data itself — a
 *    perpetual shimmer over a value is the interface insisting something is
 *    happening when the value has not moved.
 *  - **`useReducedMotion()` is honoured everywhere.** When it is set, every
 *    duration collapses to zero rather than merely shortening, and the active
 *    marker stops pulsing entirely.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { formatTimestamp } from '@/lib/format'
import {
  TASK_STATES,
  phaseOf,
  phaseOfFailed,
  progressPercent,
  stateIndex,
  stateMeta,
  type StatePhase,
} from '@/lib/task-states'
import type { TaskState } from '@/lib/types'

export interface StateMachineProps {
  state: TaskState
  /** Which state the job was in when it failed. Required when state is Failed. */
  failedAt?: TaskState
  history?: Partial<Record<TaskState, string>>
  queued?: boolean
}

const dotClass: Record<StatePhase, string> = {
  complete: 'border-ok/60 bg-ok/20',
  active: 'border-phosphor bg-phosphor',
  pending: 'border-line bg-ink',
  failed: 'border-danger bg-danger',
}

const labelClass: Record<StatePhase, string> = {
  complete: 'text-dim',
  active: 'text-fg',
  pending: 'text-faint',
  failed: 'text-danger',
}

export function StateMachine({ state, failedAt, history = {}, queued = false }: StateMachineProps) {
  const reduced = useReducedMotion()
  const failed = state === 'Failed'
  const percent = failed ? 0 : progressPercent(state)

  /** Zero durations rather than fast ones: "reduced" means none, not less. */
  const ease = reduced ? { duration: 0 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }

  const step = failed ? stateIndex(failedAt ?? 'Init') : stateIndex(state)

  return (
    <div data-testid="state-machine">
      {/* ---- Readout ------------------------------------------------- */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label">Lifecycle</div>
          <div className="mt-1.5 truncate font-mono text-sm text-fg">
            {failed ? 'Failed' : queued ? 'Queued — provider busy' : stateMeta(state).label}
          </div>
          <div className="mt-1 font-mono text-2xs tabular-nums text-faint">
            step {Math.max(1, step + 1)} / {TASK_STATES.length}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="label">Progress</div>
          {/* The number is the point, so it is given the size of one. */}
          <div
            className={`mt-1 font-mono text-3xl leading-none tabular-nums ${
              failed ? 'text-danger' : 'text-phosphor'
            }`}
            data-testid="progress-percent"
          >
            {failed ? '—' : `${percent}%`}
          </div>
        </div>
      </div>

      {/* ---- Track --------------------------------------------------- */}
      <div
        className="mb-6 h-[3px] w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Task lifecycle progress"
      >
        <motion.div
          className={`h-full rounded-full ${failed ? 'bg-danger' : 'bg-phosphor'}`}
          initial={false}
          animate={{ width: `${failed ? 100 : percent}%` }}
          transition={ease}
        />
      </div>

      {/* ---- The machine --------------------------------------------- */}
      <ol className="space-y-0">
        {TASK_STATES.map((stepState, index) => {
          const phase = failed
            ? phaseOfFailed(stepState, failedAt ?? 'Init')
            : phaseOf(stepState, state)
          const meta = stateMeta(stepState)
          const at = history[stepState]
          const last = index === TASK_STATES.length - 1

          return (
            <motion.li
              key={stepState}
              className="relative flex gap-3.5 pb-4 last:pb-0"
              initial={reduced ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.28, delay: index * 0.035, ease: 'easeOut' }
              }
            >
              {!last ? (
                <span
                  className={`absolute left-[6px] top-4 h-full w-px transition-colors duration-500 ${
                    phase === 'complete' ? 'bg-ok/25' : 'bg-line'
                  }`}
                  aria-hidden="true"
                />
              ) : null}

              <span
                className={`relative z-10 mt-0.5 grid h-[13px] w-[13px] shrink-0 place-items-center rounded-full border transition-colors duration-500 ${dotClass[phase]} ${
                  phase === 'active' ? 'ring-4 ring-phosphor/15' : ''
                }`}
                aria-hidden="true"
              >
                {phase === 'complete' ? (
                  <svg viewBox="0 0 8 8" width="8" height="8" className="h-2 w-2 text-ok">
                    <path
                      d="M1.4 4.2 3 5.8 6.6 2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : phase === 'active' ? (
                  // The one pulse in the component, and it marks *where the
                  // machine is*, not a value. Suppressed outright under reduced
                  // motion rather than slowed.
                  <span
                    className={`h-1 w-1 rounded-full bg-ink ${reduced ? '' : 'animate-pulseline'}`}
                  />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span
                    className={`font-mono text-[13px] transition-colors duration-500 ${labelClass[phase]}`}
                    data-testid={`state-step-${stepState}`}
                    data-phase={phase}
                  >
                    {meta.label}
                  </span>
                  {at ? (
                    <span className="font-mono text-2xs tabular-nums text-faint">
                      {formatTimestamp(at)}
                    </span>
                  ) : null}
                </div>

                {/* The explanation belongs to whichever step is live. It enters
                    and leaves with the state rather than appearing instantly,
                    so the eye follows the machine down the list. */}
                <AnimatePresence initial={false} mode="wait">
                  {phase === 'active' || phase === 'failed' ? (
                    <motion.p
                      key={`${stepState}-detail`}
                      className="mt-1 max-w-prose overflow-hidden text-xs leading-relaxed text-dim text-pretty"
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' }}
                    >
                      {meta.detail}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
