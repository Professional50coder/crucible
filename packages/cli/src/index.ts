#!/usr/bin/env tsx
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
 */
import { createZGComputeNetworkReadOnlyBroker } from '@0gfoundation/0g-compute-ts-sdk'
import { estimateFee, formatOg, networkFor, type NetworkConfig } from '@crucible/core'
import { JsonRpcProvider, Wallet, formatEther } from 'ethers'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The .env lives at the monorepo root, not beside this package.
const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../../.env') })

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
}

const ok = c.green('✓')
const bad = c.red('✗')
const warn = c.yellow('!')

/** Estimated tokens for the demo dataset; the broker counts the real figure. */
const DEMO_TOKEN_COUNT = 10_000
const DEMO_EPOCHS = 3

interface ProviderInfo {
  provider: string
  url: string
  quota: string[]
  pricePerToken: bigint
  occupied: boolean
  teeSignerAcknowledged: boolean
}

async function inspectNetwork(net: NetworkConfig): Promise<ProviderInfo[]> {
  const broker = await createZGComputeNetworkReadOnlyBroker(net.rpcUrl)
  const services = await broker.fineTuning.listService(true)

  return services.map((s: Record<string, unknown>) => ({
    provider: String(s['provider']),
    url: String(s['url']),
    quota: (s['quota'] as unknown[]).map(String),
    pricePerToken: BigInt(String(s['pricePerToken'])),
    occupied: Boolean(s['occupied']),
    teeSignerAcknowledged: Boolean(s['teeSignerAcknowledged']),
  }))
}

async function doctor(networkName: string): Promise<number> {
  const net = networkFor(networkName)

  console.log()
  console.log(c.bold(`  CRUCIBLE DOCTOR`) + c.dim(`  ·  ${net.name}  ·  chain ${net.chainId}`))
  console.log(c.dim(`  ${'─'.repeat(64)}`))

  let problems = 0

  // ── Providers ──────────────────────────────────────────────────────────
  console.log()
  console.log(c.bold('  FINE-TUNING PROVIDERS'))

  let providers: ProviderInfo[] = []
  try {
    providers = await inspectNetwork(net)
  } catch (e) {
    console.log(`  ${bad} could not reach ${net.rpcUrl}`)
    console.log(c.dim(`     ${e instanceof Error ? e.message : String(e)}`))
    return 1
  }

  if (providers.length === 0) {
    console.log(`  ${bad} no fine-tuning providers registered on ${net.name}`)
    problems++
  }

  for (const p of providers) {
    const [cpu, mem, gpus, disk, gpu] = p.quota
    const free = p.occupied ? c.yellow('BUSY') : c.green('AVAILABLE')

    console.log(`  ${p.occupied ? warn : ok} ${p.provider}  ${free}`)
    console.log(c.dim(`     hardware   ${gpus}x ${gpu} · ${cpu} vCPU · ${mem} GB RAM · ${disk} GB disk`))
    console.log(c.dim(`     price      ${p.pricePerToken} neuron/token  (${formatOg(p.pricePerToken * 1_000_000n)} 0G per 1M tokens)`))
    console.log(
      c.dim(`     TEE        ${p.teeSignerAcknowledged ? 'signer acknowledged on-chain' : 'NOT acknowledged'}`),
    )

    if (p.occupied) {
      console.log(c.dim(`     note       tasks queue one at a time; yours will wait`))
      problems++
    }
  }

  // ── Cost ───────────────────────────────────────────────────────────────
  const cheapest = providers
    .filter((p) => !p.occupied)
    .sort((a, b) => (a.pricePerToken < b.pricePerToken ? -1 : 1))[0]

  console.log()
  console.log(c.bold('  ESTIMATED COST') + c.dim(`  (${DEMO_TOKEN_COUNT} tokens x ${DEMO_EPOCHS} epochs)`))

  if (cheapest) {
    for (const model of net.models) {
      const fee = estimateFee({
        tokenCount: DEMO_TOKEN_COUNT,
        epochs: DEMO_EPOCHS,
        pricePerTokenNeuron: cheapest.pricePerToken,
        model,
      })
      console.log(
        `  ${c.cyan(model.padEnd(24))} ${fee.totalOg} 0G` +
          c.dim(`   (training ${fee.trainingOg} + storage reserve ${fee.storageReserveOg})`),
      )
    }
  } else {
    console.log(`  ${warn} no free provider — cannot price a run right now`)
  }

  // ── Wallet ─────────────────────────────────────────────────────────────
  console.log()
  console.log(c.bold('  WALLET'))

  const key = process.env['PRIVATE_KEY']
  if (!key) {
    console.log(`  ${warn} PRIVATE_KEY not set — provider discovery works, but you cannot train`)
    problems++
  } else {
    try {
      const rpc = new JsonRpcProvider(net.rpcUrl)
      const wallet = new Wallet(key, rpc)
      const balance = await rpc.getBalance(wallet.address)
      const balanceOg = Number(formatEther(balance))

      console.log(`  ${c.dim('address')}  ${wallet.address}`)
      console.log(`  ${c.dim('balance')}  ${formatEther(balance)} 0G`)

      if (balance === 0n) {
        console.log(`  ${bad} empty. Fund it at https://faucet.0g.ai (testnet, 0.1 0G/day)`)
        problems++
      } else if (balanceOg < 3) {
        console.log(
          `  ${warn} below the 3 0G the docs use to create a ledger ` +
            c.dim(`(deposit --amount 3)`),
        )
        problems++
      } else {
        console.log(`  ${ok} funded enough to create a ledger`)
      }
    } catch (e) {
      console.log(`  ${bad} ${e instanceof Error ? e.message : String(e)}`)
      problems++
    }
  }

  console.log()
  console.log(c.dim(`  ${'─'.repeat(64)}`))
  console.log(
    problems === 0
      ? `  ${ok} ${c.bold('ready to train')}`
      : `  ${warn} ${problems} thing${problems === 1 ? '' : 's'} to resolve before training`,
  )
  console.log()

  return 0
}

const [command = 'doctor', networkArg = process.env['ZG_NETWORK'] ?? 'testnet'] =
  process.argv.slice(2)

if (command !== 'doctor') {
  console.error(`Unknown command "${command}". Available: doctor [testnet|mainnet]`)
  process.exit(1)
}

process.exit(await doctor(networkArg))
