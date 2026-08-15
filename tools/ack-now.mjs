/**
 * Acknowledge a delivered fine-tuning task, immediately.
 *
 * Run this the moment a deliverable exists on-chain with acknowledged = false.
 * That state is where models die: the provider settles regardless, and settling an
 * unacknowledged deliverable costs 30% of the fee and the model itself.
 *
 *   node tools/ack-now.mjs <taskId>
 */
import { readFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'

const taskId = process.argv[2]
if (!taskId) throw new Error('usage: node tools/ack-now.mjs <taskId>')

const root = new URL('../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const outDir = join(process.cwd(), 'runs', `ack-${taskId.slice(0, 8)}`)
mkdirSync(outDir, { recursive: true })

const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  new ethers.JsonRpcProvider(RPC)
)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)

const stamp = () => new Date().toISOString().slice(11, 19)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`task     : ${taskId}`)
console.log(`outDir   : ${outDir}\n`)

// 'tee' first: the 0g-storage path shells out to a bundled Linux binary and ENOENTs on Windows.
const METHODS = ['tee', '0g-storage', 'auto']
let done = false

outer:
for (const method of METHODS) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`${stamp()}  acknowledgeModel via '${method}', attempt ${attempt}`)
      await broker.fineTuning.acknowledgeModel(PROVIDER, taskId, outDir, {
        downloadMethod: method,
        teeIdleTimeoutMs: 180_000,
        teeMaxRetries: 3,
      })
      console.log(`${stamp()}  SUCCESS via '${method}'`)
      done = true
      break outer
    } catch (e) {
      console.log(`${stamp()}  failed: ${e.message.split('\n')[0]}`)
      if (attempt < 3) {
        const wait = 20_000 * attempt
        console.log(`${stamp()}  retry in ${wait / 1000}s`)
        await sleep(wait)
      }
    }
  }
}

console.log('\n--- on-chain state after ---')
const abi = ['function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])']
const serving = new ethers.Contract(
  '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA',
  abi,
  new ethers.JsonRpcProvider(RPC)
)
const dec = new TextDecoder()
for (const d of await serving.getDeliverables(wallet.address, PROVIDER)) {
  let id = d.id
  try { id = dec.decode(ethers.getBytes(d.id)) } catch {}
  if (!String(id).startsWith(taskId.slice(0, 8))) continue
  console.log(`acknowledged    : ${d.acknowledged}`)
  console.log(`encryptedSecret : ${d.encryptedSecret === '0x' ? '0x (empty)' : `present, ${(d.encryptedSecret.length - 2) / 2} bytes`}`)
  console.log(`modelRootHash   : ${d.modelRootHash}`)
}

if (existsSync(outDir)) {
  const files = readdirSync(outDir)
  console.log(`\nartifacts (${files.length}):`)
  for (const f of files) console.log(`  ${f}  ${statSync(join(outDir, f)).size} bytes`)
}

if (!done) {
  console.log('\nEvery download path failed. The escape hatch releases the queue but forfeits the model:')
  console.log(`  broker.fineTuning.acknowledgeDeliverable('${PROVIDER}', '${taskId}')`)
  process.exitCode = 1
}
