# Crucible — Canonical Interfaces

**This file is the contract between components.** Four agents are building in parallel against
it. If your code disagrees with this file, your code is wrong — do not "improve" a shape here
unilaterally, because someone else is coding against it right now.

Ownership:

| Component | Directory | Owns |
|---|---|---|
| core | `packages/core/` | Manifest shape, canonicalization, hashing, task states, fee, dataset, networks |
| contracts | `contracts/` | `Passport.sol`, its ABI and events |
| orchestrator | `services/orchestrator/` | Job store, poller, auto-acknowledge daemon, HTTP+SSE API |
| web | `apps/web/` | All UI. Consumes everything else; owns nothing shared |

---

## 1. `PassportManifest` — the central artifact

Produced by core, anchored by contracts, served by orchestrator, rendered by web.

```ts
interface PassportManifest {
  version: 1
  network: 'testnet' | 'mainnet'
  chainId: number                       // 16602 | 16661
  createdAt: string                     // ISO 8601
  task: {
    id: string                          // 0G fine-tuning task id
    provider: string                    // 0x address of the compute provider
    state: TaskState
  }
  base: {
    model: string                       // e.g. "Qwen2.5-0.5B-Instruct" — NO "Qwen/" prefix
    modelHash: string                   // 0x…, the turbo hash
    tokenizer: string                   // e.g. "Qwen/Qwen2.5-0.5B-Instruct" — WITH prefix
  }
  dataset: {
    rootHash: string                    // 0G Storage root hash
    format: 'chat' | 'instruction' | 'text'
    exampleCount: number
    tokenCount: number
  }
  training: TrainingConfig              // exactly the five 0G parameters, no more, no less
  adapter: {
    rootHash: string
    sizeBytes?: number
  }
  fee: {                                // STRINGS, not bigint — must survive JSON
    trainingNeuron: string
    storageReserveNeuron: string
    totalNeuron: string
  }
  tee: {
    signerAddress: string
    acknowledged: boolean
    attestationVerified: boolean
  }
}
```

### Canonicalization rule (load-bearing)
`canonicalize(manifest)` → deterministic JSON: **keys sorted recursively, no whitespace**.
Two manifests with identical content MUST serialise byte-identically regardless of key
insertion order. `manifestHash = keccak256(utf8Bytes(canonicalize(manifest)))`, 0x-prefixed.

If this isn't deterministic, the on-chain anchor is meaningless. It is the single most
important invariant in the system.

---

## 2. `TaskState` — 0G's real lifecycle

```ts
type TaskState =
  | 'Init' | 'SettingUp' | 'SetUp' | 'Training' | 'Trained'
  | 'Delivering' | 'Delivered' | 'UserAcknowledged' | 'Finished'
  | 'Failed'
```

Ordered. Never goes backwards. Any state may go to `Failed`.

| Rule | Value |
|---|---|
| Acknowledge deadline | `Delivered` + **48 hours** |
| Miss it | Model lost **and** 30% of fee deducted |
| Decryption possible | **only** at `Finished` |
| Too-early decrypt error | `second arg must be public key` (provider needs ~60s to settle) |
| Provider busy | `occupied: true` — a **queued** state, not an error |

---

## 3. `TrainingConfig` — exactly five keys

```ts
interface TrainingConfig {
  neftune_noise_alpha: number          // 0–10
  num_train_epochs: number             // positive integer
  per_device_train_batch_size: number  // 1–4
  learning_rate: number                // 0.00001–0.001, DECIMAL notation only
  max_steps: number                    // -1 (use epochs) or positive integer
}
```

0G rejects configs with extra **or** missing keys. Never write `2e-4`.

---

## 4. `Passport.sol` ABI — contracts → web

Web renders these; orchestrator may write them.

```solidity
struct PassportData {
    bytes32 baseModelHash;
    bytes32 datasetRootHash;
    bytes32 configHash;
    bytes32 adapterRootHash;
    bytes32 manifestRootHash;   // PUBLIC — verifiable without decryption
    string  taskId;
    address provider;
    uint64  mintedAt;
}

function mint(address to, PassportData calldata data, string calldata encryptedURI)
    external returns (uint256 tokenId);

function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external;
function revokeAuthorization(uint256 tokenId, address executor) external;
function isAuthorized(uint256 tokenId, address executor) external view returns (bool);
function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash) external view returns (bool);
function passportOf(uint256 tokenId) external view returns (PassportData memory);
```

Invariants: lineage immutable after mint · **max 100** authorizations per token ·
**all authorizations cleared on transfer** · duplicate
`(datasetRootHash, configHash, adapterRootHash)` cannot be minted twice.

---

## 5. Orchestrator HTTP API — orchestrator → web

Base: `http://localhost:8787` (override with `CRUCIBLE_API_URL`).

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | `{ ok: true, version }` |
| `POST` | `/jobs` | `Job` — body `{ network, provider, model, datasetPath \| datasetRootHash, config }` |
| `GET` | `/jobs` | `Job[]` |
| `GET` | `/jobs/:id` | `Job` |
| `GET` | `/jobs/:id/logs` | `{ logs: string }` |
| `GET` | `/jobs/:id/stream` | SSE, `event: state`, `data: Job` |
| `POST` | `/jobs/:id/unlock` | `{ ok, txHash }` — Bug #4 escape hatch, for a job we hold |
| `GET` | `/providers/:provider/lock` | `LockDetection` — **added 2026-08-16** |
| `POST` | `/providers/:provider/unlock` | `UnlockResult` — **added 2026-08-16** |
| `GET` | `/passports` | `PassportManifest[]` |
| `GET` | `/passports/:id` | `PassportManifest` |

The two provider-scoped routes exist because the job-scoped unlock can only rescue a queue we
already have a local job record for. The account `recovery.ts` was written for is precisely the
one that arrived with its deliverable queue already stranded by an earlier task — which by
definition has no job here and no id to address. A failed chain read returns `502`, never
`locked: false`, because telling a stranded user that everything is fine is worse than telling
them nothing.

```ts
interface Job {
  id: string
  network: 'testnet' | 'mainnet'
  provider: string
  taskId: string | null
  state: TaskState
  createdAt: string
  deliveredAt: string | null           // starts the 48h clock
  acknowledgedAt: string | null
  acknowledgeScheduledFor: string | null
  datasetRootHash: string | null
  adapterPath: string | null
  error: string | null
  queued: boolean                      // provider occupied
  artifactAtRisk: boolean              // acknowledged on-chain without a successful download

  // ── Added 2026-08-16.
  /** The 48h window closed unacknowledged: model lost, 30% forfeit. Its own
   *  boolean because the only previous way to read it over HTTP was
   *  substring-matching the human-readable `error`, which changes whenever a
   *  message is reworded. Independent of `artifactAtRisk`. */
  ackDeadlineMissed: boolean
  /** Complete timestamped state history, oldest first. Without it a client can
   *  render the current state but not when anything happened. */
  transitions: { state: TaskState; at: string }[]

  // ── Added 2026-08-14. The job page renders all four; without them the
  //    Config, Fee and Dataset panels are empty in the live path.
  model?: string                       // e.g. "Qwen2.5-0.5B-Instruct"
  config?: TrainingConfig              // the five 0G parameters
  fee?: {                              // strings, not bigint — must survive JSON
    trainingNeuron: string
    storageReserveNeuron: string
    totalNeuron: string
  }
  dataset?: {
    format: 'chat' | 'instruction' | 'text'
    exampleCount: number
    tokenCount: number
  }

  /**
   * Pre-flight dataset findings, added 2026-08-16. Advisory: a `fail` severity
   * describes the DATASET and never blocks the job, and says nothing about the
   * model or the training run.
   *
   * It carries counts, types and line numbers ONLY. The matched secret is never
   * included — not even in the analysing library's own redacted form, which
   * keeps four characters — because this record is appended to disk and served
   * over HTTP.
   */
  quality?: {
    severity: 'ok' | 'warn' | 'fail' | 'unavailable'
    analyzedAt: string
    recordsAnalyzed: number
    truncated: boolean
    duplicates: { exactGroups: number; redundantRecords: number
                  nearPairs: number; redundantFraction: number }
    leakage?: { clean: boolean; testExampleCount: number
                contaminatedTestCount: number; contaminatedTestLines: number[] }
    pii: { total: number; highSeverity: number
           byType: Record<string, number>; affectedLines: number[] }
    issues: { code: string; severity: string; message: string }[]
    recommendations: string[]
  }
}
```

### `PassportRecord` — what `/passports` returns

A bare `PassportManifest` carries no id and no mint data, so a gallery built on it
cannot link to a passport page or show a token number. `/passports` and
`/passports/:id` therefore return a record that wraps the manifest:

```ts
interface PassportRecord {
  id: string                           // the passport's URL segment
  manifest: PassportManifest
  mint: {
    tokenId: string | null             // null until minted
    contractAddress: string | null
    txHash: string | null
    owner: string | null
    mintedAt: string | null
  }
  name?: string
  summary?: string
}
```

The orchestrator may leave every `mint` field `null` — an un-minted passport is a
valid state, and the UI renders it as "not yet anchored" rather than as an error.

Errors: `{ error: string, code?: string }` with a real HTTP status.

---

## 6. Fixed values — use these verbatim

```
testnet   chain 16602  rpc https://evmrpc-testnet.0g.ai   explorer https://chainscan-galileo.0g.ai
          indexer https://indexer-storage-testnet-turbo.0g.ai
          storage scan https://storagescan-galileo.0g.ai
          provider 0xA02b95Aa6886b1116C4f334eDe00381511E31A09   800000000000 neuron/token
          models  Qwen2.5-0.5B-Instruct

mainnet   chain 16661  rpc https://evmrpc.0g.ai           explorer https://chainscan.0g.ai
          indexer https://indexer-storage-turbo.0g.ai
          storage scan https://storagescan.0g.ai
          provider 0x940b4a101CaBa9be04b16A7363cafa29C1660B0d   500000000000 neuron/token
          models  Qwen2.5-0.5B-Instruct, Qwen3-32B

TEE signer    0x24135b4Bd964872284728F79F5f17eB874C5583A  (both networks, acknowledged)
base hashes   Qwen2.5-0.5B-Instruct  0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7
              Qwen3-32B              0x2e6f9620c35bdcb2b753cc7aa34e78077a8ed133e36fa36008fd6bdfd29af3a5
units         1 0G = 1e18 neuron
hardware      1x H200 · 8 vCPU · 187 GB RAM · 900 GB disk  (both providers)
```

---

## 6b. ⚠️ Solidity: 0G's own guidance is self-contradictory

0G's docs say *"pin to `evmVersion: cancun` and Solidity 0.8.19"*. **Those two are mutually
exclusive.** solc only added the `cancun` EVM target in **0.8.24**; at 0.8.19 both `cancun` and
`shanghai` are rejected outright with `Invalid EVM version requested` (HH600). Probed directly
on this toolchain — `paris` and `london` are the only usable targets at 0.8.19.

**Resolution:** keep the 0.8.19 pin (it's the one 0G's explorer is known to verify) and use
`evmVersion: "paris"` — the highest 0.8.19 supports. This is safe: paris bytecode contains no
`PUSH0` and no cancun-only opcodes, so it executes identically on a cancun-era chain.

Same collision downstream: **OpenZeppelin v5 requires ^0.8.20+** (v5.6's `ERC721.sol` needs
^0.8.24), so it cannot be used at 0.8.19. Use **`@openzeppelin/contracts@^4.9.6`**. Because
OZ 4.9 reverts with strings rather than custom errors, guard with your own custom errors
*before* delegating to OZ so Crucible's public error surface stays custom-error-only.

Revisit both only if the 0.8.19 pin is ever lifted — and re-test 0G explorer verification first.

---

## 7. Coordination rules

1. **Stay in your directory.** Cross-boundary edits get reverted at integration.
2. **This file is the source of truth.** Disagree with it? Report it — don't silently diverge.
3. **Never call the deprecated 0G path** (`downloadModelFrom0GStorage` + `decryptModel` without
   acknowledging). It permanently locks a user's queue. Always `acknowledgeModel`.
4. **No test may require a private key, funds, or live network.** Inject dependencies.
5. **Report real, observed test results.** A claimed pass that didn't run is worse than a
   reported failure.

---
*Last updated: 2026-08-14*
