/**
 * Watch run 2 to Delivered, then acknowledge immediately.
 *
 * This is the orchestrator's daemon behaviour, run as a script: acknowledge on
 * arrival rather than at the buzzer, always through acknowledgeModel, and never
 * through the deprecated download-then-decrypt pair that locks the queue.
 *
 * downloadMethod is forced to 'tee'. The default 'auto' tries 0G Storage first,
 * which shells out to a bundled 0g-storage-client binary that is a Linux ELF —
 * ENOENT on Windows. The TEE path is pure HTTP. It rate-limits (429), so this
 * retries with backoff rather than giving up, which is exactly what the first
 * run needed and did not have.
 *
 *   node tools/run2-watch.mjs
 */
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'
const POLL_MS = 20_000
const ACK_ATTEMPTS = 8

const root = new URL('../', import.meta.url)
const runDir = new URL('runs/run2/', root)
const taskId = readFileSync(new URL('task-id.txt', runDir), 'utf8').trim()
const outDir = new URL('adapter/', runDir)
mkdirSync(outDir, { recursive: true })

const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  new ethers.JsonRpcProvider(RPC)
)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)

const stamp = () => new Date().toISOString().slice(11, 19)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const outPath = new URL('.', outDir).pathname.replace(/^\//, '')

console.log(`watching ${taskId}`)
let last = null
let delivered = false

for (let i = 0; i < 180; i++) {
  let task
  try {
    task = await broker.fineTuning.getTask(PROVIDER, taskId)
  } catch (e) {
    console.log(`${stamp()}  getTask error: ${e.message.split('\n')[0]}`)
    await sleep(POLL_MS)
    continue
  }

  if (task.progress !== last) {
    console.log(`${stamp()}  ${last ?? '(start)'} -> ${task.progress}`)
    last = task.progress
  }

  if (task.progress === 'Failed') {
    console.log('task failed; stopping')
    break
  }

  if (!delivered && (task.progress === 'Delivered' || task.progress === 'UserAcknowledged')) {
    delivered = true
    console.log(`\n${stamp()}  Delivered. 48-hour clock has started. Acknowledging now.`)

    let acked = false
    for (let a = 1; a <= ACK_ATTEMPTS; a++) {
      try {
        await broker.fineTuning.acknowledgeModel(PROVIDER, taskId, outPath, {
          downloadMethod: 'tee',
          teeIdleTimeoutMs: 120_000,
          teeMaxRetries: 3,
        })
        console.log(`${stamp()}  acknowledgeModel succeeded on attempt ${a}`)
        acked = true
        break
      } catch (e) {
        const msg = e.message.split('\n')[0]
        const wait = Math.min(30_000 * 2 ** (a - 1), 600_000)
        console.log(`${stamp()}  attempt ${a}/${ACK_ATTEMPTS} failed: ${msg}`)
        if (a < ACK_ATTEMPTS) {
          console.log(`${stamp()}  retrying in ${wait / 1000}s`)
          await sleep(wait)
        }
      }
    }
    if (!acked) {
      console.log('\nAll acknowledge attempts failed. The escape hatch, which saves the')
      console.log('queue at the cost of the model, is:')
      console.log(`  broker.fineTuning.acknowledgeDeliverable('${PROVIDER}', '${taskId}')`)
      break
    }
  }

  if (task.progress === 'Finished') {
    console.log(`\n${stamp()}  Finished. fee = ${task.fee} neuron`)
    break
  }

  await sleep(POLL_MS)
}

if (existsSync(outDir)) {
  const walk = (dir, depth = 0) => {
    for (const name of readdirSync(dir)) {
      const p = new URL(`${name}`, dir.href.endsWith('/') ? dir : new URL(`${dir.href}/`))
      const s = statSync(p)
      console.log(`  ${'  '.repeat(depth)}${name}  ${s.isDirectory() ? '(dir)' : `${s.size} bytes`}`)
      if (s.isDirectory()) walk(new URL(`${name}/`, dir), depth + 1)
    }
  }
  console.log('\nartifacts in runs/run2/adapter:')
  try { walk(outDir) } catch (e) { console.log('  (none)') }
}
