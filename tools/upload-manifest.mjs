/**
 * Put passport #1's manifest on 0G Storage.
 *
 * Passport #1 anchors a manifest hash on 0G Chain, but until now the manifest that
 * hash commits to lived only in `contracts/deployments/galileo-mints.json` — on one
 * laptop. An anchor with nothing on the other end of it proves nothing: a verifier
 * can recompute a hash only if they can first obtain the bytes. This script puts
 * those bytes on 0G Storage, where anyone can fetch them by root hash.
 *
 * WHAT IS UPLOADED
 *   Exactly the canonical manifest bytes — no wrapper, no metadata, no trailing
 *   newline. keccak256 of the file as downloaded IS the hash anchored on-chain, so
 *   verification is one hash of one byte string, with nothing to unwrap first.
 *
 *   That constraint is why the manifest carries only the ten fields minted into
 *   token #1. The run's other facts (fee, TEE signer, task state) are real but were
 *   never part of the anchored commitment, so they are written to the local record
 *   file instead of into the hashed document, where adding them would break the
 *   anchor.
 *
 * WHAT IS DERIVED, NOT COPIED
 *   `configHash` and `adapterRootHash` are recomputed here from the training config
 *   and the task ID. If either derivation drifted from what was minted, the manifest
 *   hash would stop matching the chain and this script would refuse to upload.
 *
 *   `adapterRootHash` is a sentinel — keccak256("crucible:adapter-not-retrieved:<taskId>").
 *   No adapter was ever retrieved for this task, so no adapter root hash exists to
 *   put here. The sentinel is deliberately not a plausible-looking root hash.
 *
 * COSTS a small 0G Storage fee on testnet. Reads PRIVATE_KEY from the repo-root .env
 * and never prints it.
 *
 *   npm run build          # this script imports canonicalize() from @crucible/core
 *   node tools/upload-manifest.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { canonicalize, manifestHash } from '@crucible/core'
import { ethers } from 'ethers'
import { Indexer, ZgFile } from '@0gfoundation/0g-storage-ts-sdk'

// --- the 0G Galileo testnet, and the passport already minted on it ----------------

const NETWORK = 'testnet'
const CHAIN_ID = 16602
const RPC_URL = 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
// Galileo has its own Storage Scan deployment. storagescan.0g.ai is mainnet and
// reports "not found" for a testnet root hash, which reads as data loss.
//
// Its human-facing route for an upload is /submission/<txSeq> — there is no page
// keyed by root hash (its search box accepts only a sequence or an address), and
// /file/<rootHash> is a 404. The route that IS keyed by root hash is the explorer's
// own JSON API, /api/txs?rootHash=…, so both links are recorded.
const STORAGE_SCAN = 'https://storagescan-galileo.0g.ai'
const CHAIN_SCAN = 'https://chainscan-galileo.0g.ai'

const PASSPORT_ADDRESS = '0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7'
const TOKEN_ID = 1

// --- the real 2026-08-14 run ------------------------------------------------------

const TASK_ID = '10551604-2664-4516-86cf-269a62f93bfc'
const PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
const BASE_MODEL_HASH = '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7'
const DATASET_ROOT_HASH = '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd'
const NOTE = 'adapter not retrieved; acknowledgeModel failed on Windows (ENOENT) then HTTP 429'

/** The config the task actually carried, read back off the task at creation. */
const TRAINING_CONFIG = {
  learning_rate: 0.0002,
  max_steps: 10,
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
}

/**
 * Real, checkable, and outside the anchored commitment. Recorded next to the
 * manifest rather than inside it — see the header.
 */
const RUN_CONTEXT = {
  taskState: 'Finished',
  settledAt: '2026-08-14T17:19:27.516Z',
  fee: { totalNeuron: '11852800000000000', total0G: '0.0118528' },
  tee: { signerAddress: '0x24135b4Bd964872284728F79F5f17eB874C5583A', acknowledged: true },
  datasetUploadTx: '0xc38e41315c97911bda12bdea3c0387eecf70d86fbae9cf78a1fc66ff09d7da52',
  mintTx: '0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1',
  adapter: 'never retrieved — adapterRootHash in the manifest is a sentinel, not a root hash',
}

const VERIFY_MANIFEST_ABI = [
  'function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash) view returns (bool)',
  'function passportOf(uint256 tokenId) view returns (tuple(bytes32 baseModelHash, bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash, bytes32 manifestRootHash, string taskId, address provider, uint64 mintedAt))',
]

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url))
const MANIFEST_FILE = at('../runs/manifest-1.json')
const RECORD_FILE = at('../runs/manifest-1.storage.json')

/** Reads .env without pulling in a dependency. The value is used, never logged. */
function privateKeyFromEnv() {
  let raw
  try {
    raw = readFileSync(at('../.env'), 'utf8')
  } catch {
    throw new Error('No .env at the repo root. It must contain PRIVATE_KEY=<testnet key>.')
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i < 0 || trimmed.slice(0, i).trim() !== 'PRIVATE_KEY') continue
    const key = trimmed.slice(i + 1).trim()
    if (key) return key.startsWith('0x') ? key : `0x${key}`
  }
  throw new Error('PRIVATE_KEY missing from .env.')
}

/**
 * The manifest minted into passport #1, rebuilt from its inputs.
 *
 * Key order here is irrelevant — canonicalize() sorts recursively — but it is kept
 * alphabetical so a reader comparing this against the on-chain record sees the same
 * shape twice.
 */
function buildPassportOneManifest() {
  const configHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalize(TRAINING_CONFIG)))
  const adapterRootHash = ethers.keccak256(
    ethers.toUtf8Bytes(`crucible:adapter-not-retrieved:${TASK_ID}`),
  )

  return {
    adapterRootHash,
    baseModelHash: BASE_MODEL_HASH,
    chainId: CHAIN_ID,
    configHash,
    datasetRootHash: DATASET_ROOT_HASH,
    network: NETWORK,
    note: NOTE,
    provider: PROVIDER,
    taskId: TASK_ID,
    version: 1,
  }
}

/**
 * A repeat upload of byte-identical content can revert with a bare CALL_EXCEPTION —
 * the flow contract rejecting a root hash it already holds. That is a success
 * condition wearing a failure's clothes: the bytes are on 0G Storage under exactly
 * the root hash we wanted.
 *
 * Observed with @0gfoundation/0g-storage-ts-sdk 1.2.11 on 2026-08-15: re-uploading
 * this manifest did NOT revert, it submitted a second transaction for the same root
 * hash and paid the fee again. So this guard is defence, not the normal path — and
 * because CALL_EXCEPTION is also what an ordinary revert looks like, the caller
 * confirms the file is actually retrievable before believing it.
 */
/** Pass --force to upload again even when the network already holds these bytes. */
const force = process.argv.includes('--force')

/**
 * Every 0G Storage submission the Galileo explorer holds for a root hash, oldest
 * first. Best-effort: the explorer is a convenience for humans, and nothing about
 * the proof depends on it, so a failure here must not fail the upload.
 */
async function submissionsFor(rootHash) {
  try {
    const url = `${STORAGE_SCAN}/api/txs?skip=0&limit=20&rootHash=${rootHash}`
    const body = await fetch(url).then((r) => r.json())
    const list = body?.data?.list ?? []
    return list
      .map((tx) => ({
        txSeq: String(tx.txSeq),
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        dataSize: tx.dataSize,
        uploadedAt: new Date(tx.timestamp * 1000).toISOString(),
        storageScan: `${STORAGE_SCAN}/submission/${tx.txSeq}`,
      }))
      .sort((a, b) => Number(a.txSeq) - Number(b.txSeq))
  } catch {
    return []
  }
}

function isAlreadyStored(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? error}`.toLowerCase()
  return (
    text.includes('call_exception') ||
    text.includes('already exist') ||
    text.includes('duplicate') ||
    text.includes('data already')
  )
}

async function main() {
  const manifest = buildPassportOneManifest()
  const canonical = canonicalize(manifest)
  const localHash = manifestHash(manifest)

  // No trailing newline, no pretty-printing: the file must be the canonical bytes and
  // nothing else, or keccak256 of the download will not equal the anchored hash.
  mkdirSync(at('../runs'), { recursive: true })
  writeFileSync(MANIFEST_FILE, canonical, 'utf8')

  console.log(`manifest      : runs/manifest-1.json (${Buffer.byteLength(canonical)} bytes)`)
  console.log(`config hash   : ${manifest.configHash}`)
  console.log(`adapter hash  : ${manifest.adapterRootHash}   (sentinel — no adapter exists)`)
  console.log(`manifest hash : ${localHash}`)

  // Check against the chain before spending anything. Uploading a manifest that does
  // not match the anchor would publish a document that fails its own verification.
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const passport = new ethers.Contract(PASSPORT_ADDRESS, VERIFY_MANIFEST_ABI, provider)
  const anchored = (await passport.passportOf(TOKEN_ID)).manifestRootHash
  const anchorMatches = anchored.toLowerCase() === localHash.toLowerCase()

  console.log(`anchored      : ${anchored}`)
  console.log(`matches chain : ${anchorMatches}`)
  if (!anchorMatches) {
    throw new Error(
      'The rebuilt manifest does not hash to the value anchored in passport #1. ' +
        'Uploading it would publish a manifest that fails verifyManifest(). ' +
        'Reconcile the inputs above with contracts/scripts/mint-testnet-passport.js first.',
    )
  }

  const wallet = new ethers.Wallet(privateKeyFromEnv(), provider)
  const balanceBefore = await provider.getBalance(wallet.address)
  console.log(`\nwallet        : ${wallet.address}`)
  console.log(`balance       : ${ethers.formatEther(balanceBefore)} 0G`)

  // The Merkle root is computed locally, before any upload: it is a property of the
  // bytes, not something the network hands back and we have to trust.
  const file = await ZgFile.fromFilePath(MANIFEST_FILE)
  const [tree, treeErr] = await file.merkleTree()
  if (treeErr) {
    await file.close()
    throw treeErr
  }
  const rootHash = tree.rootHash()
  console.log(`storage root  : ${rootHash}`)

  const indexer = new Indexer(INDEXER_URL)
  let txHash = null
  let txSeq = null
  let alreadyStored = false

  // Re-running this script must not silently pay twice for bytes the network already
  // holds. The storage SDK does not stop it: on 2026-08-15 a second upload of this
  // exact manifest submitted a second transaction and paid the fee again.
  const locations = await indexer.getFileLocations(rootHash).catch(() => [])
  const skip = locations.length > 0 && !force

  if (skip) {
    alreadyStored = true
    await file.close()
    console.log(`upload        : skipped — already held by ${locations.length} storage nodes`)
    console.log(`                (pass --force to submit it again and pay the fee again)`)
  } else {
    try {
      const [result, uploadErr] = await indexer.upload(file, RPC_URL, wallet)
      if (uploadErr) throw uploadErr
      txHash = result?.txHash ?? result?.txHashes?.[0] ?? null
      txSeq = result?.txSeq ?? result?.txSeqs?.[0] ?? null
      console.log(`upload tx     : ${txHash ?? '(none — content was already finalized)'}`)
      console.log(`submission    : #${txSeq ?? '—'}`)
    } catch (error) {
      if (!isAlreadyStored(error)) throw error
      // Trust it only if the indexer can actually point at the file. Without this,
      // any revert would be reported as a successful upload of bytes nobody holds.
      const found = await indexer.getFileLocations(rootHash).catch(() => [])
      if (found.length === 0) throw error
      alreadyStored = true
      console.log(`upload        : already on 0G Storage at ${found.length} nodes — reusing it`)
      console.log(`                (${String(error?.message ?? error).split('\n')[0]})`)
    } finally {
      await file.close()
    }
  }

  // Every submission the explorer holds for this root hash, oldest first. Read from
  // the public explorer, not from local state, so the record can be checked against
  // the same source anyone else would use.
  const submissions = await submissionsFor(rootHash)
  if (submissions.length > 0) {
    const first = submissions[0]
    txHash ??= first.txHash
    txSeq ??= first.txSeq
    console.log(`submissions   : ${submissions.map((s) => `#${s.txSeq}`).join(', ')}`)
  }

  const balanceAfter = await provider.getBalance(wallet.address)
  const spent = ethers.formatEther(balanceBefore - balanceAfter)
  console.log(`spent         : ${spent} 0G`)

  const record = {
    tokenId: String(TOKEN_ID),
    network: NETWORK,
    chainId: CHAIN_ID,
    contract: PASSPORT_ADDRESS,
    manifestFile: 'runs/manifest-1.json',
    manifestBytes: Buffer.byteLength(canonical),
    manifestHash: localHash,
    anchoredManifestHash: anchored,
    anchorMatches,
    storage: {
      rootHash,
      uploadTx: txHash,
      txSeq: txSeq === null ? null : String(txSeq),
      alreadyStored,
      indexerUrl: INDEXER_URL,
      storageScanSubmission: txSeq === null ? null : `${STORAGE_SCAN}/submission/${txSeq}`,
      storageScanByRootHash: `${STORAGE_SCAN}/api/txs?skip=0&limit=10&rootHash=${rootHash}`,
      storageScanUploader: `${STORAGE_SCAN}/address/${wallet.address}`,
      chainScanTx: txHash ? `${CHAIN_SCAN}/tx/${txHash}` : null,
      // The full public history for these bytes. More than one entry means the file
      // was submitted more than once; every entry carries the same root hash.
      submissions,
    },
    trainingConfig: TRAINING_CONFIG,
    // Real facts from the same run that the on-chain hash does NOT cover.
    runContextNotCoveredByManifestHash: RUN_CONTEXT,
    recordedAt: new Date().toISOString(),
  }
  writeFileSync(RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8')

  console.log(`\nrecord        : runs/manifest-1.storage.json`)
  if (record.storage.storageScanSubmission) {
    console.log(`Storage Scan  : ${record.storage.storageScanSubmission}`)
  }
  console.log(`by root hash  : ${record.storage.storageScanByRootHash}`)
  if (txHash) console.log(`chain tx      : ${record.storage.chainScanTx}`)
  console.log(`\nVerify it, with no key and no clone of this file:`)
  console.log(`  node tools/verify-manifest.mjs ${rootHash}`)
}

main().catch((error) => {
  console.error(`\nFAILED: ${error?.message ?? error}`)
  process.exitCode = 1
})
