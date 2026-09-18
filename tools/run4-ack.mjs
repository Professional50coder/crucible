/**
 * Run 4 — GATE 5: acknowledge the deliverable ON-CHAIN, promptly.
 *
 * The model bytes are already retrieved and validated against the on-chain root
 * (runs/run4/retrieval.json), so acknowledging forfeits nothing. acknowledgeModel's
 * OWN download is what is broken on Windows; the on-chain acknowledgement is not,
 * so we drive it directly via broker.fineTuning.acknowledgeDeliverable — exactly
 * what services/orchestrator's Acknowledger does after an HTTP retrieval.
 *
 * The SDK's acknowledgeDeliverable resolves to void, so the tx hash is captured by
 * wrapping the wallet's sendTransaction.
 *
 *   node tools/run4-ack.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const SERVING = '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA'
const RPC = 'https://evmrpc-testnet.0g.ai'

const root = new URL('../', import.meta.url)
const runDir = new URL('runs/run4/', root)
const taskId = readFileSync(new URL('task-id.txt', runDir), 'utf8').trim()

// Refuse to acknowledge unless the validated bytes are actually on disk.
const retrievalFile = new URL('retrieval.json', runDir)
if (!existsSync(retrievalFile)) {
  throw new Error('runs/run4/retrieval.json missing — run run4-retrieve.mts first. Refusing to acknowledge without validated bytes.')
}
const retrieval = JSON.parse(readFileSync(retrievalFile, 'utf8'))
if (retrieval.rootMatch !== true) {
  throw new Error('retrieval.json says rootMatch=false — refusing to acknowledge unvalidated bytes.')
}
console.log(`validated bytes : ${retrieval.sizeBytes} bytes, root ${retrieval.modelRootHash}`)

const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  provider
)

const sentTx = []
const origSend = wallet.sendTransaction.bind(wallet)
wallet.sendTransaction = async (tx) => {
  const res = await origSend(tx)
  sentTx.push(res.hash)
  return res
}

const abi = [
  'function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])',
]
const serving = new ethers.Contract(SERVING, abi, provider)
const dec = new TextDecoder()

const readMine = async () => {
  const list = await serving.getDeliverables(wallet.address, PROVIDER)
  return list.find((d) => { try { return dec.decode(ethers.getBytes(d.id)) === taskId } catch { return false } })
}

let mine = await readMine()
if (!mine) throw new Error(`No on-chain deliverable for task ${taskId}`)
if (mine.acknowledged) {
  console.log('already acknowledged on-chain — nothing to do')
} else {
  const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
  const broker = await createZGComputeNetworkBroker(wallet)

  let acked = false
  for (let attempt = 1; attempt <= 5 && !acked; attempt++) {
    try {
      console.log(`acknowledgeDeliverable attempt ${attempt}...`)
      await broker.fineTuning.acknowledgeDeliverable(PROVIDER, taskId)
      acked = true
    } catch (e) {
      console.log(`  failed: ${e.message.split('\n')[0]}`)
      if (attempt < 5) await new Promise((r) => setTimeout(r, 8000 * attempt))
    }
  }
  if (!acked) throw new Error('acknowledgeDeliverable failed after retries — deliverable still UNACKNOWLEDGED; escalate.')
}

const ackTxHash = sentTx[sentTx.length - 1] ?? null
let receipt = null
if (ackTxHash) {
  receipt = await provider.getTransactionReceipt(ackTxHash)
}

// The chain is authoritative — re-read.
mine = await readMine()
console.log(`\n--- on-chain state after ---`)
console.log(`acknowledged    : ${mine.acknowledged}`)
console.log(`modelRootHash   : ${mine.modelRootHash}`)
console.log(`encryptedSecret : ${mine.encryptedSecret === '0x' ? '0x (empty)' : `${(mine.encryptedSecret.length - 2) / 2} bytes`}`)
console.log(`ack tx          : ${ackTxHash}`)
if (receipt) console.log(`ack tx block    : ${receipt.blockNumber}  gas ${receipt.gasUsed}  status ${receipt.status}`)
console.log(`explorer        : ${ackTxHash ? `https://chainscan-galileo.0g.ai/tx/${ackTxHash}` : '(no tx hash captured)'}`)

writeFileSync(new URL('ack.json', runDir), JSON.stringify({
  taskId, provider: PROVIDER,
  acknowledged: mine.acknowledged,
  modelRootHash: mine.modelRootHash,
  encryptedSecretBytes: mine.encryptedSecret === '0x' ? 0 : (mine.encryptedSecret.length - 2) / 2,
  ackTxHash,
  ackTxBlock: receipt ? receipt.blockNumber : null,
  ackTxGasUsed: receipt ? receipt.gasUsed.toString() : null,
  ackTxStatus: receipt ? receipt.status : null,
  allTx: sentTx,
  acknowledgedAt: new Date().toISOString(),
}, null, 2) + '\n')
console.log('recorded        : runs/run4/ack.json')

if (!mine.acknowledged) {
  console.error('\nWARNING: chain still reports acknowledged=false. ESCALATE.')
  process.exitCode = 1
}
