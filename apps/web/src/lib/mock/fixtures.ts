/**
 * Fixture data for mock mode.
 *
 * There are two kinds of record in this file and the difference is the point.
 *
 * **Passport #1 is real.** Every hash, address, transaction, block and token id
 * on it was produced by the 2026-08-14 run against live 0G Galileo and the
 * 2026-08-15 mint into `Passport.sol` at
 * `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`. It is recorded in
 * `contracts/deployments/galileo-mints.json`, and every link on its page
 * resolves. It is also **not a completed fine-tune**: the task reached
 * `Delivered` and `acknowledgeModel` then failed, so its adapter hash is an
 * explicit sentinel and the UI says so before it says anything else.
 *
 * **Everything else is a demo record**, shipped so the app is demonstrable
 * without a funded wallet. Its provider addresses, TEE signer, base-model
 * hashes, per-token prices, hardware quota and chain IDs are genuine — all
 * verified live on 2026-08-14 and recorded in docs/FIELD_NOTES.md — but its
 * dataset roots, adapter roots, task ids, mint transactions, token ids and
 * owners are invented. Those records carry `provenance: 'demo'`, and the UI
 * refuses to draw an explorer link next to a value that would 404.
 */

import { keccak256, toBytes } from 'viem'

import { configHash, manifestHash } from '../manifest'
import type {
  Hardware,
  Job,
  LogLine,
  PassportManifest,
  PassportRecord,
  ProviderInfo,
  TrainingConfig,
} from '../types'

// ---------------------------------------------------------------------------
// Genuine constants
// ---------------------------------------------------------------------------

export const TESTNET_PROVIDER = '0xA02b95Aa6886b1116C4f334eDe00381511E31A09'
export const MAINNET_PROVIDER = '0x940b4a101CaBa9be04b16A7363cafa29C1660B0d'
export const TEE_SIGNER = '0x24135b4Bd964872284728F79F5f17eB874C5583A'

export const BASE_MODEL_HASHES: Record<string, string> = {
  'Qwen2.5-0.5B-Instruct':
    '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
  'Qwen3-32B': '0x2e6f9620c35bdcb2b753cc7aa34e78077a8ed133e36fa36008fd6bdfd29af3a5',
}

export const TOKENIZERS: Record<string, string> = {
  'Qwen2.5-0.5B-Instruct': 'Qwen/Qwen2.5-0.5B-Instruct',
  'Qwen3-32B': 'Qwen/Qwen3-32B',
}

/** Both providers report the same quota: ["8","187","1","900","H200"]. */
export const HARDWARE: Hardware = {
  gpu: '1x NVIDIA H200',
  vcpu: 8,
  memoryGb: 187,
  storageGb: 900,
  tee: 'Intel TDX · Phala dstack',
}

/**
 * FABRICATED. Stands in as the contract address on demo records only. Real
 * deployments live in `passport-contract.ts`; the UI labels this one as demo.
 */
export const MOCK_PASSPORT_CONTRACT = '0x7B4f0C3a9e2d51aC8b6E1f4D0a7C93e5B2148f6A'

// ---------------------------------------------------------------------------
// Passport #1 — the real one
// ---------------------------------------------------------------------------

/**
 * The 2026-08-14 fine-tuning task on 0G Galileo, and the token minted from it.
 *
 * Sources, all in-repo and checkable:
 *   contracts/deployments/galileo.json         deployment, block 49596815
 *   contracts/deployments/galileo-mints.json   mint, block 49597171
 *   contracts/scripts/mint-testnet-passport.js the exact document that was hashed
 *   docs/FIELD_NOTES.md                        the run, the fee, the failure
 *   .paul/STATE.md                             delivery time and the 429/ENOENT
 */
export const REAL = {
  taskId: '10551604-2664-4516-86cf-269a62f93bfc',
  provider: TESTNET_PROVIDER,
  model: 'Qwen2.5-0.5B-Instruct',
  baseModelHash: '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7',
  datasetRootHash: '0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd',
  datasetUploadTx: '0xc38e41315c97911bda12bdea3c0387eecf70d86fbae9cf78a1fc66ff09d7da52',
  manifestRootHash: '0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f',
  tokenId: '1',
  mintTx: '0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1',
  mintBlock: 49597171,
  mintedAt: '2026-08-15T17:38:24.050Z',
  owner: '0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF',
  /** `Delivered` at this instant — which is when the 48-hour clock started. */
  deliveredAt: '2026-08-14T11:18:56.000Z',
  /**
   * The task settled at `Finished` on 0G's side. That is the provider's view and
   * it is true; it does not mean Crucible holds the model. `acknowledgeModel`
   * failed on this end, so no adapter was ever retrieved — which is why the
   * adapter field carries a sentinel rather than a root hash.
   */
  settledAt: '2026-08-14T17:19:27.000Z',
  /** Charged by 0G for the run: 0.0118528 0G. */
  totalNeuron: '11852800000000000',
  storageReserveNeuron: '10000000000000000',
  /** 0.0118528 − 0.01 storage reserve, at 800 gneuron/token over 3 epochs. */
  trainingNeuron: '1852800000000000',
  /**
   * 30.0000% of the fee, deducted because the deliverable was never
   * acknowledged: 0.00355584 of 0.0118528 0G. Read off 0G's FineTuningServing
   * contract, not inferred.
   */
  penaltyNeuron: '3555840000000000',
  /** datasets/sentiment/train.jsonl, counted. */
  exampleCount: 61,
  /** Implied by the fee 0G actually charged: 1.8528e15 / 8e11 / 3 epochs. */
  tokenCount: 772,
  /** The five parameters the task carried. `max_steps` is 10, not the default 45. */
  training: {
    neftune_noise_alpha: 5,
    num_train_epochs: 3,
    per_device_train_batch_size: 2,
    learning_rate: 0.0002,
    max_steps: 10,
  } satisfies TrainingConfig,
} as const

/**
 * The adapter hash on passport #1 is not an adapter hash.
 *
 * `Passport.sol` rejects a zero adapter hash, so a run whose adapter was never
 * retrieved still has to anchor something. Rather than invent a plausible root
 * hash, the mint anchored `keccak256("crucible:adapter-not-retrieved:<taskId>")`
 * — a value nobody can mistake for a real artifact, because the preimage is
 * published and anyone can recompute it. The passport page does exactly that,
 * in the reader's browser, and shows the result.
 */
export const ADAPTER_SENTINEL_PREIMAGE = `crucible:adapter-not-retrieved:${REAL.taskId}`
export const ADAPTER_SENTINEL = keccak256(toBytes(ADAPTER_SENTINEL_PREIMAGE))

export const ADAPTER_NOT_RETRIEVED_REASON =
  'acknowledgeModel failed on both of its download paths, on every attempt. The 0G Storage path ' +
  'dies with spawn 0g-storage-client ENOENT, because the bundled binary is a Linux ELF and the ' +
  'host is Windows; the TEE path dies at 0 bytes with "stream.on is not a function" before ' +
  'surfacing HTTP 429. On this platform the artifact cannot be retrieved at all. The deliverable ' +
  'was therefore never acknowledged, the provider force-settled, and 0G deducted its 30% penalty. ' +
  'The model is gone — there is nothing for this field to point at, and nobody here holds it.'

/**
 * The exact JSON document whose keccak256 is anchored on chain for token #1.
 *
 * Reproduced verbatim from `contracts/scripts/mint-testnet-passport.js`. Keys are
 * already in sorted order, so `canonicalize()` returns this byte-for-byte and the
 * page's in-browser recomputation genuinely reproduces the anchored hash — the
 * one check a reader can perform without leaving the page or trusting us.
 */
export const REAL_ANCHORED_MANIFEST: Record<string, unknown> = {
  adapterRootHash: ADAPTER_SENTINEL,
  baseModelHash: REAL.baseModelHash,
  chainId: 16602,
  configHash: configHash(REAL.training),
  datasetRootHash: REAL.datasetRootHash,
  network: 'testnet',
  note: 'adapter not retrieved; acknowledgeModel failed on Windows (ENOENT) then HTTP 429',
  provider: REAL.provider,
  taskId: REAL.taskId,
  version: 1,
}

/** Passport #1, assembled from the values above and nothing else. */
export function realPassport(): PassportRecord {
  const manifest: PassportManifest = {
    version: 1,
    network: 'testnet',
    chainId: 16602,
    createdAt: REAL.mintedAt,
    task: {
      id: REAL.taskId,
      provider: REAL.provider,
      // 0G reports this task as Finished, and it is. That is the provider's view
      // of its own work; it says nothing about whether the artifact was ever
      // collected. It was not — see `adapterOrigin` below.
      state: 'Finished',
    },
    base: {
      model: REAL.model,
      modelHash: REAL.baseModelHash,
      tokenizer: TOKENIZERS[REAL.model]!,
    },
    dataset: {
      rootHash: REAL.datasetRootHash,
      format: 'chat',
      exampleCount: REAL.exampleCount,
      tokenCount: REAL.tokenCount,
    },
    training: REAL.training,
    adapter: {
      // No sizeBytes: there is no adapter, so there is no size to state.
      rootHash: ADAPTER_SENTINEL,
    },
    fee: {
      trainingNeuron: REAL.trainingNeuron,
      storageReserveNeuron: REAL.storageReserveNeuron,
      totalNeuron: REAL.totalNeuron,
    },
    tee: {
      signerAddress: TEE_SIGNER,
      // Acknowledged on-chain by the provider — checkable, and true.
      acknowledged: true,
      // Never verified on this end: the quote is checked when the delivery is
      // acknowledged, and that is precisely the step that failed.
      attestationVerified: false,
    },
  }

  return {
    id: 'p-000001',
    name: 'sentiment-smoke-01',
    summary:
      'The first passport ever minted by Crucible, on 0G Galileo. A live-chain smoke test of ' +
      'the real contract carrying the real lineage of a real fine-tuning task — and an honest ' +
      'record of the retrieval failure that means nobody here holds the resulting model.',
    provenance: 'chain',
    manifest,
    anchoredManifest: REAL_ANCHORED_MANIFEST,
    adapterOrigin: {
      kind: 'sentinel',
      sentinelPreimage: ADAPTER_SENTINEL_PREIMAGE,
      reason: ADAPTER_NOT_RETRIEVED_REASON,
    },
    deliveredAt: REAL.deliveredAt,
    manifestStorage: {
      rootHash: '0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140',
      txSeq: 146937,
      uploadTx: '0x3988a3ff1fdae9dbff086532bd9709b3491277652be07cd4e9922c502d9a1520',
      sizeBytes: 584,
    },
    settlement: {
      acknowledged: false,
      penaltyNeuron: REAL.penaltyNeuron,
      note:
        'getDeliverables returns acknowledged: false with an empty encryptedSecret, and 30.0000% ' +
        'of the fee was deducted. That is 0G’s documented penalty for a deliverable nobody ' +
        'acknowledged: the provider force-settled and the model was destroyed.',
    },
    caveat: {
      title: 'This run lost its model. The passport records that, because that is what happened.',
      body:
        'The base-model hash, dataset root hash, training config, task id, provider and fee ' +
        'below are the real values from the 2026-08-14 run, and the token, transaction and ' +
        'anchored hash are real on 0G Galileo. The provider reports progress: Finished — that ' +
        'is its view of its own work and it does not mean the deliverable was acknowledged. It ' +
        'was not. Reading 0G’s FineTuningServing contract, acknowledged is false, the ' +
        'encryptedSecret is empty, and 30% of the fee was deducted. Nobody here holds this ' +
        'model; it is gone. That is the exact failure Crucible exists to survive, it happened ' +
        'to us on the first real run, and a passport that quietly rounded it up to “Finished” ' +
        'would be the dishonest kind of provenance this project exists to replace.',
    },
    mint: {
      status: 'minted',
      manifestRootHash: REAL.manifestRootHash,
      configHash: configHash(REAL.training),
      contractAddress: '0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7',
      tokenId: REAL.tokenId,
      txHash: REAL.mintTx,
      owner: REAL.owner,
      blockNumber: REAL.mintBlock,
      mintedAt: REAL.mintedAt,
    },
    hardware: HARDWARE,
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const PROVIDERS: ProviderInfo[] = [
  {
    address: MAINNET_PROVIDER,
    network: 'mainnet',
    url: 'https://a1b2c3d4e5f6-3080.dstack-pha-in2.phala.network',
    pricePerTokenNeuron: '500000000000',
    occupied: false,
    models: ['Qwen2.5-0.5B-Instruct', 'Qwen3-32B'],
    teeSignerAddress: TEE_SIGNER,
    teeSignerAcknowledged: true,
    hardware: HARDWARE,
  },
  {
    address: TESTNET_PROVIDER,
    network: 'testnet',
    url: 'https://f6e5d4c3b2a1-3082.dstack-pha-in2.phala.network',
    pricePerTokenNeuron: '800000000000',
    occupied: false,
    models: ['Qwen2.5-0.5B-Instruct'],
    teeSignerAddress: TEE_SIGNER,
    teeSignerAcknowledged: true,
    hardware: HARDWARE,
  },
]

// ---------------------------------------------------------------------------
// Passports
// ---------------------------------------------------------------------------

const CONFIG_STANDARD: TrainingConfig = {
  neftune_noise_alpha: 5,
  num_train_epochs: 3,
  per_device_train_batch_size: 2,
  learning_rate: 0.0002,
  max_steps: 45,
}

interface PassportSeed {
  id: string
  name: string
  summary: string
  network: 'testnet' | 'mainnet'
  model: string
  taskId: string
  datasetRootHash: string
  adapterRootHash: string
  manifestRootHash: string
  configHash: string
  format: 'chat' | 'instruction' | 'text'
  exampleCount: number
  tokenCount: number
  adapterSizeBytes: number
  daysAgo: number
  durationSeconds: number
  training: TrainingConfig
  mint:
    | { status: 'minted'; tokenId: string; txHash: string; owner: string; blockNumber: number }
    | { status: 'pending' }
    | { status: 'unminted' }
  attestationVerified: boolean
}

/** All hashes, task ids, token ids and tx hashes below are FABRICATED. */
const PASSPORT_SEEDS: PassportSeed[] = [
  {
    id: 'p-4c1f9a',
    name: 'support-tone-v3',
    summary:
      'Customer-support replies rewritten into house voice. Third iteration; the one that finally stopped apologising twice per message.',
    network: 'mainnet',
    model: 'Qwen2.5-0.5B-Instruct',
    taskId: 'b2f0a3c1-8e47-4d6a-9c15-7f3e2a9d4b08',
    datasetRootHash: '0xaae9b4e02c7d1f6083b4c95ea1f7d2380c6ab41957e0d3f28e5c7b90a147a5fa',
    adapterRootHash: '0x31d8c07e5b9a24f6183ec0ab7742d95f60c8e13b4a97fd25086cb3e719f4a2d6',
    manifestRootHash: '0x9c14ab73f0e582d61b47ca0938f5e26d7148b93ac5210fe86d4b7093c1a8567e',
    configHash: '0x5f2a91c6d0e84b37a591f2c7038de164b95a2d70c8f341eb6207d59ac4b13e08',
    format: 'chat',
    exampleCount: 842,
    tokenCount: 271_480,
    adapterSizeBytes: 104_857_600,
    daysAgo: 2,
    durationSeconds: 1_284,
    training: CONFIG_STANDARD,
    mint: {
      status: 'minted',
      tokenId: '17',
      txHash: '0x6b3f18e2a0c74d9518eb2f7a0d63c485917fe20b3ac86d1750e94fb2c308a7d1',
      owner: '0x3De9a1f0B4c72E85A1d6F09b3c47E2185aD0C9f4',
      blockNumber: 4_812_907,
    },
    attestationVerified: true,
  },
  {
    id: 'p-8e30b7',
    name: 'sql-repair-lora',
    summary:
      'Takes a failing Postgres query plus its error and returns a corrected query. Trained on three years of internal incident tickets.',
    network: 'mainnet',
    model: 'Qwen3-32B',
    taskId: '7d41e0b9-2c53-4a18-b7e6-90f1c8a35d24',
    datasetRootHash: '0xc07b1e4a95d8236f0ba4179ce3820d5f6417ab9028ec5d31b7a04f8629d3c1b5',
    adapterRootHash: '0x4a92f7c31e0d68b5a2470fc19d83e6b207a5148cd3f902e7186bd4a05c9e3721',
    manifestRootHash: '0xd3810f5c7a26e94b08d17f3a2c65b09e481ad72f5309c6b81e40792adf6c5138',
    configHash: '0x1b78ce02a4d95f31607b28ce9a4d05f13872be6091cad3475e0f9b2c8a61d40f',
    format: 'instruction',
    exampleCount: 3_410,
    tokenCount: 1_842_006,
    adapterSizeBytes: 943_718_400,
    daysAgo: 4,
    durationSeconds: 9_642,
    training: { ...CONFIG_STANDARD, num_train_epochs: 2, max_steps: 320 },
    mint: {
      status: 'minted',
      tokenId: '12',
      txHash: '0x2f97ad0e6c31b845d270fa19e83b6c0475d1928ae03f6bc157094e2da8b31f60',
      owner: '0x91C4e07a5B2f38D6104eA97c3b850fD62a173Ec8',
      blockNumber: 4_759_331,
    },
    attestationVerified: true,
  },
  {
    id: 'p-2b7d61',
    name: 'triage-classifier',
    summary:
      'Routes inbound bug reports to one of nine owning teams. Replaced a 400-line regex cascade.',
    network: 'mainnet',
    model: 'Qwen2.5-0.5B-Instruct',
    taskId: 'e51c7a08-64bd-4f39-8a02-c73e1904bd6f',
    datasetRootHash: '0x58e1cb70a4936d2f08b7e14ca50d92f36ba807145ec3920df6b18a04e73c2915',
    adapterRootHash: '0xba30f14e78c09d2651a7b3e04f8629dc5170ae43920fb85d61c7043ae29f5b18',
    manifestRootHash: '0x07f52ab3910ce684d2751fb09a34c8e56d0139b7ca8f24e50b96d3a17c845fe2',
    configHash: '0x8c05d7b1f3a26e940b18752cad03f61e9247b0c58fda3169e70b482d5ca9013f',
    format: 'chat',
    exampleCount: 1_204,
    tokenCount: 388_915,
    adapterSizeBytes: 104_857_600,
    daysAgo: 6,
    durationSeconds: 1_731,
    training: { ...CONFIG_STANDARD, neftune_noise_alpha: 3 },
    mint: {
      status: 'minted',
      tokenId: '9',
      txHash: '0xa14b6e0f37d92c85104fb728ae35d016c9f2470b8d1ea36592c07b4fd81a350e',
      owner: '0x3De9a1f0B4c72E85A1d6F09b3c47E2185aD0C9f4',
      blockNumber: 4_701_552,
    },
    attestationVerified: true,
  },
  {
    id: 'p-9a04c3',
    name: 'solidity-natspec',
    summary:
      'Writes NatSpec for an unannotated Solidity function. Trained on OpenZeppelin plus 0G’s own contracts.',
    network: 'mainnet',
    model: 'Qwen3-32B',
    taskId: '3a8f2d17-b904-4e6c-95a1-08d7fe32c4b9',
    datasetRootHash: '0x6d09fa27b1c85e340a72f9b1e08c3d5647fa20b9138ce7605da4193f8c2b70ae',
    adapterRootHash: '0xf20a5c68d17b394e0562ab8f14c07d39e6b280a5c73f1e94d0526bf83a19c7d4',
    manifestRootHash: '0x4e18c9b30f5a276d18e40cb75923fa61d08b7e2c95430fa671bd28e05c937146',
    configHash: '0x2d1a65e0c9b47f3801a6d3f27b5490ec8317ad60b294f5e70c81ad3629f5b704',
    format: 'instruction',
    exampleCount: 512,
    tokenCount: 402_775,
    adapterSizeBytes: 943_718_400,
    daysAgo: 8,
    durationSeconds: 5_207,
    training: { ...CONFIG_STANDARD, num_train_epochs: 1, max_steps: 120 },
    mint: {
      status: 'minted',
      tokenId: '6',
      txHash: '0x83c07e2b1a95f4d6207ea3c081f45b7962d1a8e0374bc5901ed26af7b3054c19',
      owner: '0x5aB1c93f70D28e461A0f7c25bD3e0946Cf82a17B',
      blockNumber: 4_648_204,
    },
    attestationVerified: true,
  },
  {
    id: 'p-6f52e8',
    name: 'field-notes-writer',
    summary:
      'The 30-example smoke run from 0G’s own fine-tuning example. Kept public because a tiny passport is still a complete one.',
    network: 'testnet',
    model: 'Qwen2.5-0.5B-Instruct',
    taskId: '1c6e9047-5fa2-4b83-90d1-7e24acb50f36',
    datasetRootHash: '0x93b0e7f1c5a2486d0371fb59ea0c8d247f631450e94c2d17085ba3f6c917d203',
    adapterRootHash: '0xe7245c1908baf36d05e12793ca4b08f6172dae59034fb8c261057ea9d38b4c02',
    manifestRootHash: '0x1f60d84b2e07a9c5318df602a4b71e95307cbd28f6a1049e5b2d873f0ca61e47',
    configHash: '0x5f2a91c6d0e84b37a591f2c7038de164b95a2d70c8f341eb6207d59ac4b13e08',
    format: 'chat',
    exampleCount: 30,
    tokenCount: 9_412,
    adapterSizeBytes: 104_857_600,
    daysAgo: 9,
    durationSeconds: 412,
    training: CONFIG_STANDARD,
    mint: {
      status: 'minted',
      tokenId: '3',
      txHash: '0xcb7205a4e91f3d6807b2ac540f19e63b28d70a154cf39be6027d15a8f4c0b937',
      owner: '0x3De9a1f0B4c72E85A1d6F09b3c47E2185aD0C9f4',
      blockNumber: 3_218_770,
    },
    attestationVerified: true,
  },
  {
    id: 'p-3d18f0',
    name: 'refund-policy-agent',
    summary:
      'Answers refund-eligibility questions against a written policy. Attestation could not be verified — the provider’s quote failed validation on this run.',
    network: 'testnet',
    model: 'Qwen2.5-0.5B-Instruct',
    taskId: '9f27b3c8-04ea-4517-bd62-3a08c1e7594d',
    datasetRootHash: '0x2c85f091ab7e34d6018f52c9a04b7e3d61958a2f0c47bde30591fa728d0c46b3',
    adapterRootHash: '0x70d3ae51c928f0467b1a5de308c94f2b6017da85e93c260f4a18b57d0e2c9341',
    manifestRootHash: '0xa5083f7c21be49d06735fa1c8e02b94d7315ce80f2a64719db830e5c17f2069b',
    configHash: '0x9e4025ab7d1c68f309b5e2740ac1d386f5027be914d0a36c8517fe2094b7d035',
    format: 'text',
    exampleCount: 460,
    tokenCount: 143_208,
    adapterSizeBytes: 104_857_600,
    daysAgo: 11,
    durationSeconds: 894,
    training: { ...CONFIG_STANDARD, learning_rate: 0.0001 },
    mint: {
      status: 'minted',
      tokenId: '2',
      txHash: '0x40b19cf7e2a860d5137ba90e5c4f2867d013ae95b7f2c604839de15a0b7c2f68',
      owner: '0x5aB1c93f70D28e461A0f7c25bD3e0946Cf82a17B',
      blockNumber: 3_105_419,
    },
    attestationVerified: false,
  },
  {
    id: 'p-1e97ba',
    name: 'changelog-summariser',
    summary:
      'Turns a week of merged PR titles into a release note. Manifest is on 0G Storage; the mint transaction is still pending.',
    network: 'testnet',
    model: 'Qwen2.5-0.5B-Instruct',
    taskId: '5b3d81f0-7c26-49ae-8035-e2f1a964c07d',
    datasetRootHash: '0x84f10c67d2a95b3e0716fa28c095d341b7e620af9c53d817204fbe6a930c5d1f',
    adapterRootHash: '0x1a6f92d508c3e74b0295da617f8034ce29b510af7d63928c04e1b8a5f37c0d26',
    manifestRootHash: '0x62e08b1749fac35d20817ea3b90c46f5d187029ace4b6531fd70a92c8e415b03',
    configHash: '0x3c7e15a09d24bf6810e5a27c40db93f562018e7ac9b3d45061fa287be0c39d51',
    format: 'chat',
    exampleCount: 218,
    tokenCount: 62_940,
    adapterSizeBytes: 104_857_600,
    daysAgo: 1,
    durationSeconds: 638,
    training: CONFIG_STANDARD,
    mint: { status: 'pending' },
    attestationVerified: true,
  },
]

const DAY_MS = 24 * 60 * 60 * 1000

function feeFor(
  tokenCount: number,
  epochs: number,
  network: 'testnet' | 'mainnet',
  model: string,
) {
  const pricePerToken = network === 'mainnet' ? 500_000_000_000n : 800_000_000_000n
  const storage = model === 'Qwen3-32B' ? 9n * 10n ** 16n : 10n ** 16n
  const training = BigInt(tokenCount) * pricePerToken * BigInt(epochs)

  return {
    trainingNeuron: training.toString(),
    storageReserveNeuron: storage.toString(),
    totalNeuron: (training + storage).toString(),
  }
}

function manifestFor(seed: PassportSeed, now: number): PassportManifest {
  return {
    version: 1,
    network: seed.network,
    chainId: seed.network === 'mainnet' ? 16661 : 16602,
    createdAt: new Date(now - seed.daysAgo * DAY_MS).toISOString(),
    task: {
      id: seed.taskId,
      provider: seed.network === 'mainnet' ? MAINNET_PROVIDER : TESTNET_PROVIDER,
      state: 'Finished',
    },
    base: {
      model: seed.model,
      modelHash: BASE_MODEL_HASHES[seed.model]!,
      tokenizer: TOKENIZERS[seed.model]!,
    },
    dataset: {
      rootHash: seed.datasetRootHash,
      format: seed.format,
      exampleCount: seed.exampleCount,
      tokenCount: seed.tokenCount,
    },
    training: seed.training,
    adapter: {
      rootHash: seed.adapterRootHash,
      sizeBytes: seed.adapterSizeBytes,
    },
    fee: feeFor(seed.tokenCount, seed.training.num_train_epochs, seed.network, seed.model),
    tee: {
      signerAddress: TEE_SIGNER,
      acknowledged: true,
      attestationVerified: seed.attestationVerified,
    },
  }
}

export function buildPassports(now: number = Date.now()): PassportRecord[] {
  const demo = PASSPORT_SEEDS.map((seed) => {
    const manifest = manifestFor(seed, now)

    // Derived, not invented: the anchored hash is the real keccak256 of the
    // canonical manifest, so the passport page's in-browser recomputation
    // genuinely matches rather than being staged.
    const anchoredManifestHash = manifestHash(manifest)
    const anchoredConfigHash = configHash(manifest.training)

    const mint =
      seed.mint.status === 'minted'
        ? {
            status: 'minted' as const,
            manifestRootHash: anchoredManifestHash,
            configHash: anchoredConfigHash,
            contractAddress: MOCK_PASSPORT_CONTRACT,
            tokenId: seed.mint.tokenId,
            txHash: seed.mint.txHash,
            owner: seed.mint.owner,
            blockNumber: seed.mint.blockNumber,
            mintedAt: new Date(now - seed.daysAgo * DAY_MS + 60_000).toISOString(),
          }
        : {
            status: seed.mint.status,
            manifestRootHash: anchoredManifestHash,
            configHash: anchoredConfigHash,
          }

    return {
      id: seed.id,
      name: seed.name,
      summary: seed.summary,
      provenance: 'demo' as const,
      manifest,
      mint,
      hardware: HARDWARE,
      durationSeconds: seed.durationSeconds,
    }
  })

  // Newest first, and the real one keeps its true issue date rather than being
  // floated to the top by fiat. The gallery features it explicitly instead.
  return [realPassport(), ...demo].sort(
    (a, b) =>
      new Date(b.manifest.createdAt).getTime() - new Date(a.manifest.createdAt).getTime(),
  )
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * Seed jobs, built relative to "now" so the countdowns are always live. Each one
 * exists to show a specific state the UI must handle:
 *
 *   job_7f21c4  Delivered moments ago — the 48-hour clock running, daemon armed
 *   job_1d55b2  Delivered 26 hours ago — retries failing, countdown in warning
 *   job_2ad901  mid-Training, advancing on its own
 *   job_5c8e33  Finished, with a passport
 *   job_9b0f77  Failed on the funding footgun, with the fix
 *   job_4e12aa  queued behind another task — provider occupied
 */
export function buildJobs(now: number = Date.now()): Job[] {
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()

  const delivered = -90_000
  const deliveredLate = -26 * HOUR

  return [
    {
      id: 'job_7f21c4',
      name: 'support-tone-v4',
      network: 'mainnet',
      chainId: 16661,
      provider: MAINNET_PROVIDER,
      taskId: 'c48a7b21-90fe-4d35-8b06-2a71ef95034c',
      state: 'Delivered',
      createdAt: iso(-34 * MINUTE),
      updatedAt: iso(delivered),
      deliveredAt: iso(delivered),
      acknowledgedAt: null,
      acknowledgeScheduledFor: iso(delivered + 2 * MINUTE),
      datasetRootHash: '0x0d47b1e8a3f2905c61847bde20fa35c971e07844a5d3c6907fe12ab48053d7c9',
      adapterRootHash: '0xb51e07d3946ac2f80d17e5b6f0a2394c61d873be05a17f9c4820ed6b3a951f70',
      adapterPath: null,
      adapterSizeBytes: 104_857_600,
      error: null,
      queued: false,
      model: 'Qwen2.5-0.5B-Instruct',
      config: CONFIG_STANDARD,
      fee: feeFor(298_140, 3, 'mainnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'support-tone-v4.jsonl',
        format: 'chat',
        exampleCount: 916,
        tokenCount: 298_140,
      },
      hardware: HARDWARE,
      history: {
        Init: iso(-34 * MINUTE),
        SettingUp: iso(-33 * MINUTE),
        SetUp: iso(-31 * MINUTE),
        Training: iso(-30 * MINUTE),
        Trained: iso(-4 * MINUTE),
        Delivering: iso(-3 * MINUTE),
        Delivered: iso(delivered),
      },
    },
    {
      id: 'job_1d55b2',
      name: 'invoice-extractor',
      network: 'testnet',
      chainId: 16602,
      provider: TESTNET_PROVIDER,
      taskId: '2e70b9a4-c185-4f36-90de-71a4c0863b25',
      state: 'Delivered',
      createdAt: iso(-27 * HOUR),
      updatedAt: iso(-11 * MINUTE),
      deliveredAt: iso(deliveredLate),
      acknowledgedAt: null,
      acknowledgeScheduledFor: iso(4 * MINUTE),
      datasetRootHash: '0x7a2c40f1d85be93607a2fc154d09e3b8710ca62f4395d18b0e73ac5f26d10b84',
      adapterRootHash: '0x39fa0c81b7d254e6018a3fc790b25d4e6178ac03e29f5b41d7086ea25c930f17',
      adapterPath: null,
      adapterSizeBytes: 104_857_600,
      error: null,
      queued: false,
      model: 'Qwen2.5-0.5B-Instruct',
      config: { ...CONFIG_STANDARD, num_train_epochs: 2 },
      fee: feeFor(74_320, 2, 'testnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'invoices-2026.jsonl',
        format: 'instruction',
        exampleCount: 244,
        tokenCount: 74_320,
      },
      hardware: HARDWARE,
      history: {
        Init: iso(-27 * HOUR),
        SettingUp: iso(-27 * HOUR + 2 * MINUTE),
        SetUp: iso(-27 * HOUR + 5 * MINUTE),
        Training: iso(-27 * HOUR + 6 * MINUTE),
        Trained: iso(-26 * HOUR - 10 * MINUTE),
        Delivering: iso(-26 * HOUR - 5 * MINUTE),
        Delivered: iso(deliveredLate),
      },
    },
    {
      id: 'job_2ad901',
      name: 'commit-message-writer',
      network: 'mainnet',
      chainId: 16661,
      provider: MAINNET_PROVIDER,
      taskId: '8b1f39c0-27ad-4e58-b3f6-104ca79d2e85',
      state: 'Training',
      createdAt: iso(-9 * MINUTE),
      updatedAt: iso(-2 * MINUTE),
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgeScheduledFor: null,
      datasetRootHash: '0x5c81e0a374bd29f6015e8ac74320bd18f970c26a5db38e04197ca6f280b3e51d',
      adapterPath: null,
      error: null,
      queued: false,
      model: 'Qwen2.5-0.5B-Instruct',
      config: CONFIG_STANDARD,
      fee: feeFor(118_705, 3, 'mainnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'commits.jsonl',
        format: 'chat',
        exampleCount: 371,
        tokenCount: 118_705,
      },
      hardware: HARDWARE,
      history: {
        Init: iso(-9 * MINUTE),
        SettingUp: iso(-8 * MINUTE),
        SetUp: iso(-6 * MINUTE),
        Training: iso(-5 * MINUTE),
      },
    },
    {
      id: 'job_5c8e33',
      name: 'support-tone-v3',
      network: 'mainnet',
      chainId: 16661,
      provider: MAINNET_PROVIDER,
      taskId: 'b2f0a3c1-8e47-4d6a-9c15-7f3e2a9d4b08',
      state: 'Finished',
      createdAt: iso(-2 * 24 * HOUR),
      updatedAt: iso(-2 * 24 * HOUR + 30 * MINUTE),
      deliveredAt: iso(-2 * 24 * HOUR + 22 * MINUTE),
      acknowledgedAt: iso(-2 * 24 * HOUR + 24 * MINUTE),
      acknowledgeScheduledFor: iso(-2 * 24 * HOUR + 24 * MINUTE),
      datasetRootHash: '0xaae9b4e02c7d1f6083b4c95ea1f7d2380c6ab41957e0d3f28e5c7b90a147a5fa',
      adapterRootHash: '0x31d8c07e5b9a24f6183ec0ab7742d95f60c8e13b4a97fd25086cb3e719f4a2d6',
      adapterPath: '~/.crucible/adapters/support-tone-v3',
      adapterSizeBytes: 104_857_600,
      error: null,
      queued: false,
      model: 'Qwen2.5-0.5B-Instruct',
      config: CONFIG_STANDARD,
      fee: feeFor(271_480, 3, 'mainnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'support-tone-v3.jsonl',
        format: 'chat',
        exampleCount: 842,
        tokenCount: 271_480,
      },
      hardware: HARDWARE,
      passportId: 'p-4c1f9a',
      history: {
        Init: iso(-2 * 24 * HOUR),
        SettingUp: iso(-2 * 24 * HOUR + 1 * MINUTE),
        SetUp: iso(-2 * 24 * HOUR + 3 * MINUTE),
        Training: iso(-2 * 24 * HOUR + 4 * MINUTE),
        Trained: iso(-2 * 24 * HOUR + 19 * MINUTE),
        Delivering: iso(-2 * 24 * HOUR + 20 * MINUTE),
        Delivered: iso(-2 * 24 * HOUR + 22 * MINUTE),
        UserAcknowledged: iso(-2 * 24 * HOUR + 24 * MINUTE),
        Finished: iso(-2 * 24 * HOUR + 26 * MINUTE),
      },
    },
    {
      id: 'job_9b0f77',
      name: 'legal-clause-tagger',
      network: 'mainnet',
      chainId: 16661,
      provider: MAINNET_PROVIDER,
      taskId: null,
      state: 'Failed',
      createdAt: iso(-3 * HOUR),
      updatedAt: iso(-3 * HOUR + 40_000),
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgeScheduledFor: null,
      datasetRootHash: '0xdb0271ea34c5f89610b7d24fe0a3c951728bd0f64ea31c057b9d248fa0c6e315',
      adapterPath: null,
      error: 'MinimumDepositRequired',
      errorHint:
        'The transfer landed in the inference sub-account, not fine-tuning. 0G’s transfer-fund defaults there unless you pass --service fine-tuning. Crucible funds the correct sub-account and checks the balance before creating a task — retrying this job will route correctly.',
      queued: false,
      model: 'Qwen2.5-0.5B-Instruct',
      config: CONFIG_STANDARD,
      fee: feeFor(51_060, 3, 'mainnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'clauses.jsonl',
        format: 'instruction',
        exampleCount: 160,
        tokenCount: 51_060,
      },
      hardware: HARDWARE,
      history: {
        Init: iso(-3 * HOUR),
      },
    },
    {
      id: 'job_4e12aa',
      name: 'release-note-drafter',
      network: 'testnet',
      chainId: 16602,
      provider: TESTNET_PROVIDER,
      taskId: null,
      state: 'Init',
      createdAt: iso(-6 * MINUTE),
      updatedAt: iso(-6 * MINUTE),
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgeScheduledFor: null,
      datasetRootHash: '0x6e1935fa0c78b24d0951ea3c78f05524d5a13c907e2b846fd05173ae92c840b6',
      adapterPath: null,
      error: null,
      queued: true,
      queuePosition: 1,
      model: 'Qwen2.5-0.5B-Instruct',
      config: CONFIG_STANDARD,
      fee: feeFor(38_400, 3, 'testnet', 'Qwen2.5-0.5B-Instruct'),
      dataset: {
        filename: 'release-notes.jsonl',
        format: 'chat',
        exampleCount: 120,
        tokenCount: 38_400,
      },
      hardware: HARDWARE,
      history: {
        Init: iso(-6 * MINUTE),
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

/** Provider log lines, in the shape `getLog` returns them. */
export function buildLogs(now: number = Date.now()): Record<string, LogLine[]> {
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()

  return {
    job_7f21c4: [
      { ts: iso(-34 * MINUTE), level: 'info', message: 'Funding fine-tuning sub-account (--service fine-tuning)' },
      { ts: iso(-34 * MINUTE), level: 'ok', message: 'Balance verified: 0.4472 0G available, 0.4472 0G required' },
      { ts: iso(-34 * MINUTE), level: 'info', message: 'Dataset uploaded to 0G Storage' },
      { ts: iso(-33 * MINUTE), level: 'info', message: 'createTask → provider 0x940b4a10…60B0d, model Qwen2.5-0.5B-Instruct' },
      { ts: iso(-33 * MINUTE), level: 'ok', message: 'Task c48a7b21-90fe-4d35-8b06-2a71ef95034c accepted' },
      { ts: iso(-31 * MINUTE), level: 'ok', message: 'Dataset hash verified against on-chain root hash' },
      { ts: iso(-30 * MINUTE), level: 'info', message: 'Training started — 3 epochs, 45 max steps, batch 2' },
      { ts: iso(-18 * MINUTE), level: 'info', message: 'step 20/45 · loss 1.204' },
      { ts: iso(-9 * MINUTE), level: 'info', message: 'step 40/45 · loss 0.871' },
      { ts: iso(-4 * MINUTE), level: 'ok', message: 'Training complete — adapter 100.0 MB' },
      { ts: iso(-3 * MINUTE), level: 'info', message: 'Encrypting and delivering adapter to 0G Storage' },
      { ts: iso(-90_000), level: 'warn', message: 'Delivered. 48-hour acknowledgement window open.' },
      { ts: iso(-88_000), level: 'info', message: 'Auto-acknowledge armed — first attempt in 2 minutes.' },
    ],
    job_1d55b2: [
      { ts: iso(-27 * HOUR), level: 'info', message: 'Task created on 0G Galileo' },
      { ts: iso(-26 * HOUR), level: 'warn', message: 'Delivered. 48-hour acknowledgement window open.' },
      { ts: iso(-26 * HOUR + 2 * MINUTE), level: 'error', message: 'acknowledgeModel attempt 1 failed — TEE endpoint timed out after 60s idle' },
      { ts: iso(-24 * HOUR), level: 'error', message: 'acknowledgeModel attempt 6 failed — TEE endpoint timed out after 60s idle' },
      { ts: iso(-11 * MINUTE), level: 'error', message: 'acknowledgeModel attempt 41 failed — TEE endpoint timed out after 60s idle' },
      { ts: iso(-11 * MINUTE), level: 'info', message: 'Falling back to downloadMethod: 0g-storage on next attempt' },
      { ts: iso(-10 * MINUTE), level: 'warn', message: '22h 00m of window remaining. Escalation at 6h remaining.' },
    ],
    job_2ad901: [
      { ts: iso(-9 * MINUTE), level: 'info', message: 'Funding fine-tuning sub-account (--service fine-tuning)' },
      { ts: iso(-8 * MINUTE), level: 'info', message: 'Dataset uploaded to 0G Storage' },
      { ts: iso(-8 * MINUTE), level: 'warn', message: 'Duplicate root hash — reusing existing upload (expected, not an error)' },
      { ts: iso(-6 * MINUTE), level: 'ok', message: 'Dataset hash verified against on-chain root hash' },
      { ts: iso(-5 * MINUTE), level: 'info', message: 'Training started — 3 epochs, 45 max steps, batch 2' },
      { ts: iso(-2 * MINUTE), level: 'info', message: 'step 12/45 · loss 1.688' },
    ],
    job_5c8e33: [
      { ts: iso(-2 * 24 * HOUR), level: 'info', message: 'Task created on 0G mainnet' },
      { ts: iso(-2 * 24 * HOUR + 22 * MINUTE), level: 'warn', message: 'Delivered. 48-hour acknowledgement window open.' },
      { ts: iso(-2 * 24 * HOUR + 24 * MINUTE), level: 'ok', message: 'acknowledgeModel succeeded — hash verified, deliverable acknowledged' },
      { ts: iso(-2 * 24 * HOUR + 26 * MINUTE), level: 'ok', message: 'Finished. Adapter decrypted to ~/.crucible/adapters/support-tone-v3' },
      { ts: iso(-2 * 24 * HOUR + 27 * MINUTE), level: 'ok', message: 'Passport manifest written to 0G Storage and minted as token #17' },
    ],
    job_9b0f77: [
      { ts: iso(-3 * HOUR), level: 'info', message: 'Checking fine-tuning sub-account balance' },
      { ts: iso(-3 * HOUR + 20_000), level: 'error', message: 'createTask reverted: MinimumDepositRequired' },
      { ts: iso(-3 * HOUR + 40_000), level: 'info', message: 'Diagnosis: funds present in inference sub-account, absent from fine-tuning' },
    ],
    job_4e12aa: [
      { ts: iso(-6 * MINUTE), level: 'info', message: 'Dataset uploaded to 0G Storage' },
      { ts: iso(-6 * MINUTE), level: 'warn', message: 'Provider occupied — one task at a time on this network. Queued.' },
    ],
  }
}
