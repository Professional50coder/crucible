/**
 * Run 4 — GATE 6: mint the passport.
 *
 * The honest end-to-end passport the project never had. Unlike passport #1
 * (sentinel adapter) this one carries:
 *   - the REAL adapter root, read off the chain, with adapter.hashSource
 *     = 'onchain-verified' (the bytes were downloaded on this Windows host and
 *     their 0G Storage root recomputed to match the on-chain model root), and
 *   - tee.attestationVerified = true, because verifyService passed on this
 *     provider (runs/attestation-testnet.json: signer + compose match).
 *
 * The manifest is built with @crucible/core's buildManifest (the sanctioned,
 * validated API) and its provenance guard isVerifiedAdapterRoot must agree the
 * adapter root is real. The canonical bytes are uploaded to 0G Storage and their
 * keccak256 is anchored on-chain at mint, so a stranger can download the manifest,
 * hash it, and confirm verifyManifest(tokenId, hash) == true with no clone of this
 * repo and no wallet.
 *
 *   npx tsx tools/run4-mint.mts            # dry-run (no tx)
 *   npx tsx tools/run4-mint.mts --broadcast
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { Indexer, ZgFile } from '@0gfoundation/0g-storage-ts-sdk'
import { buildManifest, canonicalize, manifestHash } from '../packages/core/src/passport.ts'
import { isVerifiedAdapterRoot } from '../packages/core/src/modelcard.ts'

const BROADCAST = process.argv.includes('--broadcast')

const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const SERVING = '0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA'
const RPC = 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
const STORAGE_SCAN = 'https://storagescan-galileo.0g.ai'
const CHAIN_SCAN = 'https://chainscan-galileo.0g.ai'

const BASE_MODEL_HASH = '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7'
const DATASET_ROOT = '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd'
const TEE_SIGNER = '0x24135b4Bd964872284728F79F5f17eB874C5583A'
const PRICE_PER_TOKEN = 800000000000n

const TRAINING_CONFIG = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 10,
}

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const runDir = at('../runs/run4/')
const taskId = readFileSync(at('../runs/run4/task-id.txt'), 'utf8').trim()
const retrieval = JSON.parse(readFileSync(at('../runs/run4/retrieval.json'), 'utf8'))
const watch = JSON.parse(readFileSync(at('../runs/run4/watch.json'), 'utf8'))

const env = Object.fromEntries(
  readFileSync(at('../.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const })
)

const provider = new ethers.JsonRpcProvider(RPC)
const wallet = new ethers.Wallet(
  env.PRIVATE_KEY.startsWith('0x') ? env.PRIVATE_KEY : `0x${env.PRIVATE_KEY}`,
  provider,
)

// --- the adapter root is read off the chain, and must be acknowledged -----------
const deliverablesAbi = [
  'function getDeliverables(address,address) view returns (tuple(bytes id, bytes modelRootHash, bytes encryptedSecret, bool acknowledged)[])',
]
const serving = new ethers.Contract(SERVING, deliverablesAbi, provider)
const dec = new TextDecoder()
const mine = (await serving.getDeliverables(wallet.address, PROVIDER)).find((d: any) => {
  try { return dec.decode(ethers.getBytes(d.id)) === taskId } catch { return false }
})
if (!mine) throw new Error(`No on-chain deliverable for task ${taskId}`)
if (!mine.acknowledged) throw new Error(`Deliverable ${taskId} is acknowledged=false — refusing to mint.`)
const adapterRootHash: string = mine.modelRootHash
if (adapterRootHash.toLowerCase() !== String(retrieval.modelRootHash).toLowerCase()) {
  throw new Error(`chain adapter root ${adapterRootHash} != retrieved ${retrieval.modelRootHash}`)
}
console.log(`deliverable   : acknowledged=true`)
console.log(`adapter root  : ${adapterRootHash}   (read from chain, retrieved+validated on win32)`)

// --- fee: the settled task fee is authoritative; tokens derived from it ----------
const feeNeuron = BigInt(watch.fee)
const tokenCount = Number(feeNeuron / PRICE_PER_TOKEN)

// --- build the rich manifest via @crucible/core ---------------------------------
const createdAt = new Date().toISOString()
const manifest = buildManifest({
  network: 'testnet',
  createdAt,
  task: { id: taskId, provider: PROVIDER, state: 'UserAcknowledged' },
  base: {
    model: 'Qwen2.5-0.5B-Instruct',
    modelHash: BASE_MODEL_HASH,
    tokenizer: 'Qwen/Qwen2.5-0.5B-Instruct',
  },
  dataset: { rootHash: DATASET_ROOT, format: 'chat', exampleCount: 61, tokenCount },
  training: TRAINING_CONFIG,
  adapter: {
    rootHash: adapterRootHash,
    sizeBytes: retrieval.sizeBytes,
    hashSource: 'onchain-verified',
  },
  fee: {
    trainingNeuron: feeNeuron.toString(),
    storageReserveNeuron: '0',
    totalNeuron: feeNeuron.toString(),
  },
  tee: { signerAddress: TEE_SIGNER, acknowledged: true, attestationVerified: true },
})

if (!isVerifiedAdapterRoot(manifest)) {
  throw new Error('isVerifiedAdapterRoot(manifest) is false — the adapter provenance guard refuses this manifest.')
}
console.log('provenance    : isVerifiedAdapterRoot = true')

const canonical = canonicalize(manifest)
const manifestRootHash = manifestHash(manifest)
const configHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalize(TRAINING_CONFIG as any)))

mkdirSync(runDir, { recursive: true })
const MANIFEST_FILE = at('../runs/run4/manifest-4.json')
writeFileSync(MANIFEST_FILE, canonical, 'utf8') // canonical bytes only — no trailing newline
console.log(`manifest      : runs/run4/manifest-4.json (${Buffer.byteLength(canonical)} bytes)`)
console.log(`config hash   : ${configHash}`)
console.log(`manifest hash : ${manifestRootHash}`)

// --- deployment + duplicate lineage check ---------------------------------------
const { address } = JSON.parse(readFileSync(at('../contracts/deployments/galileo.json'), 'utf8'))
const passportAbi = JSON.parse(readFileSync(at('../contracts/abi/Passport.json'), 'utf8'))
const passportRead = new ethers.Contract(address, passportAbi, provider)
const existing = await passportRead.tokenIdForLineage(DATASET_ROOT, configHash, adapterRootHash)
if (existing !== 0n) throw new Error(`lineage already minted as passport #${existing}`)
console.log(`contract      : ${address}`)
console.log(`lineage       : free (tokenIdForLineage = 0)`)

// --- upload the canonical manifest to 0G Storage (Windows-safe SDK path) ---------
const balanceBefore = await provider.getBalance(wallet.address)
const file = await ZgFile.fromFilePath(MANIFEST_FILE)
const [tree, treeErr] = await file.merkleTree()
if (treeErr) { await file.close(); throw treeErr }
const storageRoot = tree!.rootHash()
console.log(`storage root  : ${storageRoot}`)

const indexer = new Indexer(INDEXER_URL)
let uploadTx: string | null = null
let alreadyStored = false
const locations = await indexer.getFileLocations(storageRoot).catch(() => [])
if (locations.length > 0) {
  alreadyStored = true
  await file.close()
  console.log(`upload        : already held by ${locations.length} nodes`)
} else if (!BROADCAST) {
  await file.close()
  console.log(`upload        : (dry-run) would upload`)
} else {
  try {
    const [result, uploadErr] = await indexer.upload(file, RPC, wallet)
    if (uploadErr) throw uploadErr
    uploadTx = result?.txHash ?? (result as any)?.txHashes?.[0] ?? null
    console.log(`upload tx     : ${uploadTx}`)
  } finally {
    await file.close()
  }
}

if (!BROADCAST) {
  console.log(`\ncanonical manifest:`)
  console.log(canonical)
  console.log(`\nDRY RUN — no mint sent. Re-run with --broadcast to mint + upload.`)
  process.exit(0)
}

// --- mint -----------------------------------------------------------------------
const passport = new ethers.Contract(address, passportAbi, wallet)
const tx = await passport.mint(
  wallet.address,
  {
    baseModelHash: BASE_MODEL_HASH,
    datasetRootHash: DATASET_ROOT,
    configHash,
    adapterRootHash,
    manifestRootHash,
    taskId,
    provider: PROVIDER,
    mintedAt: 0,
  },
  '',
)
console.log(`mint tx       : ${tx.hash}`)
const receipt = await tx.wait()
const tokenId = (await passportRead.totalMinted()).toString()
console.log(`\nMinted passport #${tokenId} in block ${receipt.blockNumber} (gas ${receipt.gasUsed})`)

const ok = await passportRead.verifyManifest(tokenId, manifestRootHash)
const bad = await passportRead.verifyManifest(tokenId, ethers.ZeroHash.replace(/0$/, '1'))
console.log(`verifyManifest(correct) : ${ok}`)
console.log(`verifyManifest(wrong)   : ${bad}`)

// --- stranger check: re-download from storage, hash, compare --------------------
let downloadVerify: any = null
try {
  const [blob, dlErr] = await indexer.downloadToBlob(storageRoot)
  if (dlErr) throw dlErr
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const dlHash = ethers.keccak256(bytes)
  const dlOnChain = await passportRead.verifyManifest(tokenId, dlHash)
  downloadVerify = {
    bytes: bytes.length, keccak: dlHash,
    matchesAnchor: dlHash.toLowerCase() === manifestRootHash.toLowerCase(),
    verifyManifest: dlOnChain,
  }
  console.log(`download check: ${bytes.length} bytes, keccak ${dlHash}, verifyManifest=${dlOnChain}`)
} catch (e) {
  console.log(`download check: deferred (${(e as Error).message.split('\n')[0]})`)
}

const balanceAfter = await provider.getBalance(wallet.address)
const spent = ethers.formatEther(balanceBefore - balanceAfter)

// --- records --------------------------------------------------------------------
const submissionsUrl = `${STORAGE_SCAN}/api/txs?skip=0&limit=10&rootHash=${storageRoot}`
const mintRecord = {
  tokenId, txHash: tx.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(),
  manifest, manifestRootHash, mintedAt: new Date().toISOString(),
  storage: { rootHash: storageRoot, uploadTx, alreadyStored, indexerUrl: INDEXER_URL, storageScanByRootHash: submissionsUrl },
  verifyManifestCorrect: ok, verifyManifestWrong: bad, downloadVerify,
}
writeFileSync(at('../runs/run4/mint.json'), JSON.stringify({ ...mintRecord, configHash, adapterRootHash, spent0G: spent }, null, 2) + '\n')

const mintsFile = at('../contracts/deployments/galileo-mints.json')
const mints = existsSync(mintsFile) ? JSON.parse(readFileSync(mintsFile, 'utf8')) : []
mints.push(mintRecord)
writeFileSync(mintsFile, JSON.stringify(mints, null, 2) + '\n')

console.log(`\nspent         : ${spent} 0G`)
console.log(`token         : #${tokenId}`)
console.log(`mint tx       : ${CHAIN_SCAN}/tx/${tx.hash}`)
console.log(`storage       : ${submissionsUrl}`)
console.log('recorded      : runs/run4/mint.json, contracts/deployments/galileo-mints.json')
