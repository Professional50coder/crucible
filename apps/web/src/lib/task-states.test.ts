import { describe, expect, it } from 'vitest'

import {
  TASK_STATES,
  isAwaitingAcknowledgement,
  isTerminal,
  phaseOf,
  phaseOfFailed,
  progressPercent,
  stateIndex,
  stateMeta,
} from './task-states'
import type { TaskState } from './types'

describe('TASK_STATES', () => {
  it('matches 0G’s documented lifecycle, in order', () => {
    expect([...TASK_STATES]).toEqual([
      'Init',
      'SettingUp',
      'SetUp',
      'Training',
      'Trained',
      'Delivering',
      'Delivered',
      'UserAcknowledged',
      'Finished',
    ])
  })

  it('does not include Failed on the linear path', () => {
    expect(stateIndex('Failed')).toBe(-1)
  })
})

describe('progressPercent', () => {
  it('runs from a non-zero floor to 100', () => {
    // A task that exists has already had funds move and a transaction land;
    // rendering that as 0% reads as "nothing happened".
    expect(progressPercent('Init')).toBe(0)
    expect(progressPercent('Finished')).toBe(100)
  })

  it('increases monotonically along the lifecycle', () => {
    const values = TASK_STATES.map((state) => progressPercent(state))
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
    }
  })

  it('places Delivered at three quarters', () => {
    expect(progressPercent('Delivered')).toBe(75)
  })

  it('reports 0 for Failed, whose progress is meaningless', () => {
    expect(progressPercent('Failed')).toBe(0)
  })
})

describe('phaseOf', () => {
  it('marks earlier states complete and later ones pending', () => {
    expect(phaseOf('Init', 'Training')).toBe('complete')
    expect(phaseOf('SetUp', 'Training')).toBe('complete')
    expect(phaseOf('Training', 'Training')).toBe('active')
    expect(phaseOf('Trained', 'Training')).toBe('pending')
    expect(phaseOf('Finished', 'Training')).toBe('pending')
  })

  it('marks the final state complete rather than active once reached', () => {
    expect(phaseOf('Finished', 'Finished')).toBe('complete')
    expect(phaseOf('UserAcknowledged', 'Finished')).toBe('complete')
  })
})

describe('phaseOfFailed', () => {
  it('keeps everything reached before the failure complete', () => {
    expect(phaseOfFailed('Init', 'Training')).toBe('complete')
    expect(phaseOfFailed('SetUp', 'Training')).toBe('complete')
    expect(phaseOfFailed('Training', 'Training')).toBe('failed')
    expect(phaseOfFailed('Delivered', 'Training')).toBe('pending')
  })
})

describe('lifecycle predicates', () => {
  it('identifies terminal states', () => {
    expect(isTerminal('Finished')).toBe(true)
    expect(isTerminal('Failed')).toBe(true)
    expect(isTerminal('Delivered')).toBe(false)
  })

  it('identifies the single state that opens the 48-hour window', () => {
    const opening = (TASK_STATES as readonly TaskState[]).filter(isAwaitingAcknowledgement)
    expect(opening).toEqual(['Delivered'])
  })
})

describe('stateMeta', () => {
  it('describes every state, including Failed', () => {
    for (const state of [...TASK_STATES, 'Failed'] as TaskState[]) {
      const meta = stateMeta(state)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.detail.length).toBeGreaterThan(0)
    }
  })

  it('names the 48-hour window on the state that starts it', () => {
    expect(stateMeta('Delivered').detail).toContain('48-hour')
  })
})
