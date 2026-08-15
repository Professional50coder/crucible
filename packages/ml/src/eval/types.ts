/**
 * The inference port.
 *
 * Crucible talks to 0G Compute, which is OpenAI-API-compatible, so the real
 * implementation is the `openai` package with a swapped `baseURL`. Nothing in
 * the eval engine knows that. Everything depends on this interface instead,
 * which is what lets the entire test suite run with no network, no API key,
 * no private key and no funds.
 */

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface CompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** Aborted when the per-request timeout fires. Implementations should honour it. */
  signal?: AbortSignal
}

export interface InferenceClient {
  complete(request: CompletionRequest): Promise<string>
}

/**
 * One held-out test example.
 *
 * `input` is either a bare prompt string or a full message list — the latter
 * matters because 0G's recommended dataset format is chat messages, and a test
 * example lifted straight out of that file is already a message list.
 */
export interface EvalExample {
  input: string | ChatMessage[]
  expected: string
  /** Optional stable identifier, carried through to the comparison for traceability. */
  id?: string
}

export interface EvalItemResult {
  index: number
  id?: string
  input: string | ChatMessage[]
  expected: string
  /** The model's answer, or null when every attempt failed. */
  output: string | null
  ok: boolean
  /** Failure message, or null on success. Never silently dropped. */
  error: string | null
  /** How many requests this example actually cost, including retries. */
  attempts: number
  latencyMs: number
}

export interface EvalFailure {
  index: number
  error: string
  attempts: number
}

export interface EvalRun {
  model: string
  exampleCount: number
  completed: number
  failed: number
  /** completed / exampleCount, 0..1. Gate on this before trusting a comparison. */
  completionRate: number
  /** Always one entry per example, in example order, successes and failures alike. */
  results: EvalItemResult[]
  failures: EvalFailure[]
  /** Total requests issued, retries included — the real cost of the run. */
  totalAttempts: number
  durationMs: number
}
