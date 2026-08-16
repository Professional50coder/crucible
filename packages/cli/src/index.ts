#!/usr/bin/env tsx
/**
 * crucible — the terminal front end for @crucible/core.
 *
 * This file is wiring only: parse argv, read files, construct the real broker
 * and wallet, print. Every rule and every decision lives in a module that can be
 * tested without a network (see doctor.ts, commands.ts, cli.ts). The split
 * exists because this package previously had one command and no tests, and the
 * untestable part was exactly the part that touched money.
 */
import { createZGComputeNetworkReadOnlyBroker } from '@0gfoundation/0g-compute-ts-sdk'
import { networkFor, type NetworkConfig } from '@crucible/core'
import { JsonRpcProvider, Wallet, formatEther } from 'ethers'
import dotenv from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { parseArgs, USAGE } from './cli.js'
import { configCommand, convertCommand, validateCommand, type CommandResult } from './commands.js'
import { doctor, REFERENCE_TOKEN_COUNT, type TokenSource, type WalletState } from './doctor.js'
import { bad } from './format.js'
import { estimateTokenCount, parseJsonlLoosely } from './tokens.js'

// The .env lives at the monorepo root, not beside this package.
const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../../.env') })

function read(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`  ${bad} cannot read ${file}`)
    console.error(`     ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}

function report(result: CommandResult): void {
  for (const line of result.lines) console.error(line)
}

/**
 * Token figure for the cost section.
 *
 * With a dataset, count it and label the result an estimate. Without one, fall
 * back to 0G's documented 10,000-token example — which `costSection` prints
 * under a different heading precisely so it is not mistaken for a measurement
 * of anything the user owns.
 */
function tokenSource(dataset: string | undefined): TokenSource {
  if (dataset === undefined) return { kind: 'reference', tokens: REFERENCE_TOKEN_COUNT }

  const records = parseJsonlLoosely(read(dataset))
  return {
    kind: 'estimated',
    tokens: estimateTokenCount(records),
    records: records.length,
    label: path.basename(dataset),
  }
}

async function readWallet(net: NetworkConfig): Promise<WalletState | undefined> {
  const key = process.env['PRIVATE_KEY']
  if (!key) return undefined

  const rpc = new JsonRpcProvider(net.rpcUrl)
  const wallet = new Wallet(key, rpc)
  return { address: wallet.address, balance: await rpc.getBalance(wallet.address) }
}

const command = parseArgs(process.argv.slice(2), process.env['ZG_NETWORK'] ?? 'testnet')

switch (command.kind) {
  case 'help': {
    console.log(USAGE)
    process.exit(0)
    break
  }

  case 'error': {
    console.error(command.message)
    console.error()
    console.error(USAGE)
    process.exit(1)
    break
  }

  case 'validate': {
    const result = validateCommand(read(command.file), path.basename(command.file))
    report(result)
    process.exit(result.code)
    break
  }

  case 'config': {
    const result = configCommand(read(command.file), path.basename(command.file))
    report(result)
    process.exit(result.code)
    break
  }

  case 'convert': {
    const result = convertCommand(read(command.file), command.to, path.basename(command.file))
    report(result)

    // Status goes to stderr, the dataset to stdout, so `crucible convert x --to
    // chat > y.jsonl` produces a clean file rather than one with a report in it.
    if (result.output !== undefined) {
      if (command.out !== undefined) {
        writeFileSync(command.out, result.output, 'utf8')
        console.error(`  wrote ${command.out}`)
      } else {
        process.stdout.write(result.output)
      }
    }

    process.exit(result.code)
    break
  }

  case 'doctor': {
    const code = await doctor(networkFor(command.network), tokenSource(command.dataset), {
      createBroker: (rpcUrl) => createZGComputeNetworkReadOnlyBroker(rpcUrl),
      readWallet,
      formatEther,
      log: (line) => console.log(line),
    })
    process.exit(code)
  }
}
