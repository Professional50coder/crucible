/**
 * The 48-hour acknowledgement window.
 *
 * When a 0G fine-tuning task reaches `Delivered`, the user has 48 hours to call
 * `acknowledgeModel`. Miss it and you lose the adapter *and* 30% of the fee is
 * deducted. Nothing on 0G warns you — there is no notification, no dashboard.
 * Crucible's daemon starts acknowledging well inside the window and retries every
 * path 0G offers. It cannot repair a broken SDK — on Windows both of
 * `acknowledgeModel`'s download paths fail outright, which is how this project
 * lost its own first model — so what it guarantees is notice, not the artifact.
 *
 * This module is the arithmetic behind that promise, kept pure and testable
 * because getting it wrong is the difference between the product working and a
 * user losing a model.
 */

export const ACK_WINDOW_HOURS = 48
export const ACK_WINDOW_MS = ACK_WINDOW_HOURS * 60 * 60 * 1000

/** Fraction of the fee forfeited when the window is missed. */
export const MISSED_ACK_FEE_PENALTY = 0.3

/**
 * Crucible's policy is to acknowledge as soon as the adapter is retrievable, not
 * to wait. Waiting buys nothing and every hour spent waiting is an hour of
 * retries given away. This is the short settle delay before the first attempt —
 * the provider needs roughly a minute after `Delivered` before a download
 * succeeds.
 */
export const AUTO_ACK_SETTLE_MS = 2 * 60 * 1000

/**
 * The backstop. If the first attempt and its retries are still failing, this is
 * the point at which the daemon escalates and alerts, with six hours of window
 * left to fix it by hand. Nothing is ever allowed past here silently.
 */
export const AUTO_ACK_MARGIN_MS = 6 * 60 * 60 * 1000

export type DeadlineUrgency = 'safe' | 'warning' | 'critical' | 'expired'

export interface DeadlineStatus {
  /** Absolute deadline. */
  deadline: Date
  totalMs: number
  elapsedMs: number
  remainingMs: number
  /** 0–100, share of the window still available. */
  percentRemaining: number
  /** 0–100, share of the window consumed. Drives the progress bar. */
  percentElapsed: number
  expired: boolean
  urgency: DeadlineUrgency
}

/** The instant acknowledgement stops being possible. */
export function acknowledgeDeadline(deliveredAt: string | Date): Date {
  const delivered = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt)
  return new Date(delivered.getTime() + ACK_WINDOW_MS)
}

/** When the daemon makes its first acknowledgement attempt. */
export function autoAcknowledgeAt(deliveredAt: string | Date): Date {
  const delivered = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt)
  return new Date(delivered.getTime() + AUTO_ACK_SETTLE_MS)
}

/** The last moment the daemon will still act unattended before escalating. */
export function autoAcknowledgeBackstop(deliveredAt: string | Date): Date {
  return new Date(acknowledgeDeadline(deliveredAt).getTime() - AUTO_ACK_MARGIN_MS)
}

/**
 * One sentence stating the policy, rendered next to the countdown.
 *
 * Deliberately does not promise the model back. On 2026-08-14 both of
 * `acknowledgeModel`'s download paths failed on Windows — the 0G Storage client
 * is a Linux binary, and the TEE path dies at zero bytes — and the deliverable
 * went unacknowledged, which cost the model and 30% of the fee. What Crucible
 * can honestly claim is that it tries every path, keeps trying, and tells you
 * while there is still time to act instead of letting the window close in
 * silence. Claiming more than that here would be contradicted by this project's
 * own first run.
 */
export const AUTO_ACK_POLICY =
  'Crucible starts acknowledging about two minutes after delivery and retries every download ' +
  'path 0G offers. If they are all still failing six hours before the deadline it escalates ' +
  'rather than letting the window close quietly — and if the queue is already locked, ' +
  'acknowledgeDeliverable releases it.'

function urgencyFor(remainingMs: number): DeadlineUrgency {
  if (remainingMs <= 0) return 'expired'
  if (remainingMs <= 6 * 60 * 60 * 1000) return 'critical'
  if (remainingMs <= 24 * 60 * 60 * 1000) return 'warning'
  return 'safe'
}

export function deadlineStatus(
  deliveredAt: string | Date,
  now: Date | number = new Date(),
): DeadlineStatus {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const deadline = acknowledgeDeadline(deliveredAt)

  const remainingMs = Math.max(0, deadline.getTime() - nowMs)
  const elapsedMs = Math.min(ACK_WINDOW_MS, Math.max(0, ACK_WINDOW_MS - remainingMs))
  const percentRemaining = (remainingMs / ACK_WINDOW_MS) * 100

  return {
    deadline,
    totalMs: ACK_WINDOW_MS,
    elapsedMs,
    remainingMs,
    percentRemaining,
    percentElapsed: 100 - percentRemaining,
    expired: remainingMs <= 0,
    urgency: urgencyFor(remainingMs),
  }
}

/**
 * What the user forfeits by missing the window, in neuron. Rendered next to the
 * countdown so the stake is concrete rather than abstract.
 */
export function missedAckPenaltyNeuron(totalNeuron: string): string {
  const total = BigInt(totalNeuron)
  // 30% with integer arithmetic; bigint has no fractions.
  return ((total * 30n) / 100n).toString()
}
