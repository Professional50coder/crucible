import { describe, it, expect } from 'vitest'
import { ManualClock, systemClock, HOUR, MINUTE } from '../src/clock.js'

describe('injectable clock', () => {
  it('exposes time constants used by the deadline maths', () => {
    expect(MINUTE).toBe(60_000)
    expect(HOUR).toBe(3_600_000)
  })

  it('systemClock reads real time', () => {
    const before = Date.now()
    const t = systemClock.now()
    expect(t).toBeGreaterThanOrEqual(before)
  })

  it('ManualClock starts where it is told and only moves when advanced', () => {
    const clock = new ManualClock(1_000)
    expect(clock.now()).toBe(1_000)
    expect(clock.now()).toBe(1_000)
    clock.advance(500)
    expect(clock.now()).toBe(1_500)
  })

  it('ManualClock refuses to go backwards', () => {
    const clock = new ManualClock(1_000)
    expect(() => clock.advance(-1)).toThrow(/backwards/i)
  })
})
