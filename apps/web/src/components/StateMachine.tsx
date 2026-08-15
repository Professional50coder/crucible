'use client'

/**
 * 0G's ten-state task lifecycle, rendered as an instrument rather than a
 * checklist. Every state is always visible — including the ones a job has not
 * reached — because the value of showing the machine is that you can see where
 * you are *in* it, and how much is left.
 */

import { formatTimestamp } from '@/lib/format'
import {
  TASK_STATES,
  phaseOf,
  phaseOfFailed,
  progressPercent,
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
  const failed = state === 'Failed'
  const percent = failed ? 0 : progressPercent(state)

  return (
    <div data-testid="state-machine">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="label">Lifecycle</div>
          <div className="mt-1 font-mono text-sm text-fg">
            {failed ? 'Failed' : queued ? 'Queued — provider busy' : stateMeta(state).label}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Progress</div>
          <div
            className={`mt-1 font-mono text-sm ${failed ? 'text-danger' : 'text-phosphor'}`}
            data-testid="progress-percent"
          >
            {failed ? '—' : `${percent}%`}
          </div>
        </div>
      </div>

      <div
        className="mb-6 h-[3px] w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Task lifecycle progress"
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ${failed ? 'bg-danger' : 'bg-phosphor'}`}
          style={{ width: `${failed ? 100 : percent}%` }}
        />
      </div>

      <ol className="space-y-0">
        {TASK_STATES.map((step, index) => {
          const phase = failed
            ? phaseOfFailed(step, failedAt ?? 'Init')
            : phaseOf(step, state)
          const meta = stateMeta(step)
          const at = history[step]
          const last = index === TASK_STATES.length - 1

          return (
            <li key={step} className="relative flex gap-3.5 pb-4 last:pb-0">
              {!last ? (
                <span
                  className={`absolute left-[6px] top-4 h-full w-px ${
                    phase === 'complete' ? 'bg-ok/25' : 'bg-line'
                  }`}
                  aria-hidden="true"
                />
              ) : null}

              <span
                className={`relative z-10 mt-0.5 grid h-[13px] w-[13px] shrink-0 place-items-center rounded-full border ${dotClass[phase]} ${
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
                  <span className="h-1 w-1 animate-pulseline rounded-full bg-ink" />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span
                    className={`font-mono text-[13px] ${labelClass[phase]}`}
                    data-testid={`state-step-${step}`}
                    data-phase={phase}
                  >
                    {meta.label}
                  </span>
                  {at ? (
                    <span className="font-mono text-2xs text-faint">{formatTimestamp(at)}</span>
                  ) : null}
                </div>

                {phase === 'active' || phase === 'failed' ? (
                  <p className="mt-1 max-w-prose text-xs leading-relaxed text-dim text-pretty">
                    {meta.detail}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
