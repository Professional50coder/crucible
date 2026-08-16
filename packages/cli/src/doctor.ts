/**
 * crucible doctor — preflight for 0G fine-tuning.
 *
 * Answers, in one command, everything the 0G CLI makes you discover across a
 * dozen steps and two failed transactions:
 *   - is there a fine-tuning provider, and is it free right now?
 *   - what will my run actually cost?
 *   - is my wallet funded enough to start?
 *
 * Provider discovery needs no wallet, so most of this works before you have
 * a single token.
 *
 * ## Why the dependencies are injected
 *
 * `doctor` used to construct its own broker and JSON-RPC provider, which made it
 * untestable: every assertion would have needed a live chain, and
 * docs/INTERFACES.md:270 forbids that. The broker factory, the balance lookup
 * and the log sink are parameters now. The default wiring in index.ts is
 * identical to the old inline code; only the seam is new.
 */
import type { NetworkConfig } from '@crucible/core'
import { estimateFee, formatOg } from '@crucible/core'
import { c, ok, bad, warn } from './format.js'

export interface ProviderInfo {
  provider: string
  url: string
  quota: string[]
  pricePerToken: bigint
  occupied: boolean
  teeSignerAcknowledged: boolean
}

/**
 * Minimal shape of the read-only broker `doctor` uses.
 *
 * Services come back as `unknown[]` rather than the SDK's `ServiceStructOutput[]`
 * because that type is an array-and-object hybrid that no plain object literal
 * can satisfy — typing it loosely here is what lets a test pass a fake without
 * reconstructing an ethers struct. `toProviderInfo` does the narrowing, exactly
 * as the original `services.map((s: Record<string, unknown>) => …)` did.
 */
export interface FineTuningLister {
  fineTuning: { listService(verbose: boolean): Promise<unknown[]> }
}

/**
 * Normalise the SDK's service structs into plain values.
 *
 * Everything arrives as an ethers struct output, so each field is coerced
 * explicitly — `pricePerToken` in particular must stay a bigint all the way to
 * `estimateFee`, which does exact integer arithmetic in neuron.
 */
export function toProviderInfo(services: unknown[]): ProviderInfo[] {
  return (services as Record<string, unknown>[]).map((s) => ({
    provider: String(s['provider']),
    url: String(s['url']),
    quota: (s['quota'] as unknown[]).map(String),
    pricePerToken: BigInt(String(s['pricePerToken'])),
    occupied: Boolean(s['occupied']),
    teeSignerAcknowledged: Boolean(s['teeSignerAcknowledged']),
  }))
}

export async function inspectNetwork(
  net: NetworkConfig,
  createBroker: (rpcUrl: string) => Promise<FineTuningLister>,
): Promise<ProviderInfo[]> {
  const broker = await createBroker(net.rpcUrl)
  const services = await broker.fineTuning.listService(true)
  return toProviderInfo(services)
}

/** The cheapest provider that is not already running someone else's task. */
export function cheapestFree(providers: ProviderInfo[]): ProviderInfo | undefined {
  return providers
    .filter((p) => !p.occupied)
    .sort((a, b) => (a.pricePerToken < b.pricePerToken ? -1 : 1))[0]
}

/** Rendered provider block plus the count of things that need the user's attention. */
export interface Section {
  lines: string[]
  problems: number
}

export function providerSection(providers: ProviderInfo[], net: NetworkConfig): Section {
  const lines: string[] = []
  let problems = 0

  if (providers.length === 0) {
    lines.push(`  ${bad} no fine-tuning providers registered on ${net.name}`)
    problems++
  }

  for (const p of providers) {
    const [cpu, mem, gpus, disk, gpu] = p.quota
    const free = p.occupied ? c.yellow('BUSY') : c.green('AVAILABLE')

    lines.push(`  ${p.occupied ? warn : ok} ${p.provider}  ${free}`)
    lines.push(c.dim(`     hardware   ${gpus}x ${gpu} · ${cpu} vCPU · ${mem} GB RAM · ${disk} GB disk`))
    lines.push(
      c.dim(
        `     price      ${p.pricePerToken} neuron/token  (${formatOg(p.pricePerToken * 1_000_000n)} 0G per 1M tokens)`,
      ),
    )
    lines.push(
      c.dim(`     TEE        ${p.teeSignerAcknowledged ? 'signer acknowledged on-chain' : 'NOT acknowledged'}`),
    )

    if (p.occupied) {
      lines.push(c.dim(`     note       tasks queue one at a time; yours will wait`))
      problems++
    }
  }

  return { lines, problems }
}

/**
 * Where the token figure came from. This distinction is the whole point of the
 * section: a number counted off the user's file and a number lifted from 0G's
 * documentation are not the same claim, and printing them identically — which
 * is what the old hardcoded `DEMO_TOKEN_COUNT = 10_000` did — told the user
 * their dataset cost something it had never been measured against.
 */
export type TokenSource =
  | { kind: 'estimated'; tokens: number; records: number; label: string }
  | { kind: 'reference'; tokens: number }

/** 0G's documented worked example: 10,000 tokens, 3 epochs. Not anyone's data. */
export const REFERENCE_TOKEN_COUNT = 10_000
export const DEFAULT_EPOCHS = 3

export function costSection(
  providers: ProviderInfo[],
  net: NetworkConfig,
  source: TokenSource,
  epochs = DEFAULT_EPOCHS,
): Section {
  const lines: string[] = []
  const cheapest = cheapestFree(providers)
  const n = source.tokens.toLocaleString('en-US')

  if (source.kind === 'estimated') {
    lines.push(
      c.bold('  ESTIMATED COST') +
        c.dim(`  (~${n} tokens over ${source.records} records x ${epochs} epochs)`),
    )
    // Named as an approximation every time it is shown. ~4 chars/token is a rule
    // of thumb, not the Qwen tokenizer (packages/ml/README.md, "Token counts are
    // estimates"); the authoritative count is the broker's calculateToken, which
    // needs a staged dataset and a provider.
    lines.push(
      c.dim(`  tokens are a ~4-chars-per-token approximation of ${source.label}, not a tokenizer count.`),
    )
    lines.push(c.dim('  the broker recounts with calculateToken before charging; expect this to differ.'))
  } else {
    lines.push(
      c.bold('  REFERENCE COST') + c.dim(`  (${n} tokens x ${epochs} epochs — 0G's documented example)`),
    )
    // Stated flatly so it cannot be mistaken for a measurement. Pass a dataset
    // and the header above changes to an estimate of that file instead.
    lines.push(
      c.dim("  this is a fixed quantity from 0G's docs, NOT your data. Pass --dataset <file.jsonl>"),
    )
    lines.push(c.dim('  to price your own file.'))
  }

  if (!cheapest) {
    lines.push(`  ${warn} no free provider — cannot price a run right now`)
    return { lines, problems: 0 }
  }

  for (const model of net.models) {
    const fee = estimateFee({
      tokenCount: source.tokens,
      epochs,
      pricePerTokenNeuron: cheapest.pricePerToken,
      model,
    })
    lines.push(
      `  ${c.cyan(model.padEnd(24))} ${fee.totalOg} 0G` +
        c.dim(`   (training ${fee.trainingOg} + storage reserve ${fee.storageReserveOg})`),
    )
  }

  return { lines, problems: 0 }
}

/** Result of looking up the configured wallet. Kept separate so tests can fake it. */
export interface WalletState {
  address: string
  /** Balance in wei/neuron. */
  balance: bigint
}

/** 0G's docs create a ledger with 3 0G; below that the user will be short. */
export const LEDGER_MINIMUM_OG = 3

export function walletSection(
  state: WalletState | undefined,
  error: string | undefined,
  formatEther: (v: bigint) => string,
): Section {
  const lines: string[] = []
  let problems = 0

  if (error !== undefined) {
    return { lines: [`  ${bad} ${error}`], problems: 1 }
  }

  if (!state) {
    return {
      lines: [`  ${warn} PRIVATE_KEY not set — provider discovery works, but you cannot train`],
      problems: 1,
    }
  }

  const balanceOg = Number(formatEther(state.balance))
  lines.push(`  ${c.dim('address')}  ${state.address}`)
  lines.push(`  ${c.dim('balance')}  ${formatEther(state.balance)} 0G`)

  if (state.balance === 0n) {
    lines.push(`  ${bad} empty. Fund it at https://faucet.0g.ai (testnet, 0.1 0G/day)`)
    problems++
  } else if (balanceOg < LEDGER_MINIMUM_OG) {
    lines.push(
      `  ${warn} below the ${LEDGER_MINIMUM_OG} 0G the docs use to create a ledger ` +
        c.dim(`(deposit --amount ${LEDGER_MINIMUM_OG})`),
    )
    problems++
  } else {
    lines.push(`  ${ok} funded enough to create a ledger`)
  }

  return { lines, problems }
}

export function verdict(problems: number): string {
  return problems === 0
    ? `  ${ok} ${c.bold('ready to train')}`
    : `  ${warn} ${problems} thing${problems === 1 ? '' : 's'} to resolve before training`
}

export interface DoctorDeps {
  createBroker: (rpcUrl: string) => Promise<FineTuningLister>
  /** Returns undefined when no key is configured — that is a warning, not an error. */
  readWallet: (net: NetworkConfig) => Promise<WalletState | undefined>
  formatEther: (v: bigint) => string
  log: (line: string) => void
}

export async function doctor(
  net: NetworkConfig,
  source: TokenSource,
  deps: DoctorDeps,
): Promise<number> {
  const { log } = deps

  log('')
  log(c.bold(`  CRUCIBLE DOCTOR`) + c.dim(`  ·  ${net.name}  ·  chain ${net.chainId}`))
  log(c.dim(`  ${'─'.repeat(64)}`))

  let problems = 0

  log('')
  log(c.bold('  FINE-TUNING PROVIDERS'))

  let providers: ProviderInfo[]
  try {
    providers = await inspectNetwork(net, deps.createBroker)
  } catch (e) {
    // Unreachable RPC is fatal for this command: every later section is either
    // priced off provider data or meaningless without it.
    log(`  ${bad} could not reach ${net.rpcUrl}`)
    log(c.dim(`     ${e instanceof Error ? e.message : String(e)}`))
    return 1
  }

  const p = providerSection(providers, net)
  for (const line of p.lines) log(line)
  problems += p.problems

  log('')
  const cost = costSection(providers, net, source)
  for (const line of cost.lines) log(line)
  problems += cost.problems

  log('')
  log(c.bold('  WALLET'))

  let wallet: WalletState | undefined
  let walletError: string | undefined
  try {
    wallet = await deps.readWallet(net)
  } catch (e) {
    walletError = e instanceof Error ? e.message : String(e)
  }

  const w = walletSection(wallet, walletError, deps.formatEther)
  for (const line of w.lines) log(line)
  problems += w.problems

  log('')
  log(c.dim(`  ${'─'.repeat(64)}`))
  log(verdict(problems))
  log('')

  return 0
}
