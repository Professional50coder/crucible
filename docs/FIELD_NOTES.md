# Field Notes — Verified Against the Live Network

Everything here was **executed against the live 0G network on 2026-08-14**, not read
from documentation. Where the docs and reality disagree, reality is recorded and the
discrepancy flagged.

Probe method: `createZGComputeNetworkReadOnlyBroker(rpcUrl)` from
`@0gfoundation/0g-compute-ts-sdk@0.9.0` — **requires no wallet and no private key.**

---

## 🟢 THE BIG ONE: fine-tuning is live, free, and available on MAINNET

The single risk that could have killed this project is resolved.

### Testnet — chain 16602

```
fine-tuning providers   1
inference providers     2

provider              0xA02b95Aa6886b1116C4f334eDe00381511E31A09
url                   https://…-3082.dstack-pha-in2.phala.network
quota                 ["8","187","1","900","H200"]   (cpu, mem GB, gpus, storage GB, GPU)
pricePerToken         800000000000  neuron
occupied              false     ← AVAILABLE
teeSignerAddress      0x24135b4Bd964872284728F79F5f17eB874C5583A
teeSignerAcknowledged true
models available      Qwen2.5-0.5B-Instruct
```

### Mainnet — chain 16661

```
fine-tuning providers   1
inference providers     21

provider              0x940b4a101CaBa9be04b16A7363cafa29C1660B0d
url                   https://…-3080.dstack-pha-in2.phala.network
quota                 ["8","187","1","900","H200"]
pricePerToken         500000000000  neuron     ← 37.5% CHEAPER than testnet
occupied              false     ← AVAILABLE
teeSignerAddress      0x24135b4Bd964872284728F79F5f17eB874C5583A
teeSignerAcknowledged true
models available      Qwen2.5-0.5B-Instruct, Qwen3-32B
```

### What this changes

1. **Fine-tuning works on mainnet.** The `fine-tuning-example` repo's `.env.example`
   says *"Mainnet … — fine-tuning not yet available"*. **That comment is stale.** The SDK
   ships `MAINNET_MODELS`, mainnet indexer URLs, and a live, unoccupied mainnet provider.
2. **Mainnet is cheaper than testnet** (500 vs 800 neuron/token). No reason to prefer testnet.
3. **Crucible should run its real flow on mainnet.** That means the Wave 3 requirement —
   *mainnet contract address + explorer link showing on-chain activity* — is satisfied by
   the product actually working, not by a token contract deployed to tick a box. Much
   stronger submission.
4. **Providers run in Phala dstack (Intel TDX) TEEs**, with an on-chain acknowledged TEE
   signer. Combined with `broker.fineTuning.verifyService()`, the TEE attestation in a
   Crucible passport is a **real, independently verifiable claim** — not marketing.
5. **Only one provider per network.** Tasks queue one at a time. `occupied` must be
   checked and surfaced; a busy provider is a first-class UI state, not an error.

---

## Correct package names

The Builder Hub and the example repo disagree. Both package families are live on npm:

| Package | Version | License | Notes |
|---|---|---|---|
| `@0gfoundation/0g-compute-ts-sdk` | **0.9.0** | ISC | **Current.** What the docs recommend. Use this. |
| `@0gfoundation/0g-storage-ts-sdk` | **1.2.11** | ISC | **Current.** |
| `@0glabs/0g-serving-broker` | 0.7.8 | ISC | Older. What `fine-tuning-example` pins (^0.7.1). |
| `@0glabs/0g-ts-sdk` | 0.3.3 | ISC | Older storage SDK. |

**Decision: build on `@0gfoundation/*`.** All ISC — permissive, reuse is fine with attribution.

---

## The real API surface (undocumented on build.0g.ai)

### Read-only, no wallet
```ts
createZGComputeNetworkReadOnlyBroker(rpcUrl, chainId?)
  .fineTuning.listService(includeUnacknowledged?)  // ServiceStructOutput[]
  .fineTuning.listModel()                          // [[name, cfg][], [providerModels][]]
  .inference.listService()
  .inference.listServiceWithDetail()               // includes healthMetrics.uptime
```

### Authenticated (`createZGComputeNetworkBroker(signer)`)
```ts
broker.fineTuning.uploadDataset(dataPath, gasPrice?, maxGasPrice?)   → string (root hash)
broker.fineTuning.uploadDatasetToTEE(provider, datasetPath)          → { datasetHash, message }
broker.fineTuning.calculateToken(datasetPath, model, usePython, provider?)
broker.fineTuning.createTask(provider, model, datasetHash, trainingPath, gasPrice?) → taskId
broker.fineTuning.getTask(provider, taskID?)                         → Task
broker.fineTuning.listTask(provider)                                 → Task[]
broker.fineTuning.getLog(provider, taskID?)                          → string
broker.fineTuning.cancelTask(provider, taskID)
broker.fineTuning.acknowledgeModel(provider, taskId, dataPath, {
    downloadMethod?: 'auto' | 'tee' | '0g-storage',   // auto = 0G Storage first, TEE fallback
    teeIdleTimeoutMs?: number,                        // default 60_000, IDLE not total
    teeMaxRetries?: number,                           // default 2 → 3 attempts
})
broker.fineTuning.acknowledgeDeliverable(provider, taskId, gasPrice?)  // escape hatch, see below
broker.fineTuning.downloadLoRAFromTEE(provider, taskId, outputPath, opts?)
broker.fineTuning.verifyService(provider, outputDir?, onLog?)          → VerificationResult
broker.fineTuning.getAccountWithDetail(provider)                       → { account, refunds[] }
broker.fineTuning.acknowledgeProviderSigner(provider, gasPrice?)
```

### `ServiceStructOutput` field names (verified)
`provider · url · quota · pricePerToken · occupied · models · teeSignerAddress · teeSignerAcknowledged`

---

## ⚠️ Footguns, verified from SDK source comments

### Bug #4 — the permanently locked queue
The SDK's own docs describe a failure from a **"May 2026 hackathon bug report"**:

> A user retrieved a model via the legacy two-step `downloadModelFrom0GStorage` +
> `decryptModel` flow and never called `acknowledgeModel`. Days later the artifact was
> garbage-collected from both 0G Storage and the TEE buffer, at which point
> `acknowledgeModel` could no longer succeed (it requires a successful download), and the
> user's deliverable queue was **permanently locked** — every subsequent `addDeliverable`
> reverted with *"previous deliverable not acknowledged"*.

- `downloadModelFrom0GStorage` and `decryptModel` are both **deprecated** for this reason.
- Always use `acknowledgeModel` — it downloads, verifies the on-chain hash, and acks in one call.
- `acknowledgeDeliverable(provider, taskId)` is the escape hatch for an already-stuck queue.

**This is a headline Crucible feature.** Users get locked out of the network by a documented
bug; Crucible's daemon makes it structurally impossible to hit.

### The 48-hour deadline
After a task reaches `Delivered`, you have **48 hours** to acknowledge or you lose the model
*and* 30% of the fee is deducted. Nothing warns you. Crucible automates this.

### Duplicate upload reverts — and that's fine
Re-uploading an identical file reverts with `execution reverted` / `CALL_EXCEPTION`, because
the flow contract rejects a root hash it already has. **This is expected** — catch it and
reuse the existing root hash. (Learned from `fine-tuning-example/src/upload-dataset.ts`.)

### Decrypt-too-early
`decryptModel` before status reaches `Finished` fails with `second arg must be public key`.
Provider needs ~1 minute after acknowledge to settle and upload the key. Poll, don't guess.

---

## Task lifecycle

```
Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered
     → UserAcknowledged → Finished
                                                          ↘ Failed
```
`Delivered` starts the 48-hour clock. `Finished` is when decryption becomes possible.

---

## Models

| Model | Networks | Tokenizer | LoRA size | Storage reserve fee |
|---|---|---|---|---|
| `Qwen2.5-0.5B-Instruct` | testnet + mainnet | `Qwen/Qwen2.5-0.5B-Instruct` | ~100 MB | 0.01 0G |
| `Qwen3-32B` | **mainnet only** | `Qwen/Qwen3-32B` | ~900 MB | 0.09 0G |

Model names take **no `Qwen/` prefix** when passed as `--model`.
Each model carries a `turbo` hash (TEE storage) and an empty `standard` hash — the contract
validates the model hash against registered providers at task creation.

---

## Endpoints

```
Testnet  RPC      https://evmrpc-testnet.0g.ai              chain 16602
Mainnet  RPC      https://evmrpc.0g.ai                      chain 16661
Testnet  indexer  https://indexer-storage-testnet-turbo.0g.ai
                  https://indexer-storage-testnet-standard.0g.ai
Mainnet  indexer  https://indexer-storage-turbo.0g.ai
                  https://indexer-storage-standard.0g.ai
Explorer          https://chainscan.0g.ai  ·  https://chainscan-galileo.0g.ai
Storage Scan      https://storagescan.0g.ai            (MAINNET only)
                  https://storagescan-galileo.0g.ai    (TESTNET — separate deployment)
Faucet            https://faucet.0g.ai        (0.1 0G/day, testnet)
```

Also in the SDK: Automata attestation RPC `https://1rpc.io/ata`, contract
`0xE26E11B257856B0bEBc4C759aaBDdea72B64351F` — used for TEE quote verification.

---

## Dataset formats (from `fine-tuning-example/dataset/README.md`)

Three formats; **pick one and use it consistently**. Chat-messages is *recommended* for
instruct models.

```jsonc
// 1. Chat messages (recommended) — supports multi-turn and system prompts
{"messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}

// 2. Instruction — `input` may be empty
{"instruction":"…","input":"…","output":"…"}

// 3. Text completion
{"text":"…"}
```

Requirements: JSONL, UTF-8, ≥10 examples, no trailing commas, no blank lines between records.

**Sizing guidance from 0G:** minimum 10, but **200–1,000** examples for Qwen2.5-0.5B and
500–5,000 for Qwen3-32B to see real behaviour change. The shipped example is 30 train / 10 test.

---

## Training config

The shipped working config differs from the docs' template:

```jsonc
// docs template                    // fine-tuning-example/config/training_config.json
{                                   {
  "neftune_noise_alpha": 5,           "neftune_noise_alpha": 5,
  "num_train_epochs": 1,              "num_train_epochs": 3,
  "per_device_train_batch_size": 2,   "per_device_train_batch_size": 2,
  "learning_rate": 0.0002,            "learning_rate": 0.0002,
  "max_steps": 3                      "max_steps": 45
}                                   }
```

Rules (enforced by `crucible-core`): exactly these five keys, no additions, no removals,
decimal notation for `learning_rate` (never `2e-4`). Ranges: `neftune_noise_alpha` 0–10;
`num_train_epochs` positive int; `per_device_train_batch_size` 1–4; `learning_rate`
0.00001–0.001; `max_steps` −1 or positive int.

---

## Open questions still to resolve

1. **Is `occupied` global or per-user?** One provider per network with a single-task queue
   is a hard constraint if global. Test by creating a task while another is running.
2. **What does `calculateToken`'s `usePython` flag require?** May need a local Python
   tokenizer; matters for client-side fee estimation.
3. **`verifyService` output shape** — need a real run to design the passport's attestation section.
4. **Real wall-clock training time** for 30 examples on an H200. Determines whether live
   training is filmable for the 3-minute demo or needs to be pre-baked.

Items 1–4 all need a funded wallet, so they belong to the first authenticated run.

---

## ⚠️ SUPERSEDED — the 3 0G ledger minimum (this section was WRONG)

> **Do not act on this section.** It records a conclusion that was later disproved by reading
> the chain directly. Kept, struck through, because the *reasoning error* is instructive:
> I treated an SDK error message as ground truth about on-chain behaviour. See
> **"CORRECTION: the 3 0G minimum is an SDK bug"** near the end of this file for what is
> actually true, and **"FIRST REAL FINE-TUNING TASK"** for the run that settled it.

~~Tested directly against testnet on 2026-08-14 with a funded wallet:~~

```
>>> broker.ledger.addLedger(0.1)
FAILED: Minimum balance to create a ledger is 3 0G, but got 0.1 0G.
        Please use: broker.ledger.addLedger(3)
```

~~So it is **not** merely the docs' example figure — the SDK enforces it client-side before any
transaction is sent.~~

**What was actually true:** that message is a hardcoded client-side guard applied on every
network. The chain's own `MIN_ACCOUNT_BALANCE` on testnet is **0.1 0G** — thirty times lower.
The guard rejects before a transaction is ever sent, so the chain never got a say, and I never
checked what the chain would have said.

**The lesson worth keeping:** "the SDK refused" and "the network refuses" are different claims.
An error message is evidence about the client, not about the protocol. Reading
`MIN_ACCOUNT_BALANCE()` — a public view, one call, no wallet needed — would have settled it in
seconds and saved a day of treating this as a hard blocker.

Contract addresses (from the SDK, both networks):

```
testnet   ledger 0xE70830508dAc0A97e6c087c75f402f9Be669E406
          inference 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E
          fineTuning 0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA
mainnet   ledger 0x2dE54c845Cd948B72D2e32e39586fe89607074E3
          inference 0x47340d900bdFec2BD393c626E12ea0656F938d84
          fineTuning 0x4e3474095518883744ddf135b7E0A23301c7F9c0
```

There is no user-side `MIN_DEPOSIT` in the contract ABI — only `MIN_LOCKTIME` and
`MIN_PROVIDER_STAKE` (provider-side). The 3 0G floor is imposed by the **SDK**, not the chain.

---

## 🔴 CORRECTION: the "3 0G minimum" is an SDK bug, not a chain rule

**Earlier in this document I recorded the 3 0G ledger minimum as real and enforced. That was
wrong for testnet, and the error was mine — I trusted the SDK's rejection message instead of
reading the chain.**

The `LedgerManager` contract exposes the minimum as a public view. Read live 2026-08-14:

| | `MIN_ACCOUNT_BALANCE` | `MIN_TRANSFER_AMOUNT` |
|---|---|---|
| **Testnet** (`0xE70830508dAc0A97e6c087c75f402f9Be669E406`) | **0.1 0G** | 0.01 0G |
| **Mainnet** (`0x2dE54c845Cd948B72D2e32e39586fe89607074E3`) | 3.0 0G | 1.0 0G |

`broker.ledger.addLedger()` applies a hardcoded client-side guard of **3 0G on every network**,
including testnet where the chain asks for 0.1. The guard rejects before any transaction is
sent, so the chain never gets a say:

```
FAILED: Minimum balance to create a ledger is 3 0G, but got 0.1 0G.
        Please use: broker.ledger.addLedger(3)
```

**Impact:** a new builder with faucet tokens (0.1 0G/day) is told they need a 30-day wait to
run a job that costs ~0.05 0G. They do not. They need one day. This is the single largest
barrier in 0G's onboarding funnel and it is a client-side off-by-30x.

**Workaround** — call the contract directly and the chain accepts it immediately:

```js
const c = new ethers.Contract(LEDGER_ADDR, LedgerManager__factory.abi, wallet)
await c.addLedger('', { value: ethers.parseEther('0.3') })   // testnet
```

Confirmed working: ledger created with **0.3 0G**, tx
[`0x36b4f848…7ec570`](https://chainscan-galileo.0g.ai/tx/0x36b4f848020c4e611c2f524e1adf8fb5214f77b892e89d86160d61ffea7ec570),
block 49369251, gas 154,771.

---

## 🔴 Both dataset upload paths are broken on Windows

Neither documented upload method works on win32 with `@0gfoundation/0g-compute-ts-sdk@0.9.0`.

**1. `uploadDatasetToTEE()` → `window is not defined`**
A browser global is referenced on a Node code path. Fails before any network call.

**2. `uploadDataset()` → `ENOENT` spawning `binary/0g-storage-client`**
The file exists (45 MB) but its magic bytes are `7f 45 4c 46` — an **ELF binary**. The SDK
ships a *Linux* executable and spawns it on Windows, where it cannot run and has no `.exe`
extension.

Together these make 0G fine-tuning unusable on Windows through the official SDK.

**Workaround Crucible uses** — bypass both and upload with the pure-JS storage SDK, which
spawns nothing and touches no browser globals:

```js
import { Indexer, ZgFile } from '@0gfoundation/0g-storage-ts-sdk'
const file = await ZgFile.fromFilePath(path)
const [tree] = await file.merkleTree()
const rootHash = tree.rootHash()
const [tx, err] = await indexer.upload(file, RPC_URL, signer)
await file.close()
// pass rootHash straight to broker.fineTuning.createTask(...)
```

Confirmed: dataset uploaded, root hash `0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd`,
tx `0xc38e41315c97911bda12bdea3c0387eecf70d86fbae9cf78a1fc66ff09d7da52`.

---

## ✅ FIRST REAL FINE-TUNING TASK CREATED — 2026-08-14

The end-to-end flow now works. Task `10551604-2664-4516-86cf-269a62f93bfc`:

```
preTrainedModelHash  0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7
datasetHash          0xa5051ae76e5bc0e3c64975dea37231dba744945ad50f564c9534948139e7dbfd
trainingParams       {"neftune_noise_alpha":5,"num_train_epochs":3,
                      "per_device_train_batch_size":2,"learning_rate":0.0002,"max_steps":10}
progress             Init
userAddress          0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF
```

That is **exactly the provenance chain Crucible exists to capture** — base-model hash, dataset
root hash, training config — now real rather than fixture data. `fee` reads `0` at `Init`; the
broker computes it during the setup phase once it has counted tokens.

### What it actually cost

| | Amount |
|---|---|
| Faucet grant | 0.5 0G |
| Ledger created with | 0.3 0G |
| Transferred to fine-tuning sub-account | 0.15 0G |
| Gas for ledger creation | ~0.0006 0G |
| **True minimum to start on testnet** | **~0.15 0G** — not 3 |

The SDK warns that providers may want ≥1 0G in the sub-account; 0.15 was accepted at task
creation. Whether it survives settlement is still open.
