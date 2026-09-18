/**
 * Run 4 — the honest, Windows-native end-to-end fine-tune.
 *
 * Creates ONE fine-tuning task against the dataset already on 0G Storage
 * (root 0xa5051ae7…), reusing it deliberately — a fresh upload would spawn the
 * Linux-only 0g-storage-client binary and ENOENT on this win32 host (DEFECT-01).
 *
 * Creation only. Watching, retrieval and acknowledgement are separate scripts so
 * a crash here can never lose track of a task that is already costing money.
 *
 *   node tools/run4-create.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'
const MODEL = 'Qwen2.5-0.5B-Instruct'
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

const runDir = new URL('runs/run4/', root)
mkdirSync(runDir, { recursive: true })
const configPath = new URL('config.json', runDir)
writeFileSync(configPath, `${JSON.stringify(CONFIG, null, 2)}\n`)

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  provider
)

// Capture every tx hash the SDK sends through this wallet, so we can record the
// creation transaction (createTask returns only the task id).
const sentTx = []
const origSend = wallet.sendTransaction.bind(wallet)
wallet.sendTransaction = async (tx) => {
  const res = await origSend(tx)
  sentTx.push(res.hash)
  return res
}

const balanceBefore = await provider.getBalance(wallet.address)
console.log(`wallet            : ${wallet.address}`)
console.log(`balance before    : ${ethers.formatEther(balanceBefore)} 0G`)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)

const before = await broker.fineTuning.getAccount(PROVIDER)
console.log(`sub-account before: ${ethers.formatEther(before.balance ?? before[2] ?? 0n)} 0G`)

console.log(`\ncreating task on ${PROVIDER}`)
console.log(`  model   : ${MODEL}`)
console.log(`  dataset : ${DATASET_ROOT}`)
console.log(`  config  : ${JSON.stringify(CONFIG)}`)

const taskId = await broker.fineTuning.createTask(
  PROVIDER,
  MODEL,
  DATASET_ROOT,
  new URL('config.json', runDir).pathname.replace(/^\//, '')
)

const createTxHash = sentTx[sentTx.length - 1] ?? null
console.log(`\ntask created      : ${taskId}`)
console.log(`creation tx       : ${createTxHash}`)

writeFileSync(new URL('task-id.txt', runDir), `${taskId}\n`)
const meta = {
  taskId,
  provider: PROVIDER,
  model: MODEL,
  datasetRoot: DATASET_ROOT,
  config: CONFIG,
  createTxHash,
  createTxAll: sentTx,
  createdAt: new Date().toISOString(),
  network: 'testnet',
  chainId: 16602,
}
writeFileSync(new URL('create.json', runDir), `${JSON.stringify(meta, null, 2)}\n`)
console.log('recorded          : runs/run4/task-id.txt, runs/run4/create.json')
console.log('\nnext: node tools/run4-watch.mjs')
