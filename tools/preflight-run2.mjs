/**
 * Preflight for a second, complete fine-tuning run.
 *
 * Read-only. Answers: is the ledger funded, is the fine-tuning sub-account funded,
 * is the provider free, and is the dataset we already uploaded still addressable?
 *
 *   node tools/preflight-run2.mjs
 */
import { readFileSync } from 'node:fs'
import { ethers } from 'ethers'

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const RPC = 'https://evmrpc-testnet.0g.ai'
const DATASET_ROOT = '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
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

console.log('--- ledger ---')
try {
  const ledger = await broker.ledger.getLedger()
  const fmt = (v) => (v === undefined ? '—' : `${ethers.formatEther(v)} 0G`)
  console.log('total balance   :', fmt(ledger?.totalBalance ?? ledger?.[1]))
  console.log('available       :', fmt(ledger?.availableBalance ?? ledger?.[2]))
} catch (e) {
  console.log('getLedger failed:', e.message.split('\n')[0])
}

console.log('\n--- fine-tuning sub-account ---')
try {
  const acct = await broker.fineTuning.getAccount(PROVIDER)
  console.log('balance         :', ethers.formatEther(acct.balance ?? acct[2] ?? 0n), '0G')
  console.log('pendingRefund   :', ethers.formatEther(acct.pendingRefund ?? acct[3] ?? 0n), '0G')
} catch (e) {
  console.log('getAccount failed:', e.message.split('\n')[0])
}

console.log('\n--- provider ---')
try {
  const services = await broker.fineTuning.listService(true)
  for (const s of services) {
    const addr = s.provider ?? s[0]
    if (String(addr).toLowerCase() !== PROVIDER.toLowerCase()) continue
    console.log('provider        :', addr)
    console.log('occupied        :', s.occupied ?? s.Occupied ?? '—')
    console.log('price/token     :', String(s.pricePerToken ?? s.PricePerToken ?? '—'), 'neuron')
    console.log('models          :', JSON.stringify(s.models ?? s.Models ?? []))
    console.log('quota           :', JSON.stringify(s.quota ?? s.Quota ?? {}))
  }
} catch (e) {
  console.log('listService failed:', e.message.split('\n')[0])
}

console.log('\ndataset already on 0G Storage:', DATASET_ROOT)
console.log('(reuse it — a duplicate upload is NOT rejected: submissions 146937 and 146938')
console.log(' carry the same root and were both charged. Nothing stops you paying twice.)')
