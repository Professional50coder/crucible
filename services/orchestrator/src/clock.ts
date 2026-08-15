/**
 * Time is injected everywhere so the 48-hour deadline logic can be tested in
 * microseconds instead of days. Nothing in this service calls `Date.now()`
 * directly, and nothing schedules work with `setTimeout` against a wall clock —
 * the daemon is tick-driven, so tests advance a `ManualClock` and call `tick()`.
 */

export const SECOND = 1_000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE

export interface Clock {
  /** Milliseconds since the epoch. */
  now(): number
}

export const systemClock: Clock = {
  now: () => Date.now(),
}

/** Test clock. Deterministic, monotonic, never surprises. */
export class ManualClock implements Clock {
  #t: number

  constructor(start = 0) {
    this.#t = start
  }

  now(): number {
    return this.#t
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('ManualClock cannot move backwards')
    this.#t += ms
  }

  set(ms: number): void {
    if (ms < this.#t) throw new Error('ManualClock cannot move backwards')
    this.#t = ms
  }
}

/**
 * Drives a callback on a real interval. This is the *only* place a real timer
 * is created, and it is never constructed in tests.
 */
export class Ticker {
  #handle: ReturnType<typeof setInterval> | undefined
  readonly #intervalMs: number
  readonly #fn: () => void | Promise<void>
  #running = false

  constructor(intervalMs: number, fn: () => void | Promise<void>) {
    this.#intervalMs = intervalMs
    this.#fn = fn
  }

  start(): void {
    if (this.#handle) return
    this.#handle = setInterval(() => {
      // Never let two ticks overlap; a slow RPC must not stack up work.
      if (this.#running) return
      this.#running = true
      Promise.resolve()
        .then(() => this.#fn())
        .catch(() => undefined)
        .finally(() => {
          this.#running = false
        })
    }, this.#intervalMs)
    this.#handle.unref?.()
  }

  stop(): void {
    if (this.#handle) {
      clearInterval(this.#handle)
      this.#handle = undefined
    }
  }
}
