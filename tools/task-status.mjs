/**
 * What actually happened to task 10551604-2664-4516-86cf-269a62f93bfc.
 *
 * Read-only. Sends no transaction, spends no gas, changes nothing. It answers the
 * three questions the 48-hour deadline leaves open once the deadline has passed:
 *
 *   1. What state is the task in now?
 *   2. Is the deliverable still unacknowledged — i.e. is the queue locked?
 *   3. Can another task be created, or is this account stuck?
 *
 *   node tools/task-status.mjs
 */
import { readFileSync } from 'node:fs'
import { ethers } from 'ethers'

const TASK_ID = '10551604-2664-4516-86cf-269a62f93bfc'
const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const key = env.PRIVATE_KEY
if (!key) throw new Error('PRIVATE_KEY missing from .env')

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`, provider)

console.log(`wallet    : ${wallet.address}`)
console.log(`balance   : ${ethers.formatEther(await provider.getBalance(wallet.address))} 0G\n`)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)
const ft = broker.fineTuning

const show = (label, value) => console.log(`${label.padEnd(26)}: ${value}`)

try {
  const detail = await ft.getAccountWithDetail(PROVIDER)
  const [account, refunds, deliverables] = Array.isArray(detail) ? detail : [detail]
  console.log('--- fine-tuning sub-account ---')
  show('balance (neuron)', account?.balance?.toString?.() ?? String(account?.balance))
  show('pending refund', account?.pendingRefund?.toString?.() ?? '—')
  show('provider signer ack’d', account?.providerSigner ?? '—')
  const list = deliverables ?? account?.deliverables ?? []
  show('deliverables', Array.isArray(list) ? list.length : '—')
  if (Array.isArray(list)) {
    list.forEach((d, i) => {
      const acknowledged = d?.acknowledged ?? d?.[1]
      const modelRootHash = d?.modelRootHash ?? d?.[0]
      console.log(`  [${i}] acknowledged=${acknowledged}  root=${String(modelRootHash).slice(0, 22)}…`)
    })
  }
} catch (e) {
  console.log(`getAccountWithDetail failed: ${e.message.split('\n')[0]}`)
}

console.log('\n--- tasks on this provider ---')
try {
  const tasks = await ft.listTask(PROVIDER)
  for (const t of tasks) {
    console.log(
      `  ${t.id ?? t.taskID}  progress=${t.progress}  fee=${t.fee}  created=${t.createdAt ?? '—'}`
    )
  }
  if (tasks.length === 0) console.log('  (none)')
} catch (e) {
  console.log(`  listTask failed: ${e.message.split('\n')[0]}`)
}

console.log('\n--- the task in question ---')
try {
  const t = await ft.getTask(PROVIDER, TASK_ID)
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === 'object' && v !== null) continue
    show(k, String(v))
  }
} catch (e) {
  console.log(`  getTask failed: ${e.message.split('\n')[0]}`)
}

console.log('\n--- lock state ---')
try {
  const locked = await ft.getLockedTime()
  show('getLockedTime()', `${locked} s (${Number(locked) / 3600} h)`)
} catch (e) {
  console.log(`  getLockedTime failed: ${e.message.split('\n')[0]}`)
}
