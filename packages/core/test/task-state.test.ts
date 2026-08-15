import { describe, expect, test } from 'vitest'
import {
  type TaskState,
  TASK_STATES,
  TASK_STATE_ORDER,
  ACKNOWLEDGE_WINDOW_MS,
  URGENT_THRESHOLD_MS,
  isTerminal,
  isValidTransition,
  progressPercent,
  acknowledgeDeadline,
  deadlineStatus,
  canDecrypt,
  describe as describeState,
} from '../src/task-state.js'

const HOUR = 60 * 60 * 1000

describe('TASK_STATES', () => {
  test('lists the ten 0G lifecycle states in protocol order', () => {
    expect(TASK_STATES).toEqual([
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
    ])
  })

  test('TASK_STATE_ORDER is the same array, under the name other packages import', () => {
    expect(TASK_STATE_ORDER).toEqual(TASK_STATES)
  })

  test('states are plain strings, so cross-package comparison needs no shared enum object', () => {
    for (const state of TASK_STATE_ORDER) {
      expect(typeof state).toBe('string')
    }
    // A value that merely *looks* like a state must compare equal — the orchestrator
    // and web packages get theirs from JSON, not from this module.
    const fromJson: string = JSON.parse('"Delivered"')
    expect(TASK_STATE_ORDER.includes(fromJson as TaskState)).toBe(true)
  })
})

describe('isTerminal', () => {
  test('only Finished and Failed are terminal', () => {
    for (const state of TASK_STATES) {
      expect(isTerminal(state)).toBe(state === 'Finished' || state === 'Failed')
    }
  })
})

describe('isValidTransition', () => {
  test('allows each step of the happy path', () => {
    const happyPath: TaskState[] = [
      'Init',
      'SettingUp',
      'SetUp',
      'Training',
      'Trained',
      'Delivering',
      'Delivered',
      'UserAcknowledged',
      'Finished',
    ]

    for (const [index, from] of happyPath.entries()) {
      const to = happyPath[index + 1]
      if (to === undefined) break
      expect(isValidTransition(from, to)).toBe(true)
    }
  })

  test('any non-terminal state may fail', () => {
    for (const state of TASK_STATES) {
      if (isTerminal(state)) continue
      expect(isValidTransition(state, 'Failed')).toBe(true)
    }
  })

  test('rejects going backwards', () => {
    expect(isValidTransition('Trained', 'Training')).toBe(false)
    expect(isValidTransition('Finished', 'UserAcknowledged')).toBe(false)
    expect(isValidTransition('Delivered', 'Init')).toBe(false)
  })

  test('rejects skipping a state — the provider never jumps the queue', () => {
    expect(isValidTransition('Init', 'Training')).toBe(false)
    expect(isValidTransition('Delivered', 'Finished')).toBe(false)
  })

  test('rejects leaving a terminal state, including Failed to Failed', () => {
    expect(isValidTransition('Finished', 'Failed')).toBe(false)
    expect(isValidTransition('Failed', 'Failed')).toBe(false)
    expect(isValidTransition('Failed', 'Init')).toBe(false)
  })

  test('an unchanged state is not a transition', () => {
    for (const state of TASK_STATES) {
      expect(isValidTransition(state, state)).toBe(false)
    }
  })
})

describe('progressPercent', () => {
  test('runs from 0 at Init to 100 at Finished', () => {
    expect(progressPercent('Init')).toBe(0)
    expect(progressPercent('Finished')).toBe(100)
  })

  test('never decreases along the happy path', () => {
    const happyPath: TaskState[] = TASK_STATES.filter((s) => s !== 'Failed')

    for (const [index, state] of happyPath.entries()) {
      const next = happyPath[index + 1]
      if (next === undefined) break
      expect(progressPercent(next)).toBeGreaterThan(progressPercent(state))
    }
  })

  test('stays within 0–100 for every state', () => {
    for (const state of TASK_STATES) {
      const percent = progressPercent(state)
      expect(percent).toBeGreaterThanOrEqual(0)
      expect(percent).toBeLessThanOrEqual(100)
    }
  })
})

describe('acknowledgeDeadline', () => {
  test('is exactly 48 hours after delivery', () => {
    const deliveredAt = new Date('2026-08-14T10:00:00.000Z')
    expect(acknowledgeDeadline(deliveredAt).toISOString()).toBe('2026-08-16T10:00:00.000Z')
  })

  test('does not mutate the date it was given', () => {
    const deliveredAt = new Date('2026-08-14T10:00:00.000Z')
    acknowledgeDeadline(deliveredAt)
    expect(deliveredAt.toISOString()).toBe('2026-08-14T10:00:00.000Z')
  })

  test('ACKNOWLEDGE_WINDOW_MS is 48 hours', () => {
    expect(ACKNOWLEDGE_WINDOW_MS).toBe(48 * HOUR)
  })
})

describe('deadlineStatus', () => {
  const deliveredAt = new Date('2026-08-14T10:00:00.000Z')
  const at = (hoursAfterDelivery: number) =>
    new Date(deliveredAt.getTime() + hoursAfterDelivery * HOUR)

  test('reports the full window immediately after delivery', () => {
    const status = deadlineStatus(deliveredAt, deliveredAt)
    expect(status.msRemaining).toBe(ACKNOWLEDGE_WINDOW_MS)
    expect(status.expired).toBe(false)
    expect(status.urgent).toBe(false)
  })

  test('counts down in real time', () => {
    expect(deadlineStatus(deliveredAt, at(12)).msRemaining).toBe(36 * HOUR)
  })

  test('is not urgent with exactly 6 hours left — urgent means under 6', () => {
    const status = deadlineStatus(deliveredAt, at(42))
    expect(status.msRemaining).toBe(URGENT_THRESHOLD_MS)
    expect(status.urgent).toBe(false)
    expect(status.expired).toBe(false)
  })

  test('is urgent one millisecond past the 6-hour boundary', () => {
    const status = deadlineStatus(deliveredAt, new Date(at(42).getTime() + 1))
    expect(status.urgent).toBe(true)
    expect(status.expired).toBe(false)
  })

  test('is expired but no longer urgent once the window closes', () => {
    const status = deadlineStatus(deliveredAt, at(48))
    expect(status.msRemaining).toBe(0)
    expect(status.expired).toBe(true)
    expect(status.urgent).toBe(false)
  })

  test('reports how far past the deadline the user is, as a negative remainder', () => {
    const status = deadlineStatus(deliveredAt, at(50))
    expect(status.msRemaining).toBe(-2 * HOUR)
    expect(status.expired).toBe(true)
    expect(status.urgent).toBe(false)
  })

  test('URGENT_THRESHOLD_MS is 6 hours', () => {
    expect(URGENT_THRESHOLD_MS).toBe(6 * HOUR)
  })
})

describe('canDecrypt', () => {
  test('is true only at Finished — the provider needs ~1 minute after acknowledgement', () => {
    for (const state of TASK_STATES) {
      expect(canDecrypt(state)).toBe(state === 'Finished')
    }
  })

  test('is false at UserAcknowledged, where 0G throws "second arg must be public key"', () => {
    expect(canDecrypt('UserAcknowledged')).toBe(false)
  })
})

describe('describe', () => {
  test('returns a distinct non-empty sentence for every state', () => {
    const sentences = TASK_STATES.map(describeState)

    for (const sentence of sentences) {
      expect(sentence.length).toBeGreaterThan(0)
      expect(sentence.endsWith('.')).toBe(true)
    }

    expect(new Set(sentences).size).toBe(TASK_STATES.length)
  })

  test('warns about the 48-hour clock at Delivered', () => {
    expect(describeState('Delivered')).toContain('48')
  })
})
