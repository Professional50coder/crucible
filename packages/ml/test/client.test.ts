import { describe, expect, it } from 'vitest'

import {
  ROUTER_BASE_URLS,
  fromOpenAI,
  resolveInferenceConfig,
} from '../src/eval/client.js'

describe('resolveInferenceConfig — router path', () => {
  it('uses the testnet router URL', () => {
    const config = resolveInferenceConfig({ mode: 'router', network: 'testnet', apiKey: 'k' })
    expect(config.baseURL).toBe('https://router-api-testnet.integratenetwork.work/v1')
    expect(config.baseURL).toBe(ROUTER_BASE_URLS.testnet)
  })

  it('uses the mainnet router URL', () => {
    const config = resolveInferenceConfig({ mode: 'router', network: 'mainnet', apiKey: 'k' })
    expect(config.baseURL).toBe('https://router-api.0g.ai/v1')
    expect(config.baseURL).toBe(ROUTER_BASE_URLS.mainnet)
  })

  it('carries the API key through', () => {
    const config = resolveInferenceConfig({ mode: 'router', network: 'mainnet', apiKey: 'sk-abc' })
    expect(config.apiKey).toBe('sk-abc')
  })

  it('refuses a router config with no API key', () => {
    expect(() =>
      resolveInferenceConfig({ mode: 'router', network: 'mainnet', apiKey: '' }),
    ).toThrow(/api key/i)
  })

  it('allows a baseURL override for a private router deployment', () => {
    const config = resolveInferenceConfig({
      mode: 'router',
      network: 'mainnet',
      apiKey: 'k',
      baseURL: 'https://my-router.example/v1',
    })
    expect(config.baseURL).toBe('https://my-router.example/v1')
  })
})

describe('resolveInferenceConfig — direct provider path', () => {
  it('uses the provider endpoint and the broker headers verbatim', () => {
    const config = resolveInferenceConfig({
      mode: 'direct',
      network: 'testnet',
      endpoint: 'https://abc-3082.dstack-pha-in2.phala.network/v1/proxy',
      headers: { 'X-Phala-Signature-Type': 'StandaloneApi', Address: '0xdead' },
    })

    expect(config.baseURL).toBe('https://abc-3082.dstack-pha-in2.phala.network/v1/proxy')
    expect(config.defaultHeaders).toEqual({
      'X-Phala-Signature-Type': 'StandaloneApi',
      Address: '0xdead',
    })
  })

  it('supplies a placeholder API key, because the broker headers are the real auth', () => {
    const config = resolveInferenceConfig({
      mode: 'direct',
      network: 'testnet',
      endpoint: 'https://p/v1',
      headers: {},
    })
    expect(config.apiKey.length).toBeGreaterThan(0)
  })

  it('refuses a direct config with no endpoint', () => {
    expect(() =>
      resolveInferenceConfig({ mode: 'direct', network: 'testnet', endpoint: '', headers: {} }),
    ).toThrow(/endpoint/i)
  })
})

/** A stand-in for the `openai` package's client surface — no network, no key. */
const fakeOpenAI = (
  reply: unknown,
  record: { last?: unknown; lastOptions?: unknown } = {},
) => ({
  chat: {
    completions: {
      create: async (body: unknown, opts?: unknown) => {
        record.last = body
        record.lastOptions = opts
        return reply
      },
    },
  },
})

const oneChoice = (content: string | null) => ({ choices: [{ message: { content } }] })

describe('fromOpenAI', () => {
  it('returns the first choice message content', async () => {
    const client = fromOpenAI(fakeOpenAI(oneChoice('  Paris  ')) as never)
    const output = await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'capital of France?' }],
    })
    expect(output).toBe('  Paris  ')
  })

  it('maps the request onto the OpenAI chat-completions body', async () => {
    const record: { last?: unknown } = {}
    const client = fromOpenAI(fakeOpenAI(oneChoice('ok'), record) as never)

    await client.complete({
      model: 'Qwen2.5-0.5B-Instruct',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
      maxTokens: 64,
    })

    expect(record.last).toEqual({
      model: 'Qwen2.5-0.5B-Instruct',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
      max_tokens: 64,
    })
  })

  it('omits optional fields it was not given, rather than sending undefined', async () => {
    const record: { last?: unknown } = {}
    const client = fromOpenAI(fakeOpenAI(oneChoice('ok'), record) as never)

    await client.complete({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })

    expect(Object.keys(record.last as object).sort()).toEqual(['messages', 'model'])
  })

  it('forwards the abort signal as an OpenAI request option', async () => {
    const record: { lastOptions?: unknown } = {}
    const client = fromOpenAI(fakeOpenAI(oneChoice('ok'), record) as never)
    const controller = new AbortController()

    await client.complete({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    })

    expect((record.lastOptions as { signal?: AbortSignal }).signal).toBe(controller.signal)
  })

  it('returns an empty string when the model returns null content', async () => {
    const client = fromOpenAI(fakeOpenAI(oneChoice(null)) as never)
    const output = await client.complete({ model: 'm', messages: [] })
    expect(output).toBe('')
  })

  it('throws a readable error when the response has no choices', async () => {
    const client = fromOpenAI(fakeOpenAI({ choices: [] }) as never)
    await expect(client.complete({ model: 'm', messages: [] })).rejects.toThrow(/no choices/i)
  })
})
