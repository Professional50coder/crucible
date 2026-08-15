/**
 * 0G's fine-tuning task state machine, and what each state means to a user who
 * has never read the SDK.
 *
 *   Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered
 *        → UserAcknowledged → Finished                       ↘ Failed
 *
 * `Delivered` starts the 48-hour clock. `Finished` is the first point at which
 * decryption succeeds — calling it earlier fails with the famously unhelpful
 * "second arg must be public key".
 */

import { TASK_STATES, type TaskState } from './types'

export { TASK_STATES }

export type StatePhase = 'pending' | 'active' | 'complete' | 'failed'

export interface StateMeta {
  state: TaskState
  label: string
  /** What is actually happening, in plain language. */
  detail: string
}

export const STATE_META: Record<TaskState, StateMeta> = {
  Init: {
    state: 'Init',
    label: 'Init',
    detail: 'Task created on 0G Chain and the fine-tuning sub-account funded.',
  },
  SettingUp: {
    state: 'SettingUp',
    label: 'Setting up',
    detail: 'Provider TEE is pulling the base model and your dataset from 0G Storage.',
  },
  SetUp: {
    state: 'SetUp',
    label: 'Set up',
    detail: 'Environment ready. Dataset hash verified against the on-chain root hash.',
  },
  Training: {
    state: 'Training',
    label: 'Training',
    detail: 'LoRA fine-tune running inside an Intel TDX enclave on an H200.',
  },
  Trained: {
    state: 'Trained',
    label: 'Trained',
    detail: 'Adapter produced. Provider is encrypting it for delivery.',
  },
  Delivering: {
    state: 'Delivering',
    label: 'Delivering',
    detail: 'Adapter being written to 0G Storage and the root hash committed on-chain.',
  },
  Delivered: {
    state: 'Delivered',
    label: 'Delivered',
    detail: 'The 48-hour acknowledgement window is now open. Crucible handles it.',
  },
  UserAcknowledged: {
    state: 'UserAcknowledged',
    label: 'Acknowledged',
    detail: 'acknowledgeModel called — download hash-verified against the on-chain root hash.',
  },
  Finished: {
    state: 'Finished',
    label: 'Finished',
    detail: 'Settled. The adapter is decryptable and the passport can be minted.',
  },
  Failed: {
    state: 'Failed',
    label: 'Failed',
    detail: 'The task did not complete. See the error below.',
  },
}

/** Position in the linear lifecycle. `Failed` is off the line and returns -1. */
export function stateIndex(state: TaskState): number {
  return (TASK_STATES as readonly string[]).indexOf(state)
}

export function isTerminal(state: TaskState): boolean {
  return state === 'Finished' || state === 'Failed'
}

export function isFailed(state: TaskState): boolean {
  return state === 'Failed'
}

/** True once the 48-hour clock has started and before it is satisfied. */
export function isAwaitingAcknowledgement(state: TaskState): boolean {
  return state === 'Delivered'
}

/**
 * Progress along the lifecycle, 0–100.
 *
 * `Init` is deliberately non-zero: a task that exists has already had funds move
 * and a transaction land, and rendering that as 0% reads as "nothing happened".
 * `Failed` reports 0 because its progress is meaningless — the UI switches to an
 * error presentation instead of a bar.
 */
export function progressPercent(state: TaskState): number {
  if (state === 'Failed') return 0

  const index = stateIndex(state)
  if (index < 0) return 0

  return Math.round((index / (TASK_STATES.length - 1)) * 100)
}

/** How a given step should render relative to the job's current state. */
export function phaseOf(step: TaskState, current: TaskState): StatePhase {
  if (current === 'Failed') {
    // Everything the job actually reached before failing stays complete; the
    // rest is simply never going to happen.
    return 'pending'
  }

  const stepIndex = stateIndex(step)
  const currentIndex = stateIndex(current)

  if (stepIndex < currentIndex) return 'complete'
  if (stepIndex === currentIndex) return (currentIndex === TASK_STATES.length - 1 ? 'complete' : 'active')
  return 'pending'
}

/**
 * Step rendering for a failed job, where we need to know how far it got. The
 * failure is attributed to `failedAt`, and every earlier step is complete.
 */
export function phaseOfFailed(step: TaskState, failedAt: TaskState): StatePhase {
  const stepIndex = stateIndex(step)
  const failedIndex = stateIndex(failedAt)

  if (failedIndex < 0) return 'pending'
  if (stepIndex < failedIndex) return 'complete'
  if (stepIndex === failedIndex) return 'failed'
  return 'pending'
}

export function stateMeta(state: TaskState): StateMeta {
  return STATE_META[state]
}
