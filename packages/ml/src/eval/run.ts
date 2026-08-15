/**
 * runEval — drive an inference client over a held-out test set.
 *
 * Three properties matter here and each is tested:
 *   1. bounded concurrency — one 0G provider serves the whole network, so an
 *      unbounded fan-out is antisocial and gets you rate-limited;
 *   2. bounded time — a hung request must not hang the whole eval;
 *   3. partial failure is REPORTED. If 12 of 40 requests died, the caller has to
 *      know, because scoring the surviving 28 and publishing that as the model's
 *      accuracy is exactly the kind of quiet fiction this product exists to stop.
 */

import type {
  ChatMessage,
  EvalExample,
  EvalFailure,
  EvalItemResult,
  EvalRun,
  InferenceClient,
} from './types.js'

export interface RunEvalOptions {
  client: InferenceClient
  model: string
  examples: readonly EvalExample[]
  /** Maximum requests in flight at once. Default 4. */
  concurrency?: number
  /** Retries AFTER the first attempt. Default 2 (so up to 3 requests per example). */
  maxRetries?: number
  /** First backoff delay in ms; doubles each retry. Default 500. */
  retryBaseDelayMs?: number
  /** Ceiling on a single backoff delay. Default 8000. */
  maxRetryDelayMs?: number
  /** Per-request timeout in ms. Default 60000. */
  timeoutMs?: number
  /** Prepended as a system message unless the example already supplies one. */
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  /** Decides whether a thrown error is worth another attempt. */
  isRetryable?: (error: unknown) => boolean
  /** Injected so tests never actually wait out a backoff. */
  sleep?: (ms: number) => Promise<void>
  /** Injected clock, for deterministic duration assertions. */
  now?: () => number
  onProgress?: (progress: { settled: number; total: number; failed: number }) => void
}

const DEFAULT_CONCURRENCY = 4
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000
const DEFAULT_TIMEOUT_MS = 60_000

/** Status codes that mean "the request was fine, the server wasn't". */
const RETRYABLE_STATUSES = new Set([408, 409, 429])

/**
 * Retry transport-level and server-side faults; never retry a request the server
 * has already told us is malformed. Retrying a 400 forty times just burns money
 * and produces the same 400.
 */
export function isRetryableError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status

  if (typeof status !== 'number') {
    // No HTTP status at all: a socket reset, DNS failure or abort. Worth a retry.
    return true
  }

  if (status >= 500) return true
  return RETRYABLE_STATUSES.has(status)
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}

/** Build the message list for one example, without ever duplicating a system turn. */
export function buildMessages(
  input: string | ChatMessage[],
  systemPrompt?: string,
): ChatMessage[] {
  const messages: ChatMessage[] =
    typeof input === 'string' ? [{ role: 'user', content: input }] : [...input]

  if (systemPrompt !== undefined && !messages.some((m) => m.role === 'system')) {
    return [{ role: 'system', content: systemPrompt }, ...messages]
  }

  return messages
}

class TimeoutError extends Error {
  readonly status = 408
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * Race the client against a timer AND abort the signal we handed it, so a client
 * that honours AbortSignal stops work immediately and one that ignores it still
 * cannot hold the run open.
 */
async function completeWithTimeout(
  client: InferenceClient,
  request: Omit<Parameters<InferenceClient['complete']>[0], 'signal'>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(timeoutMs))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      client.complete({ ...request, signal: controller.signal }),
      timeout,
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function runEval(options: RunEvalOptions): Promise<EvalRun> {
  const {
    client,
    model,
    examples,
    concurrency = DEFAULT_CONCURRENCY,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    systemPrompt,
    temperature,
    maxTokens,
    isRetryable = isRetryableError,
    sleep = realSleep,
    now = () => Date.now(),
    onProgress,
  } = options

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`runEval: concurrency must be an integer >= 1, received ${concurrency}`)
  }
  if (maxRetries < 0) {
    throw new Error(`runEval: maxRetries must be >= 0, received ${maxRetries}`)
  }

  const startedAt = now()
  const results = new Array<EvalItemResult>(examples.length)

  let settled = 0
  let failed = 0
  let totalAttempts = 0
  let nextIndex = 0

  async function runOne(index: number): Promise<void> {
    const example = examples[index]!
    const messages = buildMessages(example.input, systemPrompt)

    const request = {
      model,
      messages,
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }

    const itemStartedAt = now()
    let attempts = 0
    let lastError: unknown

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      attempts += 1
      totalAttempts += 1

      try {
        const output = await completeWithTimeout(client, request, timeoutMs)
        results[index] = {
          index,
          ...(example.id === undefined ? {} : { id: example.id }),
          input: example.input,
          expected: example.expected,
          output,
          ok: true,
          error: null,
          attempts,
          latencyMs: now() - itemStartedAt,
        }
        return
      } catch (error) {
        lastError = error

        const hasAttemptsLeft = attempt < maxRetries
        if (!hasAttemptsLeft || !isRetryable(error)) break

        const delay = Math.min(retryBaseDelayMs * 2 ** attempt, maxRetryDelayMs)
        await sleep(delay)
      }
    }

    failed += 1
    results[index] = {
      index,
      ...(example.id === undefined ? {} : { id: example.id }),
      input: example.input,
      expected: example.expected,
      output: null,
      ok: false,
      error: describeError(lastError),
      attempts,
      latencyMs: now() - itemStartedAt,
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex
      if (index >= examples.length) return
      nextIndex += 1

      await runOne(index)

      settled += 1
      onProgress?.({ settled, total: examples.length, failed })
    }
  }

  const workerCount = Math.min(concurrency, examples.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  const failures: EvalFailure[] = results
    .filter((r) => !r.ok)
    .map((r) => ({ index: r.index, error: r.error ?? 'unknown error', attempts: r.attempts }))

  const completed = examples.length - failures.length

  return {
    model,
    exampleCount: examples.length,
    completed,
    failed: failures.length,
    completionRate: examples.length === 0 ? 0 : completed / examples.length,
    results,
    failures,
    totalAttempts,
    durationMs: now() - startedAt,
  }
}
