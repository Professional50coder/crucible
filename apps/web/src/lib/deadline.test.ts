import { describe, expect, it } from 'vitest'

import {
  ACK_WINDOW_MS,
  AUTO_ACK_MARGIN_MS,
  AUTO_ACK_SETTLE_MS,
  acknowledgeDeadline,
  autoAcknowledgeAt,
  autoAcknowledgeBackstop,
  deadlineStatus,
  missedAckPenaltyNeuron,
} from './deadline'

const HOUR = 60 * 60 * 1000
const DELIVERED = '2026-08-14T12:00:00.000Z'

describe('acknowledgeDeadline', () => {
  it('is exactly 48 hours after delivery', () => {
    expect(acknowledgeDeadline(DELIVERED).toISOString()).toBe('2026-08-16T12:00:00.000Z')
  })

  it('accepts a Date as well as an ISO string', () => {
    expect(acknowledgeDeadline(new Date(DELIVERED)).getTime()).toBe(
      acknowledgeDeadline(DELIVERED).getTime(),
    )
  })

  it('uses a 48-hour window', () => {
    expect(ACK_WINDOW_MS).toBe(48 * HOUR)
  })
})

describe('deadlineStatus', () => {
  const at = (offsetHours: number) => new Date(Date.parse(DELIVERED) + offsetHours * HOUR)

  it('reports the full window at the instant of delivery', () => {
    const status = deadlineStatus(DELIVERED, at(0))
    expect(status.remainingMs).toBe(ACK_WINDOW_MS)
    expect(status.elapsedMs).toBe(0)
    expect(status.percentRemaining).toBe(100)
    expect(status.expired).toBe(false)
  })

  it('splits the window correctly at the halfway point', () => {
    const status = deadlineStatus(DELIVERED, at(24))
    expect(status.remainingMs).toBe(24 * HOUR)
    expect(status.elapsedMs).toBe(24 * HOUR)
    expect(status.percentRemaining).toBe(50)
    expect(status.percentElapsed).toBe(50)
  })

  it('never reports negative time remaining once the window has closed', () => {
    const status = deadlineStatus(DELIVERED, at(60))
    expect(status.remainingMs).toBe(0)
    expect(status.percentRemaining).toBe(0)
    expect(status.expired).toBe(true)
    expect(status.urgency).toBe('expired')
  })

  it('escalates urgency as the window closes', () => {
    expect(deadlineStatus(DELIVERED, at(1)).urgency).toBe('safe')
    expect(deadlineStatus(DELIVERED, at(23)).urgency).toBe('safe')
    // 24 hours left
    expect(deadlineStatus(DELIVERED, at(24)).urgency).toBe('warning')
    expect(deadlineStatus(DELIVERED, at(41)).urgency).toBe('warning')
    // 6 hours left
    expect(deadlineStatus(DELIVERED, at(42)).urgency).toBe('critical')
    expect(deadlineStatus(DELIVERED, at(47.9)).urgency).toBe('critical')
    expect(deadlineStatus(DELIVERED, at(48)).urgency).toBe('expired')
  })

  it('accepts a numeric clock as well as a Date', () => {
    const fromNumber = deadlineStatus(DELIVERED, Date.parse(DELIVERED) + 6 * HOUR)
    const fromDate = deadlineStatus(DELIVERED, at(6))
    expect(fromNumber.remainingMs).toBe(fromDate.remainingMs)
  })
})

describe('auto-acknowledge scheduling', () => {
  it('attempts shortly after delivery rather than waiting out the window', () => {
    // Waiting buys nothing and gives away retry budget.
    expect(autoAcknowledgeAt(DELIVERED).getTime()).toBe(Date.parse(DELIVERED) + AUTO_ACK_SETTLE_MS)
  })

  it('allows the provider time to settle before the first attempt', () => {
    // Decrypting too early fails with "second arg must be public key".
    expect(AUTO_ACK_SETTLE_MS).toBeGreaterThanOrEqual(60_000)
  })

  it('escalates with six hours of window still left', () => {
    const backstop = autoAcknowledgeBackstop(DELIVERED)
    expect(backstop.getTime()).toBe(acknowledgeDeadline(DELIVERED).getTime() - AUTO_ACK_MARGIN_MS)
    expect(deadlineStatus(DELIVERED, backstop).remainingMs).toBe(6 * HOUR)
  })

  it('always schedules the first attempt inside the window', () => {
    expect(autoAcknowledgeAt(DELIVERED).getTime()).toBeLessThan(
      acknowledgeDeadline(DELIVERED).getTime(),
    )
  })
})

describe('missedAckPenaltyNeuron', () => {
  it('is 30% of the total fee', () => {
    expect(missedAckPenaltyNeuron('1000000000000000000')).toBe('300000000000000000')
  })

  it('uses integer arithmetic and never overflows on large amounts', () => {
    const huge = (10n ** 30n).toString()
    expect(missedAckPenaltyNeuron(huge)).toBe((3n * 10n ** 29n).toString())
  })
})
