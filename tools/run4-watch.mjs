/**
 * Watch run 4 to Delivered. Does NOT acknowledge — that path (the SDK's
 * acknowledgeModel) is broken on Windows. Retrieval and acknowledgement happen
 * in run4-retrieve.mts and run4-ack.mjs, which use the Windows-safe HTTP path.
 *
 *   node tools/run4-watch.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'
const POLL_MS = 15_000

const root = new URL('../', import.meta.url)
const runDir = new URL('runs/run4/', root)
const taskId = readFileSync(new URL('task-id.txt', runDir), 'utf8').trim()

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

console.log(`watching ${taskId}`)
let last = null
const transitions = []

for (let i = 0; i < 200; i++) {
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
    transitions.push({ at: new Date().toISOString(), progress: task.progress })
    last = task.progress
  }

  if (task.progress === 'Failed') {
    console.log('task failed; stopping')
    break
  }

  if (task.progress === 'Delivered' || task.progress === 'UserAcknowledged' || task.progress === 'Finished') {
    console.log(`\n${stamp()}  reached ${task.progress}. 48-hour clock started at delivery.`)
    writeFileSync(
      new URL('watch.json', runDir),
      `${JSON.stringify({ taskId, provider: PROVIDER, finalProgress: task.progress, fee: String(task.fee ?? ''), transitions, watchedAt: new Date().toISOString() }, null, 2)}\n`
    )
    console.log('recorded runs/run4/watch.json')
    console.log('\nnext: npx tsx tools/run4-retrieve.mts   then   node tools/run4-ack.mjs')
    break
  }

  await sleep(POLL_MS)
}
