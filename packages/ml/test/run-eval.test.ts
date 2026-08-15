import { describe, expect, it, vi } from 'vitest'

import type { CompletionRequest, EvalExample, InferenceClient } from '../src/eval/types.js'
import { isRetryableError, runEval } from '../src/eval/run.js'

const examples = (n: number): EvalExample[] =>
  Array.from({ length: n }, (_, i) => ({ input: `question ${i}`, expected: `answer ${i}` }))

/** A fake that records calls and never touches the network. */
const fakeClient = (
  respond: (request: CompletionRequest, callIndex: number) => Promise<string> | string,
): InferenceClient & { calls: CompletionRequest[] } => {
  const calls: CompletionRequest[] = []
  return {
    calls,
    async complete(request) {
      const callIndex = calls.length
      calls.push(request)
      return respond(request, callIndex)
    },
  }
}

/** Collects the delays a retrying run asks for, without actually waiting. */
const recordingSleep = () => {
  const delays: number[] = []
  return { delays, sleep: async (ms: number) => void delays.push(ms) }
}

describe('runEval — happy path', () => {
  it('runs every example and reports full completion', async () => {
    const client = fakeClient((req) => `echo:${req.messages.at(-1)!.content}`)
    const run = await runEval({ client, model: 'tuned-1', examples: examples(5) })

    expect(run.exampleCount).toBe(5)
    expect(run.completed).toBe(5)
    expect(run.failed).toBe(0)
    expect(run.results).toHaveLength(5)
    expect(run.results.every((r) => r.ok)).toBe(true)
    expect(run.model).toBe('tuned-1')
  })

  it('keeps results in example order regardless of completion order', async () => {
    // Later examples resolve first.
    const client = fakeClient(async (req) => {
      const n = Number(req.messages.at(-1)!.content.split(' ')[1])
      await new Promise((resolve) => setTimeout(resolve, (5 - n) * 2))
      return `answer ${n}`
    })

    const run = await runEval({ client, model: 'm', examples: examples(5), concurrency: 5 })

    expect(run.results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4])
    expect(run.results.map((r) => r.output)).toEqual([
      'answer 0',
      'answer 1',
      'answer 2',
      'answer 3',
      'answer 4',
    ])
  })

  it('passes the model through to the client on every call', async () => {
    const client = fakeClient(() => 'ok')
    await runEval({ client, model: 'Qwen2.5-0.5B-Instruct', examples: examples(3) })
    expect(client.calls.every((c) => c.model === 'Qwen2.5-0.5B-Instruct')).toBe(true)
  })

  it('sends a string input as a single user message', async () => {
    const client = fakeClient(() => 'ok')
    await runEval({ client, model: 'm', examples: [{ input: 'what is 2+2?', expected: '4' }] })

    expect(client.calls[0]!.messages).toEqual([{ role: 'user', content: 'what is 2+2?' }])
  })

  it('passes a chat-message input through unchanged', async () => {
    const client = fakeClient(() => 'ok')
    const messages = [
      { role: 'system' as const, content: 'You are terse.' },
      { role: 'user' as const, content: 'hi' },
    ]
    await runEval({ client, model: 'm', examples: [{ input: messages, expected: 'hello' }] })

    expect(client.calls[0]!.messages).toEqual(messages)
  })

  it('prepends a system prompt when one is configured', async () => {
    const client = fakeClient(() => 'ok')
    await runEval({
      client,
      model: 'm',
      examples: [{ input: 'q', expected: 'a' }],
      systemPrompt: 'Answer with one word.',
    })

    expect(client.calls[0]!.messages).toEqual([
      { role: 'system', content: 'Answer with one word.' },
      { role: 'user', content: 'q' },
    ])
  })

  it('does not double up a system prompt that the example already carries', async () => {
    const client = fakeClient(() => 'ok')
    await runEval({
      client,
      model: 'm',
      examples: [
        {
          input: [
            { role: 'system' as const, content: 'Example-supplied.' },
            { role: 'user' as const, content: 'q' },
          ],
          expected: 'a',
        },
      ],
      systemPrompt: 'Config-supplied.',
    })

    const roles = client.calls[0]!.messages.map((m) => m.role)
    expect(roles.filter((r) => r === 'system')).toHaveLength(1)
    expect(client.calls[0]!.messages[0]!.content).toBe('Example-supplied.')
  })

  it('reports a duration', async () => {
    const client = fakeClient(() => 'ok')
    const run = await runEval({ client, model: 'm', examples: examples(2) })
    expect(run.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(run.durationMs)).toBe(true)
  })
})

describe('runEval — bounded concurrency', () => {
  it('never exceeds the configured concurrency', async () => {
    let inFlight = 0
    let peak = 0

    const client = fakeClient(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return 'ok'
    })

    await runEval({ client, model: 'm', examples: examples(20), concurrency: 3 })

    expect(peak).toBe(3)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('runs serially at concurrency 1', async () => {
    let inFlight = 0
    let peak = 0

    const client = fakeClient(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 2))
      inFlight -= 1
      return 'ok'
    })

    await runEval({ client, model: 'm', examples: examples(6), concurrency: 1 })
    expect(peak).toBe(1)
  })

  it('does not stall when concurrency exceeds the example count', async () => {
    const client = fakeClient(() => 'ok')
    const run = await runEval({ client, model: 'm', examples: examples(2), concurrency: 50 })
    expect(run.completed).toBe(2)
  })

  it('rejects a concurrency below 1', async () => {
    const client = fakeClient(() => 'ok')
    await expect(
      runEval({ client, model: 'm', examples: examples(2), concurrency: 0 }),
    ).rejects.toThrow(/concurrency/i)
  })
})

describe('runEval — retries', () => {
  it('retries a failing example and succeeds on a later attempt', async () => {
    let attempts = 0
    const client = fakeClient(() => {
      attempts += 1
      if (attempts < 3) throw Object.assign(new Error('boom'), { status: 500 })
      return 'recovered'
    })
    const { sleep } = recordingSleep()

    const run = await runEval({
      client,
      model: 'm',
      examples: examples(1),
      maxRetries: 3,
      sleep,
    })

    expect(run.completed).toBe(1)
    expect(run.results[0]!.output).toBe('recovered')
    expect(run.results[0]!.attempts).toBe(3)
  })

  it('backs off exponentially between attempts', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('boom'), { status: 503 })
    })
    const { delays, sleep } = recordingSleep()

    await runEval({
      client,
      model: 'm',
      examples: examples(1),
      maxRetries: 3,
      retryBaseDelayMs: 100,
      sleep,
    })

    expect(delays).toEqual([100, 200, 400])
  })

  it('caps the backoff delay', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('boom'), { status: 503 })
    })
    const { delays, sleep } = recordingSleep()

    await runEval({
      client,
      model: 'm',
      examples: examples(1),
      maxRetries: 5,
      retryBaseDelayMs: 1000,
      maxRetryDelayMs: 2500,
      sleep,
    })

    expect(delays).toEqual([1000, 2000, 2500, 2500, 2500])
  })

  it('does not retry a non-retryable error', async () => {
    let calls = 0
    const client = fakeClient(() => {
      calls += 1
      throw Object.assign(new Error('bad request'), { status: 400 })
    })
    const { delays, sleep } = recordingSleep()

    const run = await runEval({ client, model: 'm', examples: examples(1), maxRetries: 4, sleep })

    expect(calls).toBe(1)
    expect(delays).toEqual([])
    expect(run.failed).toBe(1)
  })
})

describe('isRetryableError', () => {
  it('retries rate limits, timeouts and server errors', () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504]) {
      expect(isRetryableError({ status })).toBe(true)
    }
  })

  it('does not retry client mistakes', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableError({ status })).toBe(false)
    }
  })

  it('retries an error with no status (network / DNS / socket)', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true)
  })
})

describe('runEval — partial failure is reported, never swallowed', () => {
  it('completes the run and reports which examples failed', async () => {
    const client = fakeClient((req) => {
      const n = Number(req.messages.at(-1)!.content.split(' ')[1])
      if (n % 3 === 0) throw Object.assign(new Error(`provider said no on ${n}`), { status: 400 })
      return `answer ${n}`
    })

    const run = await runEval({ client, model: 'm', examples: examples(9), maxRetries: 0 })

    expect(run.exampleCount).toBe(9)
    expect(run.completed).toBe(6)
    expect(run.failed).toBe(3)
    expect(run.failures.map((f) => f.index)).toEqual([0, 3, 6])
    expect(run.failures[0]!.error).toMatch(/provider said no on 0/)
  })

  it('keeps a placeholder result for a failed example so indices stay aligned', async () => {
    const client = fakeClient((req) => {
      if (req.messages.at(-1)!.content.endsWith('1')) {
        throw Object.assign(new Error('nope'), { status: 400 })
      }
      return 'ok'
    })

    const run = await runEval({ client, model: 'm', examples: examples(3), maxRetries: 0 })

    expect(run.results).toHaveLength(3)
    expect(run.results[1]!.ok).toBe(false)
    expect(run.results[1]!.output).toBeNull()
    expect(run.results[1]!.error).toMatch(/nope/)
    expect(run.results[0]!.ok).toBe(true)
  })

  it('reports a completion rate a caller can gate on', async () => {
    const client = fakeClient((req) =>
      req.messages.at(-1)!.content.endsWith('0') ? 'ok' : Promise.reject(new Error('x')),
    )
    const { sleep } = recordingSleep()

    const run = await runEval({ client, model: 'm', examples: examples(10), maxRetries: 0, sleep })

    expect(run.completionRate).toBeCloseTo(0.1, 10)
  })

  it('does not throw when every single example fails', async () => {
    const client = fakeClient(() => Promise.reject(new Error('total outage')))
    const { sleep } = recordingSleep()

    const run = await runEval({ client, model: 'm', examples: examples(4), maxRetries: 1, sleep })

    expect(run.completed).toBe(0)
    expect(run.failed).toBe(4)
    expect(run.completionRate).toBe(0)
  })

  it('treats a non-Error rejection as a readable failure message', async () => {
    const client = fakeClient(() => Promise.reject('just a string'))
    const run = await runEval({ client, model: 'm', examples: examples(1), maxRetries: 0 })
    expect(run.failures[0]!.error).toContain('just a string')
  })
})

describe('runEval — per-request timeout', () => {
  it('times out a hanging request and records it as a failure', async () => {
    const client = fakeClient(
      () => new Promise<string>(() => {}), // never resolves
    )

    const run = await runEval({
      client,
      model: 'm',
      examples: examples(2),
      timeoutMs: 20,
      maxRetries: 0,
      concurrency: 2,
    })

    expect(run.failed).toBe(2)
    expect(run.failures[0]!.error).toMatch(/timed out|timeout/i)
  })

  it('aborts the signal it handed the client when the timeout fires', async () => {
    const aborted: boolean[] = []
    const client = fakeClient(
      (request) =>
        new Promise<string>((_, reject) => {
          request.signal?.addEventListener('abort', () => {
            aborted.push(true)
            reject(new Error('aborted'))
          })
        }),
    )

    await runEval({ client, model: 'm', examples: examples(1), timeoutMs: 20, maxRetries: 0 })

    expect(aborted).toEqual([true])
  })

  it('does not time out a request that finishes in time', async () => {
    const client = fakeClient(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return 'fast enough'
    })

    const run = await runEval({ client, model: 'm', examples: examples(2), timeoutMs: 500 })
    expect(run.completed).toBe(2)
  })
})

describe('runEval — progress reporting', () => {
  it('calls onProgress once per settled example', async () => {
    const onProgress = vi.fn()
    const client = fakeClient(() => 'ok')

    await runEval({ client, model: 'm', examples: examples(4), concurrency: 2, onProgress })

    expect(onProgress).toHaveBeenCalledTimes(4)
    expect(onProgress).toHaveBeenLastCalledWith({ settled: 4, total: 4, failed: 0 })
  })
})
