/**
 * The 0G fine-tuning task state machine.
 *
 * Ground truth: `Task.progress` in
 * `@0gfoundation/0g-compute-ts-sdk/sdk/fine-tuning/provider/provider.d.ts`
 * is an untyped `string`. The provider is free to send us anything, including
 * a state we have already passed. This module is the only place that decides
 * what a reported progress string is allowed to do to a job.
 */

/** The linear happy path, in order. */
export const TASK_STATES = [
  'Init',
  'SettingUp',
  'SetUp',
  'Training',
  'Trained',
  'Delivering',
  'Delivered',
  'UserAcknowledged',
  'Finished',
] as const

export type LinearState = (typeof TASK_STATES)[number]

/** `Failed` sits off the linear path: reachable from anywhere, exit from nowhere. */
export const FAILED = 'Failed' as const

export type TaskState = LinearState | typeof FAILED

/** States from which a job will never move again. */
const TERMINAL: ReadonlySet<string> = new Set<string>(['Finished', FAILED])

const INDEX: ReadonlyMap<string, number> = new Map(TASK_STATES.map((s, i) => [s, i]))

const BY_LOWER: ReadonlyMap<string, TaskState> = new Map(
  [...TASK_STATES, FAILED].map((s) => [s.toLowerCase(), s as TaskState]),
)

export function isKnownState(value: string): value is TaskState {
  return BY_LOWER.has(value.toLowerCase())
}

export function isTerminal(state: TaskState): boolean {
  return TERMINAL.has(state)
}

/**
 * Coerce a raw `Task.progress` string into a state we understand.
 * Returns `undefined` for anything unrecognised — the caller must then leave
 * the job where it is rather than guess.
 */
export function normalizeState(value: string | undefined | null): TaskState | undefined {
  if (typeof value !== 'string') return undefined
  return BY_LOWER.get(value.trim().toLowerCase())
}

/**
 * Order two states along the linear path. `Failed` is not on the path and
 * compares as greater than everything (it is an end, not a rewind).
 */
export function compareStates(a: TaskState, b: TaskState): number {
  const ai = a === FAILED ? Number.MAX_SAFE_INTEGER : (INDEX.get(a) ?? -1)
  const bi = b === FAILED ? Number.MAX_SAFE_INTEGER : (INDEX.get(b) ?? -1)
  return ai - bi
}

/**
 * The single rule that keeps a job's history honest: progress only ever moves
 * forward, or into `Failed`, and never out of a terminal state.
 */
export function canTransition(from: TaskState, to: TaskState): boolean {
  if (from === to) return !(from === FAILED)
  if (isTerminal(from)) return false
  if (to === FAILED) return true
  if (from === FAILED) return false
  return compareStates(to, from) > 0
}
