#!/usr/bin/env node
/**
 * Run 0G's TEE attestation verification against the fine-tuning provider.
 *
 * Every passport minted so far carries `tee.attestationVerified: false`, and the
 * app says plainly that this is because `verifyService()` is never called. This
 * tool is the first half of earning that field: it calls it, and records exactly
 * what came back.
 *
 * Read-only. Sends no transaction and spends no gas — it fetches the provider's
 * attestation report, recomputes the compose hash from the event log, and checks
 * the signer address in the report against the one registered on-chain.
 *
 *   node tools/verify-attestation.mjs                 # testnet provider
 *   node tools/verify-attestation.mjs mainnet         # mainnet provider, read-only
 *
 * Writes the structured result to runs/attestation-<network>.json. Exit code 0 if
 * verification passed, 1 if it did not, 2 if it could not be run at all — a
 * failure to verify is a finding, not a crash.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { ethers } from 'ethers'

const NETWORKS = {
  testnet: { chainId: 16602, rpc: 'https://evmrpc-testnet.0g.ai', provider: '0xA02b95Aa6886b1116C4f334eDe00381511E31A09' },
  mainnet: { chainId: 16661, rpc: 'https://evmrpc.0g.ai', provider: '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d' },
}

const name = process.argv[2] ?? 'testnet'
const net = NETWORKS[name]
if (!net) {
  console.error(`unknown network "${name}" — expected testnet or mainnet`)
  process.exit(2)
}

const root = new URL('../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env', root), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  new ethers.JsonRpcProvider(net.rpc)
)

const { createZGComputeNetworkBroker } = await import('@0gfoundation/0g-compute-ts-sdk')
const broker = await createZGComputeNetworkBroker(wallet)

const outDir = new URL(`runs/attestation-${name}/`, root).pathname.replace(/^\//, '')
mkdirSync(outDir, { recursive: true })

console.log(`network  : ${name} (chain ${net.chainId})`)
console.log(`provider : ${net.provider}`)
console.log(`reports  : ${outDir}\n`)

let result
try {
  result = await broker.fineTuning.verifyService(net.provider, outDir, (step) => {
    const mark = { success: ' ok ', error: 'FAIL', warning: 'warn', step: '  > ', info: '    ' }[step.type] ?? '    '
    console.log(`${mark}  ${step.message}`)
  })
} catch (error) {
  console.log(`\nverifyService threw: ${error.message?.split('\n')[0] ?? error}`)
  console.log('That is itself the finding — record it rather than retrying blindly.')
  process.exit(2)
}

const summary = {
  network: name,
  chainId: net.chainId,
  provider: net.provider,
  success: result.success,
  teeVerifier: result.teeVerifier,
  signerVerification: result.signerVerification,
  composeVerification: result.composeVerification,
  dockerImages: result.dockerImages,
  reportsGenerated: result.reportsGenerated,
}

console.log('\n--- result ---')
console.log(`success            : ${result.success}`)
console.log(`tee verifier       : ${result.teeVerifier ?? '—'}`)
if (result.signerVerification) {
  console.log(`signer on-chain    : ${result.signerVerification.contractAddress}`)
  console.log(`signer all match   : ${result.signerVerification.allMatch}`)
  for (const m of result.signerVerification.reportAddresses ?? []) {
    console.log(`  ${m.match ? 'match  ' : 'MISMATCH'} ${m.reportType}  ${m.address}`)
  }
}
if (result.composeVerification) {
  console.log(`compose passed     : ${result.composeVerification.passed}`)
  for (const [k, v] of Object.entries(result.composeVerification.details ?? {})) {
    console.log(`  ${k}: calculated=${v.calculatedHash ?? '—'} eventLog=${v.eventLogHash ?? '—'}${v.error ? ` error=${v.error}` : ''}`)
  }
}

const outFile = new URL(`runs/attestation-${name}.json`, root).pathname.replace(/^\//, '')
writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`)
console.log(`\nrecorded to ${outFile}`)

process.exit(result.success ? 0 : 1)
