/**
 * Register the Crucible Model Passport in the live ERC-8004 Identity Registry on 0G.
 *
 *   node tools/erc8004-register.mjs [--network galileo|mainnet] [--dry-run] [--uri <url>]
 *
 * This is option (b) from docs/ERC8004.md, executed rather than described. It does the
 * one thing that document says is real: it takes the Model Passport's manifest — already
 * anchored on 0G Storage and on Crucible's own Passport.sol — and *registers* it in the
 * ERC-8004 Identity Registry that 0G ships, so the lineage becomes discoverable to any
 * ERC-8004 indexer on the chain.
 *
 * Read docs/ERC8004.md before trusting a word this prints. The honest framing is fixed:
 *
 *   - This REGISTERS. It does not VERIFY. Anyone who can pay gas can register; a row in
 *     the Identity Registry attests to nothing but that someone did.
 *   - It registers a MODEL ARTIFACT as an AGENT. That is a category claim (a LoRA adapter
 *     is not an agent) which we make deliberately and label as such — see §3 of the doc.
 *   - The registry is an EIP-1967 UPGRADEABLE PROXY whose upgrade admin we have not
 *     identified. The code answering these calls can be replaced by someone we cannot name.
 *   - Crucible is a USER of these registries, not an implementation of ERC-8004. Nothing
 *     here makes anything "ERC-8004 compliant".
 *
 * The ABI is built against the DEPLOYED bytecode, not the EIP text: on the Galileo
 * identity registry getAgentURI / getIdentityRegistry / totalSupply all revert, so we do
 * not call them. See tools/erc8004-probe.mjs for the live response/revert survey.
 *
 * The key is loaded from .env via dotenv. It is never printed and never hardcoded.
 * Testnet only: broadcasting is refused on mainnet even though its address is known.
 *
 * Requires only `ethers` (v6, matching the repo's other tools) and `dotenv`.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { ethers } from 'ethers'

// --- Networks -------------------------------------------------------------------------
// The mainnet row exists so the --network flag can name it, and so a reader can see the
// address. Broadcasting to it is refused below (TESTNET ONLY). Addresses were read off
// the live chains on 2026-08-16 — see docs/ERC8004.md §2.
const NETWORKS = {
  galileo: {
    label: '0G-Galileo-Testnet',
    rpcUrl: process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai',
    chainId: 16602,
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    explorer: 'https://chainscan-galileo.0g.ai',
    // The funded testnet dev wallet. Preflight asserts the signer is exactly this.
    expectedDeployer: '0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF',
    broadcast: true,
  },
  mainnet: {
    label: '0G-Aristotle-Mainnet',
    rpcUrl: 'https://evmrpc.0g.ai',
    chainId: 16661,
    identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    explorer: 'https://chainscan.0g.ai',
    expectedDeployer: null,
    broadcast: false, // hard guard: this tool never writes to mainnet
  },
}

// Passport #1's manifest on 0G Storage (submission 146937). The manifest URI is what we
// register as the agentURI; every lineage field below is read back out of these bytes,
// not hardcoded, so the record and the manifest cannot silently disagree.
const DEFAULT_MANIFEST_URI =
  'https://indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140'

// ABI = only what the deployed bytecode actually answers (probe.mjs proved these respond).
const IDENTITY_ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  // Events, for pulling agentId out of the register receipt.
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]

// --- CLI ------------------------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const networkName = opt('--network', 'galileo')
const dryRun = flag('--dry-run')
const manifestUri = opt('--uri', DEFAULT_MANIFEST_URI)

const pad = (s) => String(s).padEnd(24)
const line = (label, value) => console.log(`${pad(label)}: ${value}`)
const rule = () => console.log('-'.repeat(72))

/** Metadata keys written to the Identity Registry, and how each maps to the manifest. */
const lineageKeys = (manifest, manifestRootHash) => [
  ['crucible.baseModelHash', manifest.baseModelHash],
  ['crucible.datasetRootHash', manifest.datasetRootHash],
  ['crucible.adapterRootHash', manifest.adapterRootHash],
  ['crucible.manifestRootHash', manifestRootHash],
  ['crucible.taskId', manifest.taskId],
  ['crucible.taskProvider', manifest.provider],
]

// Values are stored as UTF-8 bytes of the exact manifest string. One rule for every key,
// so read-back is trivially checkable: toUtf8String(getMetadata(id,key)) === the field.
const encodeValue = (value) => ethers.toUtf8Bytes(String(value))

async function main() {
  const net = NETWORKS[networkName]
  if (!net) throw new Error(`Unknown --network "${networkName}". Use galileo or mainnet.`)

  line('network', `${net.label} (chainId ${net.chainId})`)
  line('identity registry', net.identityRegistry)
  line('manifest URI', manifestUri)
  line('mode', dryRun ? 'DRY RUN (preflight only, no broadcast)' : 'EXECUTE')
  rule()

  if (!net.broadcast && !dryRun) {
    throw new Error(
      `Refusing to broadcast on ${net.label}. This tool is testnet-only by policy ` +
        `(see docs/ERC8004.md). Re-run with --network galileo, or add --dry-run to inspect.`,
    )
  }

  // --- Fetch the manifest and derive every field from it -----------------------------
  const res = await fetch(manifestUri)
  if (!res.ok) throw new Error(`Manifest fetch failed: HTTP ${res.status} for ${manifestUri}`)
  const manifestText = await res.text()
  const manifest = JSON.parse(manifestText)
  // The manifestRootHash is the keccak256 of the stored bytes — the value anchored on
  // Passport.sol. Computed here, never taken on faith.
  const manifestRootHash = ethers.keccak256(ethers.toUtf8Bytes(manifestText))
  line('manifest bytes', manifestText.length)
  line('manifestRootHash', manifestRootHash)
  line('task id', manifest.taskId)
  line('provider', manifest.provider)
  rule()

  // --- Connect ------------------------------------------------------------------------
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY missing from .env')
  const provider = new ethers.JsonRpcProvider(net.rpcUrl)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
  const registry = new ethers.Contract(net.identityRegistry, IDENTITY_ABI, wallet)

  // ================= PREFLIGHT — nothing is broadcast until all of this passes ========
  console.log('PREFLIGHT')

  // 1. chainId must be exactly what this network claims.
  const chain = await provider.getNetwork()
  const chainOk = Number(chain.chainId) === net.chainId
  line('  chainId', `${chain.chainId} ${chainOk ? 'OK' : `MISMATCH (want ${net.chainId})`}`)
  if (!chainOk) throw new Error(`Connected chainId ${chain.chainId} != expected ${net.chainId}`)

  // 2. the signer must be the expected funded wallet, with a non-zero balance.
  const deployer = await wallet.getAddress()
  line('  deployer', deployer)
  if (net.expectedDeployer && deployer.toLowerCase() !== net.expectedDeployer.toLowerCase()) {
    throw new Error(`Signer ${deployer} is not the expected wallet ${net.expectedDeployer}`)
  }
  const balance = await provider.getBalance(deployer)
  line('  balance', `${ethers.formatEther(balance)} OG`)
  if (balance === 0n) throw new Error('Deployer balance is zero; fund the wallet first.')

  // 3. the registry looks like the one we expect.
  line('  registry', `${await registry.name()} / ${await registry.symbol()}`)

  // 4. statically simulate register(string) to confirm it is permissionless BEFORE any
  //    broadcast. A revert here means we stop and report — we never send blind.
  let simulatedId
  try {
    simulatedId = await registry.register.staticCall(manifestUri)
    line('  register sim', `OK -> would mint agentId ${simulatedId}`)
  } catch (e) {
    throw new Error(`register(string) simulation reverted; NOT broadcasting. ${e.shortMessage || e.message}`)
  }
  rule()

  if (dryRun) {
    console.log('DRY RUN complete — preflight passed, nothing broadcast.')
    return
  }

  // ================= EXECUTE ==========================================================
  console.log('EXECUTE — register()')
  const regTx = await registry.register(manifestUri)
  line('  tx sent', regTx.hash)
  const regRcpt = await regTx.wait()
  line('  block', regRcpt.blockNumber)
  line('  gas used', regRcpt.gasUsed.toString())

  // Pull agentId out of the receipt: prefer the Registered event, fall back to the
  // ERC-721 Transfer mint (from == zero).
  let agentId
  for (const log of regRcpt.logs) {
    try {
      const parsed = registry.interface.parseLog(log)
      if (parsed?.name === 'Registered') {
        agentId = parsed.args.agentId
        break
      }
      if (parsed?.name === 'Transfer' && parsed.args.from === ethers.ZeroAddress) {
        agentId = parsed.args.tokenId
      }
    } catch {
      /* not one of ours */
    }
  }
  if (agentId === undefined) throw new Error('Could not determine agentId from register receipt')
  agentId = BigInt(agentId)
  line('  agentId', agentId.toString())
  line('  explorer', `${net.explorer}/tx/${regTx.hash}`)
  rule()

  // --- setMetadata for each lineage field --------------------------------------------
  console.log('EXECUTE — setMetadata (lineage)')
  const metadataWrites = []
  for (const [key, value] of lineageKeys(manifest, manifestRootHash)) {
    const bytes = encodeValue(value)
    // Simulate first — we own the token now, so this also confirms access is allowed.
    await registry.setMetadata.staticCall(agentId, key, bytes)
    const tx = await registry.setMetadata(agentId, key, bytes)
    const rcpt = await tx.wait()
    line(`  ${key}`, `${tx.hash} (block ${rcpt.blockNumber})`)
    metadataWrites.push({ key, value: String(value), txHash: tx.hash, blockNumber: rcpt.blockNumber })
  }
  rule()

  // --- VERIFY by reading everything back ---------------------------------------------
  console.log('VERIFY (read-back)')
  const owner = await registry.ownerOf(agentId)
  const uri = await registry.tokenURI(agentId)
  const ownerOk = owner.toLowerCase() === deployer.toLowerCase()
  const uriOk = uri === manifestUri
  line('  ownerOf', `${owner} ${ownerOk ? 'OK' : 'MISMATCH'}`)
  line('  tokenURI', `${uriOk ? 'OK' : 'MISMATCH'} ${uri}`)

  let allMetaOk = true
  for (const [key, value] of lineageKeys(manifest, manifestRootHash)) {
    const raw = await registry.getMetadata(agentId, key)
    const decoded = ethers.toUtf8String(raw)
    const ok = decoded === String(value)
    allMetaOk &&= ok
    line(`  ${key}`, ok ? 'OK' : `MISMATCH (${decoded})`)
  }
  rule()

  // --- Machine-readable record -------------------------------------------------------
  const record = {
    what: 'ERC-8004 Identity Registry registration of the Crucible Model Passport',
    honesty:
      'registered, not verified; a model artifact registered as an agent (a category ' +
      'claim); the registry is an EIP-1967 upgradeable proxy whose admin is unidentified; ' +
      'Crucible is a user of the registry, not an ERC-8004 implementation.',
    network: net.label,
    chainId: net.chainId,
    identityRegistry: net.identityRegistry,
    registryName: 'AgentIdentity',
    registrySymbol: 'AGENT',
    deployer,
    agentId: agentId.toString(),
    agentURI: manifestUri,
    manifestRootHash,
    register: {
      txHash: regTx.hash,
      blockNumber: regRcpt.blockNumber,
      gasUsed: regRcpt.gasUsed.toString(),
      explorer: `${net.explorer}/tx/${regTx.hash}`,
    },
    metadata: metadataWrites.map((m) => ({ ...m, explorer: `${net.explorer}/tx/${m.txHash}` })),
    verification: {
      ownerOf: owner,
      ownerMatchesDeployer: ownerOk,
      tokenURI: uri,
      tokenURIMatchesManifest: uriOk,
      allMetadataReadBackMatches: allMetaOk,
    },
    executedAt: new Date().toISOString(),
  }
  mkdirSync(new URL('../runs/', import.meta.url), { recursive: true })
  const outPath = new URL('../runs/erc8004-galileo.json', import.meta.url)
  writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n')
  line('record written', 'runs/erc8004-galileo.json')

  const verdict = chainOk && ownerOk && uriOk && allMetaOk
  console.log(`\n${verdict ? 'DONE' : 'COMPLETED WITH MISMATCHES'} — agentId ${agentId} registered on ${net.label}`)
  if (!verdict) process.exitCode = 1
}

main().catch((error) => {
  console.error(`\nFAILED: ${error?.message ?? error}`)
  process.exitCode = 1
})
