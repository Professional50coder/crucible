#!/usr/bin/env node
/**
 * Read a provider's deliverables straight from the FineTuningServing contract.
 *
 * The reason this exists is written down in MISTAKES.md as the most expensive
 * error this project made: the provider's API reported `progress: Finished`, we
 * reasoned that Finished implied acknowledged, and published it. It was false —
 * the deliverable read `acknowledged: false`, the model was gone and 30% of the
 * fee had been taken. One eth_call would have disproved it.
 *
 * So: the chain is authoritative, the API's status field is a rumour. This tool
 * asks the chain.
 *
 * Read-only. No transaction, no gas, no key needed beyond deriving the address
 * to query.
 *
 *   node tools/deliverable-status.mjs                    # all deliverables
 *   node tools/deliverable-status.mjs <taskId>           # just one
 */
import { readFileSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const SERVING = '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA'
const RPC = 'https://evmrpc-testnet.0g.ai'

const wanted = process.argv[2]

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const key = env.PRIVATE_KEY
if (!key) throw new Error('PRIVATE_KEY missing from .env')
const user = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`).address

const abi = [
  'function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])',
]
const serving = new ethers.Contract(SERVING, abi, new ethers.JsonRpcProvider(RPC))

console.log(`user     : ${user}`)
console.log(`provider : ${PROVIDER}`)
console.log(`serving  : ${SERVING}\n`)

const decoder = new TextDecoder()
const deliverables = await serving.getDeliverables(user, PROVIDER)

if (deliverables.length === 0) {
  console.log('no deliverables — the queue is clear')
  process.exit(0)
}

let shown = 0
for (const [i, d] of deliverables.entries()) {
  let id = d.id
  try { id = decoder.decode(ethers.getBytes(d.id)) } catch { /* keep the raw bytes */ }
  if (wanted && !String(id).startsWith(wanted.slice(0, 8))) continue
  shown++

  const secretBytes = (d.encryptedSecret.length - 2) / 2
  console.log(`[${i}] task            : ${id}`)
  console.log(`    acknowledged    : ${d.acknowledged}`)
  console.log(`    modelRootHash   : ${d.modelRootHash}`)
  console.log(`    encryptedSecret : ${d.encryptedSecret === '0x' ? '0x (empty)' : `${secretBytes} bytes`}`)
  console.log()
}

if (wanted && shown === 0) {
  console.log(`no deliverable matching "${wanted}" — it may have settled and been cleared`)
  process.exit(1)
}
