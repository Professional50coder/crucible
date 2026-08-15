/**
 * Check passport #1 for yourself. No wallet, no key, no funds, no trust in us.
 *
 *   node tools/verify-manifest.mjs [rootHash] [tokenId]
 *
 * Crucible's whole claim is that a stranger can confirm a model's lineage without
 * asking us anything. This script is that claim, executed:
 *
 *   1. Download the manifest from 0G Storage by its root hash. Nothing local is read;
 *      the bytes come off the network.
 *   2. Hash those bytes with keccak256 — the raw download, byte for byte.
 *   3. Re-canonicalize the parsed JSON and hash that too. Both hashes must agree,
 *      which proves the stored bytes are already in canonical form and that step 2
 *      was not hashing an accident of formatting.
 *   4. Ask the chain: verifyManifest(tokenId, hash). True only if the manifest is
 *      byte-for-byte what was anchored when the passport was minted.
 *   5. Ask the chain again with a deliberately corrupted hash. It must answer false —
 *      a check that cannot fail is not a check.
 *   6. Compare the manifest's own fields against the struct stored on-chain.
 *
 * The canonicalization in step 3 is implemented here, in full, rather than imported
 * from @crucible/core. It is the one place where trusting our code would defeat the
 * purpose: an independent verifier should be able to read the entire trust chain in
 * one file and reimplement it in any language. That it agrees with @crucible/core is
 * a property worth checking, not an assumption worth making.
 *
 * Requires only `ethers` and `@0gfoundation/0g-storage-ts-sdk`.
 */
import { Indexer } from '@0gfoundation/0g-storage-ts-sdk'
import { ethers } from 'ethers'

// --- 0G Galileo testnet (chain 16602) ---------------------------------------------

const RPC_URL = 'https://evmrpc-testnet.0g.ai'
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai'
// Galileo's own Storage Scan. storagescan.0g.ai is mainnet and will report "not
// found" for this root hash, which looks like data loss and is not. Its only route
// keyed by root hash is this JSON API; the human page is /submission/<txSeq>.
const STORAGE_SCAN = 'https://storagescan-galileo.0g.ai'
const storageScanByRootHash = (root) => `${STORAGE_SCAN}/api/txs?skip=0&limit=10&rootHash=${root}`

const PASSPORT_ADDRESS = '0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7'
const PASSPORT_ABI = [
  'function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash) view returns (bool)',
  'function passportOf(uint256 tokenId) view returns (tuple(bytes32 baseModelHash, bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash, bytes32 manifestRootHash, string taskId, address provider, uint64 mintedAt))',
]

/** Passport #1's manifest on 0G Storage. Override with argv[2] for any other passport. */
const DEFAULT_ROOT_HASH = '0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140'
const DEFAULT_TOKEN_ID = 1

const rootHash = process.argv[2] ?? DEFAULT_ROOT_HASH
const tokenId = Number(process.argv[3] ?? DEFAULT_TOKEN_ID)

/**
 * Canonical JSON: object keys sorted recursively by UTF-16 code unit, no whitespace,
 * `undefined` dropped. JSON has no canonical form of its own — {"a":1,"b":2} and
 * {"b":2,"a":1} are the same object and different bytes — so without a fixed rule two
 * honest parties hash identical content to different values and the scheme is noise.
 *
 * Array order is content, never sorted. Locale-aware comparison is never used: the
 * hash must not depend on the machine that computed it.
 */
function canonicalize(value) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort)
    if (typeof node !== 'object' || node === null) return node
    const out = {}
    for (const key of Object.keys(node).sort()) {
      if (node[key] === undefined) continue
      out[key] = sort(node[key])
    }
    return out
  }
  return JSON.stringify(sort(value))
}

const keccakUtf8 = (text) => ethers.keccak256(ethers.toUtf8Bytes(text))

const ok = (pass) => (pass ? 'PASS' : 'FAIL')
const line = (label, value) => console.log(`${label.padEnd(22)}: ${value}`)

async function main() {
  line('root hash', rootHash)
  line('token', `#${tokenId} on ${PASSPORT_ADDRESS}`)
  line('storage scan', storageScanByRootHash(rootHash))

  // 1. Download from 0G Storage. downloadToBlob touches no filesystem, so this runs
  //    identically in Node and in a browser.
  const indexer = new Indexer(INDEXER_URL)
  const [blob, downloadError] = await indexer.downloadToBlob(rootHash)
  if (downloadError) throw downloadError

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const text = new TextDecoder().decode(bytes)
  line('downloaded', `${bytes.length} bytes`)

  // 2. Hash exactly what came off the network.
  const downloadedHash = ethers.keccak256(bytes)

  // 3. Parse, re-canonicalize, hash again. Agreement proves the stored bytes are
  //    already canonical — that nobody has to trust our formatting.
  const manifest = JSON.parse(text)
  const canonical = canonicalize(manifest)
  const recomputedHash = keccakUtf8(canonical)
  const isCanonical = canonical === text

  console.log()
  line('keccak256(download)', downloadedHash)
  line('keccak256(canonical)', recomputedHash)
  line('bytes are canonical', `${ok(isCanonical)}${isCanonical ? '' : ' — stored bytes are not in canonical form'}`)

  // 4 & 5. Ask the chain, twice: once honestly, once with the manifest corrupted.
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const passport = new ethers.Contract(PASSPORT_ADDRESS, PASSPORT_ABI, provider)

  const tampered = { ...manifest, note: `${manifest.note ?? ''} (tampered)` }
  const tamperedHash = keccakUtf8(canonicalize(tampered))

  const realVerifies = await passport.verifyManifest(tokenId, recomputedHash)
  const tamperedVerifies = await passport.verifyManifest(tokenId, tamperedHash)

  console.log()
  line('verifyManifest(real)', `${realVerifies}   ${ok(realVerifies === true)}`)
  line('verifyManifest(fake)', `${tamperedVerifies}  ${ok(tamperedVerifies === false)}`)

  // 6. The manifest describes a run; the token stores the same facts. Cross-check them,
  //    so a manifest that verifies but describes a different task cannot slip through.
  const onChain = await passport.passportOf(tokenId)
  const fields = [
    ['baseModelHash', manifest.baseModelHash, onChain.baseModelHash],
    ['datasetRootHash', manifest.datasetRootHash, onChain.datasetRootHash],
    ['configHash', manifest.configHash, onChain.configHash],
    ['adapterRootHash', manifest.adapterRootHash, onChain.adapterRootHash],
    ['taskId', manifest.taskId, onChain.taskId],
    ['provider', manifest.provider, onChain.provider],
  ]

  console.log('\nmanifest field vs on-chain struct')
  let fieldsAgree = true
  for (const [name, fromManifest, fromChain] of fields) {
    const agrees = String(fromManifest).toLowerCase() === String(fromChain).toLowerCase()
    fieldsAgree &&= agrees
    console.log(`  ${name.padEnd(18)} ${ok(agrees)}  ${fromChain}`)
  }

  // The adapter hash is a sentinel, not a root hash: no adapter was ever retrieved for
  // this task. Say so here rather than let a reader mistake it for a stored artifact.
  const sentinel = keccakUtf8(`crucible:adapter-not-retrieved:${manifest.taskId}`)
  if (manifest.adapterRootHash?.toLowerCase() === sentinel.toLowerCase()) {
    console.log('\n  note: adapterRootHash is keccak256("crucible:adapter-not-retrieved:<taskId>").')
    console.log('        No adapter exists for this task, and the passport says so on-chain.')
  }

  // A human page for the upload, looked up after the verdict is already decided. A
  // block explorer is a convenience, not evidence: the proof above came from the
  // storage nodes and the chain, and holds whether or not this lookup succeeds.
  const seq = await fetch(storageScanByRootHash(rootHash))
    .then((r) => r.json())
    .then((body) => body?.data?.list?.at(-1)?.txSeq)
    .catch(() => null)
  if (seq) console.log(`\nbrowse it             : ${STORAGE_SCAN}/submission/${seq}`)

  const verdict = isCanonical && realVerifies === true && tamperedVerifies === false && fieldsAgree
  console.log(`\n${verdict ? 'VERIFIED' : 'NOT VERIFIED'} — passport #${tokenId}`)
  if (!verdict) process.exitCode = 1
}

main().catch((error) => {
  console.error(`\nFAILED: ${error?.message ?? error}`)
  process.exitCode = 1
})
