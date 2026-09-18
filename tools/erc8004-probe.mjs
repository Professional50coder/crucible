import { ethers } from 'ethers'

const RPC = 'https://evmrpc-testnet.0g.ai'
const IDENTITY = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const REPUTATION = '0x8004B663056A597Dffe9eCcC1965A193B7388713'
const PASSPORT = '0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7'

const provider = new ethers.JsonRpcProvider(RPC)

const net = await provider.getNetwork()
console.log('chainId:', net.chainId.toString())

// EIP-1967 impl slot
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
const implRaw = await provider.getStorage(IDENTITY, IMPL_SLOT)
const adminRaw = await provider.getStorage(IDENTITY, ADMIN_SLOT)
console.log('impl slot:', '0x' + implRaw.slice(26))
console.log('admin slot:', '0x' + adminRaw.slice(26))

const iface = new ethers.Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function supportsInterface(bytes4) view returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
  'function getAgentWallet(uint256) view returns (address)',
  'function getMetadata(uint256,string) view returns (bytes)',
  'function getAgentURI(uint256) view returns (string)',
  'function getIdentityRegistry() view returns (address)',
])

async function probe(addr, sig, ...args) {
  const fn = sig.split('(')[0]
  try {
    const data = iface.encodeFunctionData(fn, args)
    const res = await provider.call({ to: addr, data })
    const dec = iface.decodeFunctionResult(fn, res)
    console.log(`RESPONDS  ${sig} -> ${JSON.stringify(dec.map(x => x.toString())).slice(0,80)}`)
  } catch (e) {
    console.log(`REVERTS   ${sig} -> ${(e.shortMessage || e.message || '').slice(0,60)}`)
  }
}

console.log('\n== Identity Registry', IDENTITY, '==')
await probe(IDENTITY, 'name()')
await probe(IDENTITY, 'symbol()')
await probe(IDENTITY, 'supportsInterface(0x80ac58cd)', '0x80ac58cd')
await probe(IDENTITY, 'totalSupply()')
await probe(IDENTITY, 'ownerOf(1)', 1n)
await probe(IDENTITY, 'tokenURI(1)', 1n)
await probe(IDENTITY, 'getAgentWallet(1)', 1n)
await probe(IDENTITY, 'getMetadata(1,"agentName")', 1n, 'agentName')
await probe(IDENTITY, 'getAgentURI(1)', 1n)
await probe(IDENTITY, 'getIdentityRegistry()')

console.log('\n== Reputation Registry', REPUTATION, '==')
await probe(REPUTATION, 'getIdentityRegistry()')

// static-simulate register(string) from the dev wallet to confirm permissionless
const DEV = '0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF'
const regIface = new ethers.Interface([
  'function register(string agentURI) returns (uint256)',
  'function register() returns (uint256)',
  'function setMetadata(uint256,string,bytes)',
])
const uri = 'https://indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140'
try {
  const data = regIface.encodeFunctionData('register(string)', [uri])
  const res = await provider.call({ to: IDENTITY, from: DEV, data })
  const dec = regIface.decodeFunctionResult('register(string)', res)
  console.log('\nregister(string) staticCall from DEV -> agentId', dec[0].toString())
} catch (e) {
  console.log('\nregister(string) staticCall REVERTS ->', e.shortMessage || e.message)
}

// balance of dev wallet
const bal = await provider.getBalance(DEV)
console.log('dev balance:', ethers.formatEther(bal), 'OG')

// passport #1 manifestRootHash on-chain (authoritative)
const pIface = new ethers.Interface([
  'function passportOf(uint256) view returns (tuple(bytes32 baseModelHash, bytes32 datasetRootHash, bytes32 configHash, bytes32 adapterRootHash, bytes32 manifestRootHash, string taskId, address provider, uint64 mintedAt))',
  'function verifyManifest(uint256,bytes32) view returns (bool)',
])
try {
  const data = pIface.encodeFunctionData('passportOf', [1n])
  const res = await provider.call({ to: PASSPORT, data })
  const dec = pIface.decodeFunctionResult('passportOf', res)[0]
  console.log('\nPassport#1 manifestRootHash:', dec.manifestRootHash)
  console.log('Passport#1 taskId:', dec.taskId, 'provider:', dec.provider)
  const vdata = pIface.encodeFunctionData('verifyManifest', [1n, '0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f'])
  const vres = await provider.call({ to: PASSPORT, data: vdata })
  console.log('verifyManifest(1, 0x4f64bfe6...) =', pIface.decodeFunctionResult('verifyManifest', vres)[0])
} catch (e) {
  console.log('passportOf error:', e.shortMessage || e.message)
}
