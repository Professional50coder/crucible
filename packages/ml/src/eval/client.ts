/**
 * 0G Compute inference, via the OpenAI-compatible surface.
 *
 * There are two ways to reach a model on 0G and Crucible supports both, chosen
 * by config rather than by code path:
 *
 *   router — one API key, one URL, 0G routes to a provider for you.
 *   direct — the per-provider endpoint plus the signed headers the broker mints.
 *            More moving parts, but it is the path that lets a passport name the
 *            exact provider address the eval ran against.
 *
 * `resolveInferenceConfig` is pure and fully tested. `createInferenceClient` is the
 * one function that constructs a real network client, and nothing in the test
 * suite calls it — tests inject a fake `InferenceClient` instead.
 */

import type OpenAI from 'openai'

import type { CompletionRequest, InferenceClient } from './types.js'

export type Network = 'testnet' | 'mainnet'

/** Verified in docs/FIELD_NOTES.md. Do not "tidy" these. */
export const ROUTER_BASE_URLS: Record<Network, string> = {
  testnet: 'https://router-api-testnet.integratenetwork.work/v1',
  mainnet: 'https://router-api.0g.ai/v1',
}

/**
 * The direct path authenticates with broker-signed headers, but the OpenAI client
 * refuses to construct without *an* apiKey. This placeholder is never sent as
 * meaningful credentials.
 */
const PLACEHOLDER_API_KEY = '0g-direct-provider'

export interface RouterInferenceOptions {
  mode: 'router'
  network: Network
  apiKey: string
  /** Override for a self-hosted or staging router. */
  baseURL?: string
}

export interface DirectInferenceOptions {
  mode: 'direct'
  network: Network
  /** The provider's endpoint, as reported by the broker's service listing. */
  endpoint: string
  /** Per-request headers minted by the broker (signature type, address, nonce…). */
  headers: Record<string, string>
}

export type InferenceOptions = RouterInferenceOptions | DirectInferenceOptions

export interface ResolvedInferenceConfig {
  baseURL: string
  apiKey: string
  defaultHeaders: Record<string, string>
  mode: 'router' | 'direct'
  network: Network
}

export function resolveInferenceConfig(options: InferenceOptions): ResolvedInferenceConfig {
  if (options.mode === 'router') {
    if (options.apiKey.trim() === '') {
      throw new Error(
        'resolveInferenceConfig: the router path requires an API key. ' +
          'Set one, or switch to mode "direct" with broker-signed headers.',
      )
    }

    return {
      baseURL: options.baseURL ?? ROUTER_BASE_URLS[options.network],
      apiKey: options.apiKey,
      defaultHeaders: {},
      mode: 'router',
      network: options.network,
    }
  }

  if (options.endpoint.trim() === '') {
    throw new Error(
      'resolveInferenceConfig: the direct path requires a provider endpoint ' +
        'from the broker service listing.',
    )
  }

  return {
    baseURL: options.endpoint,
    apiKey: PLACEHOLDER_API_KEY,
    defaultHeaders: { ...options.headers },
    mode: 'direct',
    network: options.network,
  }
}

/**
 * Narrow structural view of the `openai` client — only what we call. Typing against
 * this rather than the concrete class is what makes the adapter unit-testable with
 * a nine-line fake.
 */
export interface OpenAILike {
  chat: {
    completions: {
      create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>
    }
  }
}

interface ChatCompletionish {
  choices?: Array<{ message?: { content?: string | null } }>
}

/** Adapt any OpenAI-shaped client to the `InferenceClient` port. */
export function fromOpenAI(openai: OpenAILike): InferenceClient {
  return {
    async complete(request: CompletionRequest): Promise<string> {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
      }
      if (request.temperature !== undefined) body['temperature'] = request.temperature
      if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens

      const response = (await openai.chat.completions.create(
        body,
        request.signal === undefined ? undefined : { signal: request.signal },
      )) as ChatCompletionish

      const choice = response.choices?.[0]
      if (choice === undefined) {
        throw new Error(
          'Inference response contained no choices. The provider may be occupied ' +
            'or the model name may be wrong.',
        )
      }

      return choice.message?.content ?? ''
    },
  }
}

/**
 * Construct a live client against 0G Compute.
 *
 * Deliberately the only networked function in this package, and deliberately not
 * exercised by the test suite: it needs a key or a broker, and no test may.
 */
export async function createInferenceClient(
  options: InferenceOptions,
): Promise<InferenceClient> {
  const config = resolveInferenceConfig(options)

  const { default: OpenAIClient } = (await import('openai')) as unknown as {
    default: new (init: {
      baseURL: string
      apiKey: string
      defaultHeaders?: Record<string, string>
    }) => OpenAI
  }

  const client = new OpenAIClient({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    defaultHeaders: config.defaultHeaders,
  })

  return fromOpenAI(client as unknown as OpenAILike)
}
