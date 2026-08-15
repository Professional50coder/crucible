import { describe, it, expect } from 'vitest'
import {
  TASK_STATES,
  isTerminal,
  isKnownState,
  normalizeState,
  compareStates,
  canTransition,
} from '../src/states.js'

describe('0G task state machine', () => {
  it('lists the nine progress states in 0G order', () => {
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
    ])
  })

  it('treats Finished and Failed as terminal, everything else as live', () => {
    expect(isTerminal('Finished')).toBe(true)
    expect(isTerminal('Failed')).toBe(true)
    expect(isTerminal('Delivered')).toBe(false)
    expect(isTerminal('Init')).toBe(false)
    expect(isTerminal('UserAcknowledged')).toBe(false)
  })

  it('recognises Failed as a valid state even though it is off the linear path', () => {
    expect(isKnownState('Failed')).toBe(true)
    expect(isKnownState('Delivered')).toBe(true)
    expect(isKnownState('Sideways')).toBe(false)
  })

  it('normalises casing and whitespace from the provider, rejects garbage', () => {
    expect(normalizeState(' delivered ')).toBe('Delivered')
    expect(normalizeState('USERACKNOWLEDGED')).toBe('UserAcknowledged')
    expect(normalizeState('failed')).toBe('Failed')
    expect(normalizeState('banana')).toBeUndefined()
    expect(normalizeState(undefined)).toBeUndefined()
  })

  it('orders states along the linear path', () => {
    expect(compareStates('Init', 'Training')).toBeLessThan(0)
    expect(compareStates('Finished', 'Delivered')).toBeGreaterThan(0)
    expect(compareStates('Delivered', 'Delivered')).toBe(0)
  })

  describe('canTransition', () => {
    it('allows forward movement along the path', () => {
      expect(canTransition('Delivered', 'UserAcknowledged')).toBe(true)
      expect(canTransition('Init', 'Training')).toBe(true)
    })

    it('allows staying put (the common poll result)', () => {
      expect(canTransition('Training', 'Training')).toBe(true)
    })

    it('REJECTS backwards movement — a flapping provider must not rewind a job', () => {
      expect(canTransition('Delivered', 'Training')).toBe(false)
      expect(canTransition('Finished', 'Delivered')).toBe(false)
      expect(canTransition('UserAcknowledged', 'Delivered')).toBe(false)
    })

    it('allows Failed from any live state', () => {
      expect(canTransition('Init', 'Failed')).toBe(true)
      expect(canTransition('Training', 'Failed')).toBe(true)
      expect(canTransition('Delivered', 'Failed')).toBe(true)
    })

    it('refuses to leave a terminal state', () => {
      expect(canTransition('Failed', 'Training')).toBe(false)
      expect(canTransition('Failed', 'Finished')).toBe(false)
      expect(canTransition('Finished', 'Finished')).toBe(true)
      expect(canTransition('Finished', 'Failed')).toBe(false)
    })
  })
})
