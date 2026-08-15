/**
 * Second fine-tuning run — the one that keeps its adapter.
 *
 * The first run (10551604-…) completed but its artifact was never retrieved, because
 * acknowledgeModel's default `downloadMethod: 'auto'` tries 0G Storage first and the
 * bundled 0g-storage-client binary is a Linux ELF shipped to a Windows host. This run
 * goes straight down the TEE path, which has no native binary.
 *
 * Creates the task only. Polling and acknowledgement are separate scripts, so a crash
 * here can never lose track of a task that is already costing money.
 *
 *   node tools/run2-create.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'
const MODEL = 'Qwen2.5-0.5B-Instruct'
// Already on 0G Storage from the first run. Re-uploading the identical file reverts
// with a bare CALL_EXCEPTION, so the root hash is reused deliberately.
const DATASET_ROOT = '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd'

const CONFIG = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 10,
}

const root = new URL('../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const runDir = new URL('runs/run2/', root)
mkdirSync(runDir, { recursive: true })
const configPath = new URL('config.json', runDir)
writeFileSync(configPath, `${JSON.stringify(CONFIG, null, 2)}\n`)

const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  new ethers.JsonRpcProvider(RPC)
)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)

const before = await broker.fineTuning.getAccount(PROVIDER)
console.log('sub-account before :', ethers.formatEther(before.balance ?? before[2] ?? 0n), '0G')

console.log(`creating task on ${PROVIDER}`)
console.log(`  model   : ${MODEL}`)
console.log(`  dataset : ${DATASET_ROOT}`)
console.log(`  config  : ${JSON.stringify(CONFIG)}`)

const taskId = await broker.fineTuning.createTask(
  PROVIDER,
  MODEL,
  DATASET_ROOT,
  new URL('config.json', runDir).pathname.replace(/^\//, '')
)

console.log(`\ntask created: ${taskId}`)
writeFileSync(new URL('task-id.txt', runDir), `${taskId}\n`)
console.log('recorded to runs/run2/task-id.txt')
console.log('\nnext: node tools/run2-watch.mjs')
