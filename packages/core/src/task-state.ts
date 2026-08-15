/**
 * The 0G Compute fine-tuning task lifecycle, as a pure state machine.
 *
 *   Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered
 *        → UserAcknowledged → Finished          (plus terminal Failed)
 *
 * Three things about this lifecycle cost real money if you get them wrong, and
 * none of them are obvious from the state names:
 *
 * 1. `Delivered` starts a **48-hour** clock. Miss it and the user loses the model
 *    *and* 30% of the fee is deducted. Nothing warns you — hence `deadlineStatus`.
 *
 * 2. Decryption only works at `Finished`, not at `UserAcknowledged`. Acknowledging
 *    does not publish the key; the provider needs roughly a minute to settle and
 *    upload it. Decrypting too early fails with the famously unhelpful
 *    `second arg must be public key`. Hence `canDecrypt`.
 *
 * 3. "Bug #4": the deprecated `downloadModelFrom0GStorage` + `decryptModel` path
 *    skips acknowledgement and PERMANENTLY LOCKS the user's deliverable queue.
 *    Always `acknowledgeModel`; `acknowledgeDeliverable` is the escape hatch.
 *
 * This module has no dependencies and touches no network — it is the shared
 * vocabulary that the CLI, the poller and the UI all agree on.
 */

export type TaskState =
  | 'Init'
  | 'SettingUp'
  | 'SetUp'
  | 'Training'
  | 'Trained'
  | 'Delivering'
  | 'Delivered'
  | 'UserAcknowledged'
  | 'Finished'
  | 'Failed'

/**
 * Protocol order. `Failed` is last because it is reachable from anywhere, not sequential.
 *
 * `TaskState` is deliberately a plain string union rather than a TS enum: the
 * orchestrator and web packages receive states as JSON strings over HTTP, and an
 * enum would force every one of those comparisons through an imported runtime object.
 */
export const TASK_STATE_ORDER: readonly TaskState[] = [
  'Init',
  'SettingUp',
  'SetUp',
  'Training',
  'Trained',
  'Delivering',
  'Delivered',
  'UserAcknowledged',
  'Finished',
  'Failed',
]

/** Alias of `TASK_STATE_ORDER`. Both names are exported; they are the same array. */
export const TASK_STATES = TASK_STATE_ORDER

/** The happy path, in order. Everything else branches off it into `Failed`. */
const HAPPY_PATH: readonly TaskState[] = TASK_STATE_ORDER.filter((s) => s !== 'Failed')

/** 48 hours from `Delivered` to acknowledge, or the model is lost and 30% of the fee burns. */
export const ACKNOWLEDGE_WINDOW_MS = 48 * 60 * 60 * 1000

/** Under 6 hours left is when the UI should start shouting. */
export const URGENT_THRESHOLD_MS = 6 * 60 * 60 * 1000

export function isTerminal(state: TaskState): boolean {
  return state === 'Finished' || state === 'Failed'
}

/**
 * True only for transitions 0G actually performs: one step forward along the happy
 * path, or a fall into `Failed` from any non-terminal state.
 *
 * Deliberately strict in three ways:
 *   - Backwards is never valid; a task that appears to regress is a client bug.
 *   - Skipping is never valid, even though a slow poller may *observe* a skip.
 *     Compare observations against `TASK_STATES` order, not against this function.
 *   - `from === to` is false. An unchanged state is not a transition, so a poller
 *     should test for change before asking whether the change was legal.
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
  if (isTerminal(from)) return false
  if (to === 'Failed') return true

  const fromIndex = HAPPY_PATH.indexOf(from)
  const toIndex = HAPPY_PATH.indexOf(to)
  if (fromIndex === -1 || toIndex === -1) return false

  return toIndex === fromIndex + 1
}

/**
 * Progress for a bar, 0–100. The gaps are weighted by wall-clock reality, not by
 * step count: `Training` is where nearly all the time goes, so it opens a wide gap.
 *
 * `Failed` reports 100 because a progress bar is *finished moving* — a failed task
 * rendered at 0 shows an empty bar, which reads as "nothing happened yet" rather
 * than "this stopped". Colour it red; do not read this number as success.
 */
const PROGRESS: Record<TaskState, number> = {
  Init: 0,
  SettingUp: 10,
  SetUp: 25,
  Training: 40,
  Trained: 70,
  Delivering: 80,
  Delivered: 90,
  UserAcknowledged: 95,
  Finished: 100,
  Failed: 100,
}

export function progressPercent(state: TaskState): number {
  return PROGRESS[state]
}

/** The moment the 48-hour window closes. Returns a new Date; the input is untouched. */
export function acknowledgeDeadline(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + ACKNOWLEDGE_WINDOW_MS)
}

export interface DeadlineStatus {
  /** Milliseconds left to acknowledge. Goes **negative** past the deadline, so a UI can say how late. */
  msRemaining: number
  expired: boolean
  /** Under `URGENT_THRESHOLD_MS` left and still savable. False once expired — urgency is moot then. */
  urgent: boolean
}

export function deadlineStatus(deliveredAt: Date, now: Date): DeadlineStatus {
  const msRemaining = acknowledgeDeadline(deliveredAt).getTime() - now.getTime()
  const expired = msRemaining <= 0

  return {
    msRemaining,
    expired,
    urgent: !expired && msRemaining < URGENT_THRESHOLD_MS,
  }
}

/**
 * Decryption is possible only at `Finished`. `UserAcknowledged` looks done but the
 * provider has not settled and uploaded the key yet — decrypting there throws
 * `second arg must be public key`. Poll until `Finished` (roughly a minute).
 */
export function canDecrypt(state: TaskState): boolean {
  return state === 'Finished'
}

const DESCRIPTIONS: Record<TaskState, string> = {
  Init: 'Task created on-chain and the fee is locked, waiting for a provider to pick it up.',
  SettingUp: 'The provider is downloading your dataset and the base model.',
  SetUp: 'The provider has everything it needs and is about to start training.',
  Training: 'Fine-tuning is running inside the TEE. This is the long part.',
  Trained: 'Training finished; the adapter is being encrypted for delivery.',
  Delivering: 'The encrypted adapter is being uploaded to 0G Storage.',
  Delivered:
    'Your model is ready — acknowledge it within 48 hours or you lose it and 30% of the fee.',
  UserAcknowledged:
    'Acknowledged. Wait for the provider to settle and publish the key — decryption fails until then.',
  Finished: 'Settled and the key is published. You can now decrypt and use your adapter.',
  Failed: 'The task failed. The provider did not deliver a model; check the task on the explorer.',
}

/** One short sentence per state, written for the person waiting, not for a log file. */
export function describe(state: TaskState): string {
  return DESCRIPTIONS[state]
}
