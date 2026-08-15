# Crucible — Architecture

Technical description for the 0G Bridge Buildathon, Wave 3.

Crucible turns a fine-tuning run on the 0G Compute Network into a **Model Passport**: a
canonical manifest recording the base model, dataset, hyperparameters, fee and TEE provider,
stored on 0G Storage, hash-anchored on 0G Chain, and minted as an ERC-7857 Agentic ID.

Every network value in this document was verified against the live 0G network on 2026-08-14
and is recorded in [../docs/FIELD_NOTES.md](../docs/FIELD_NOTES.md). Component boundaries are
fixed by [../docs/INTERFACES.md](../docs/INTERFACES.md).

---

## 1. Components

```mermaid
flowchart TB
    subgraph client["Browser"]
        WEB["apps/web · Next.js<br/>upload → configure → launch<br/>live training view<br/>passport page + public gallery"]
        WALLET["wallet<br/>wagmi / RainbowKit"]
    end

    subgraph server["Local / hosted services"]
        ORCH["services/orchestrator<br/>job store · task poller<br/>auto-acknowledge daemon<br/>HTTP + SSE on :8787"]
        CORE["packages/core<br/>dataset validation & conversion<br/>training-config rules<br/>fee estimation<br/>manifest + canonical keccak256"]
        CLI["packages/cli<br/>crucible doctor<br/>credential-free preflight"]
    end

    subgraph og["0G Network"]
        COMPUTE["0G Compute<br/>fine-tuning provider<br/>Intel TDX TEE · 1x H200"]
        STORAGE["0G Storage<br/>dataset root hash<br/>manifest root hash"]
        CHAIN["0G Chain<br/>chain 16661 mainnet<br/>chain 16602 testnet"]
    end

    PASSPORT["Passport.sol<br/>ERC-7857 Agentic ID<br/>lineage hashes · verifyManifest"]

    WEB -->|"POST /jobs · GET /jobs/:id/stream"| ORCH
    WEB -->|"read passports, verifyManifest"| PASSPORT
    WALLET -->|"mint · authorizeUsage"| PASSPORT
    CLI --> CORE
    CLI -->|"read-only broker, no wallet"| COMPUTE
    ORCH --> CORE
    ORCH -->|"createTask · getTask · getLog<br/>acknowledgeModel"| COMPUTE
    ORCH -->|"uploadDataset · put manifest"| STORAGE
    CORE -.->|"canonical manifest hash"| PASSPORT
    PASSPORT --- CHAIN
    COMPUTE -->|"delivery hash-checked<br/>against on-chain root hash"| CHAIN
    STORAGE --- CHAIN
```

**Boundaries, briefly.**
`packages/core` owns every rule that can be checked without a network — dataset format,
the five-key training config, fee arithmetic, the manifest shape and its canonical hash. It is
pure and fully unit-testable, which is why no test in this repo requires a private key, funds,
or a live network. `services/orchestrator` owns everything stateful and time-dependent: the job
record, the poller, and the daemon that must act before a deadline. `apps/web` consumes both and
owns nothing shared. `contracts` owns the on-chain shape.

---

## 2. The full flow — fine-tune → passport → mint

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as apps/web
    participant O as orchestrator
    participant C as core
    participant S as 0G Storage
    participant P as 0G Compute TEE
    participant X as Passport.sol on 0G Chain

    U->>W: upload dataset + choose base model
    W->>O: POST /jobs
    O->>C: validate dataset + training config
    C-->>O: JSONL, example count, format
    Note over C: every 0G rejection rule is caught<br/>locally, before any funds move
    O->>C: estimate fee from live pricePerToken
    C-->>O: training + storage reserve + total (neuron)
    W-->>U: cost shown, confirm

    O->>S: uploadDataset(jsonl)
    S-->>O: dataset root hash
    Note over O,S: a duplicate upload reverts with CALL_EXCEPTION —<br/>expected; the existing root hash is reused

    O->>P: createTask(provider, model, datasetHash, config)
    P-->>O: taskId

    loop poll until terminal
        O->>P: getTask / getLog
        P-->>O: state + training logs
        O-->>W: SSE event: state
        W-->>U: live progress
    end

    P->>X: deliverable committed, artifact hash on-chain
    P-->>O: state = Delivered
    Note over O: 48-hour clock starts.<br/>daemon schedules acknowledge immediately —<br/>always acknowledgeModel, never the legacy path

    O->>P: acknowledgeModel(provider, taskId, path)
    P-->>O: LoRA adapter downloaded + hash-verified
    Note over O,P: state reaches Finished ~60s later;<br/>decryption before Finished fails with<br/>'second arg must be public key'

    O->>C: build PassportManifest
    C-->>O: canonical JSON + keccak256 manifest hash
    O->>S: store manifest
    S-->>O: manifest root hash

    W-->>U: passport page — every hash with its verification link
    U->>X: mint(to, PassportData, encryptedURI)
    X-->>U: tokenId — ERC-7857 Agentic ID

    Note over U,X: anyone can now recompute the manifest hash<br/>and call verifyManifest(tokenId, hash) — no wallet needed
```

---

## 3. Task lifecycle

Ten states, mirroring 0G's real fine-tuning state machine. Ordered; never runs backwards; any
state can fail. The transition that destroys models is `Delivered`.

```mermaid
stateDiagram-v2
    direction TB
    [*] --> Init
    Init --> SettingUp
    SettingUp --> SetUp
    SetUp --> Training
    Training --> Trained
    Trained --> Delivering
    Delivering --> Delivered

    Delivered --> UserAcknowledged : acknowledgeModel()<br/>MUST happen within 48h
    Delivered --> Failed : deadline missed —<br/>model lost + 30% fee deducted
    UserAcknowledged --> Finished : provider settles (~60s)<br/>decryption possible only here
    Finished --> [*]

    Init --> Failed
    SettingUp --> Failed
    SetUp --> Failed
    Training --> Failed
    Trained --> Failed
    Delivering --> Failed
    Failed --> [*]

    note right of Delivered
        THE 48-HOUR DEADLINE
        0G sends no notification.
        Crucible's daemon acknowledges
        on arrival, not at the buzzer.
    end note

    note right of UserAcknowledged
        Only ever reached via acknowledgeModel.
        The deprecated downloadModelFrom0GStorage
        + decryptModel path can strand the queue
        permanently. See the May 2026 SDK bug report.
    end note
```

A provider reporting `occupied: true` is a **queued** state in Crucible's job model, not an
error — there is exactly one fine-tuning provider per network and tasks run one at a time.

---

## 4. The Model Passport

The manifest is the artifact everything else points at.

```jsonc
{
  "version": 1,
  "network": "mainnet",
  "chainId": 16661,
  "createdAt": "…",
  "task":     { "id": "…", "provider": "0x940b4a10…", "state": "Finished" },
  "base":     { "model": "Qwen2.5-0.5B-Instruct", "modelHash": "0x…", "tokenizer": "Qwen/…" },
  "dataset":  { "rootHash": "0x…", "format": "instruction", "exampleCount": 50, "tokenCount": 10000 },
  "training": { "neftune_noise_alpha": 5, "num_train_epochs": 3,
                "per_device_train_batch_size": 2, "learning_rate": 0.0002, "max_steps": 45 },
  "adapter":  { "rootHash": "0x…", "sizeBytes": 0 },
  "fee":      { "trainingNeuron": "…", "storageReserveNeuron": "…", "totalNeuron": "…" },
  "tee":      { "signerAddress": "0x24135b4B…", "acknowledged": true, "attestationVerified": true }
}
```

**Canonicalization is the load-bearing invariant.** `canonicalize(manifest)` emits JSON with
every key sorted recursively and no whitespace; `manifestHash = keccak256(utf8(canonical))`.
Two manifests with identical content must serialize byte-identically regardless of key insertion
order — otherwise the on-chain anchor means nothing, because a verifier could not reproduce it.

On-chain, `Passport.sol` stores the lineage as fixed-width hashes:

```solidity
struct PassportData {
    bytes32 baseModelHash;
    bytes32 datasetRootHash;
    bytes32 configHash;
    bytes32 adapterRootHash;
    bytes32 manifestRootHash;   // public — verifiable without decryption
    string  taskId;
    address provider;
    uint64  mintedAt;
}
```

Invariants: lineage is immutable after mint; at most 100 authorizations per token; **all
authorizations are cleared on transfer**; and the same
`(datasetRootHash, configHash, adapterRootHash)` triple cannot be minted twice — one fine-tune,
one passport.

---

## 5. Which 0G modules we use and how

Crucible uses **all four** 0G components. Not as a checklist — each one is load-bearing, and
removing any of them breaks a specific guarantee.

### 5.1 0G Compute — where training happens

SDK: `@0gfoundation/0g-compute-ts-sdk@0.9.0`.

- **Discovery without credentials.** `createZGComputeNetworkReadOnlyBroker(rpcUrl)` requires no
  wallet and no private key. Crucible uses it for `fineTuning.listService()` and
  `fineTuning.listModel()`, which is what lets `crucible doctor` and the web app's provider view
  work for a visitor who has connected nothing. It is also why this project's entire discovery
  and validation layer was built and tested before a wallet was ever funded.
- **Fee estimation.** `pricePerToken` is read live from the service struct — 500 neuron/token on
  mainnet, 800 on testnet — and combined with the per-model storage reserve fee. `core`'s fee
  module reproduces 0G's own documented worked example exactly, which is how we know the
  arithmetic matches theirs rather than merely looking plausible.
- **Task execution.** `createTask` → `getTask` / `getLog` polling → `acknowledgeModel`. The
  orchestrator never calls the deprecated `downloadModelFrom0GStorage` + `decryptModel` pair.
- **TEE.** The mainnet provider `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d` runs Intel TDX via
  Phala dstack on 1x H200 (8 vCPU, 187 GB RAM, 900 GB disk). Its TEE signer
  `0x24135b4Bd964872284728F79F5f17eB874C5583A` is acknowledged on-chain, and `verifyService()`
  checks the attestation. This is why the passport's TEE section is a checkable claim rather
  than a marketing sentence.
- **The footgun handling is the product.** Funding is routed explicitly to the fine-tuning
  sub-account, not the inference one. Duplicate uploads are caught and the existing root hash
  reused. Decryption waits for `Finished`. Acknowledgement is scheduled the moment `Delivered`
  is observed.

### 5.2 0G Storage — where the evidence lives

SDK: `@0gfoundation/0g-storage-ts-sdk@1.2.11`. Indexers: `https://indexer-storage-turbo.0g.ai`
(mainnet), `https://indexer-storage-testnet-turbo.0g.ai` (testnet).

- **The dataset** is uploaded before task creation and addressed by its root hash. That root hash
  is what the 0G contract validates the delivered artifact against, and it is what a third party
  retrieves to check that a passport's training data is what it says it is.
- **The manifest** is stored the same way, so the passport is not hosted by us. If Crucible's
  web app disappears, the manifest is still retrievable at its root hash and still hashes to the
  value anchored on-chain. Provenance that depends on a running server is not provenance.

### 5.3 0G Chain — where the claim becomes checkable

Mainnet chain **16661**, RPC `https://evmrpc.0g.ai`, explorer `https://chainscan.0g.ai`.
Solidity 0.8.19 with `evmVersion: cancun` — pinned because newer EVM versions fail explorer
source verification.

- `Passport.sol` is deployed here and source-verified on chainscan.
- `verifyManifest(tokenId, candidateHash)` is a `view` function: anyone can recompute the
  canonical hash from the manifest they fetched from 0G Storage and ask the chain whether it
  matches what was anchored at mint time. No wallet, no trust in us.
- Mints, authorizations and revocations are the on-chain activity the submission points at.

### 5.4 0G Agentic ID (ERC-7857) — where the model gets an identity

Patterns studied from `0gfoundation/agenticID-examples` and reimplemented.

- One completed fine-tune mints exactly one Agentic ID token. The lineage hashes are the token's
  data, so the provenance travels with ownership rather than sitting in a database row.
- `authorizeUsage(tokenId, executor, permissions)` and `revokeAuthorization` express delegated
  use — the primitive that a model-licensing flow would later be built on. Capped at 100
  authorizations per token, and **all authorizations clear on transfer**, so buying a passport
  does not inherit the seller's grants.
- The encrypted-URI field carries the private artifact reference while `manifestRootHash` stays
  public — which is what allows verification without decryption.

---

## 6. Limits, stated plainly

- **Lineage, not honest training.** Crucible proves the artifacts hash-match, the dataset is
  retrievable, the TEE signer is acknowledged, and 0G's integrity check passed. It does not
  prove the provider ran the epochs it claimed. Proving that requires ZK circuits over the
  training computation (see [arXiv 2510.16830](https://arxiv.org/html/2510.16830v1)) and is
  roadmap, not claim.
- **One provider per network.** 0G currently exposes a single fine-tuning provider on each
  network with a single-task queue. Crucible treats `occupied` as a first-class queued state,
  but it cannot route around a constraint that does not have an alternative yet.
- **The manifest is only as honest as its inputs.** Crucible records what 0G reports. Where 0G
  itself does not attest a value, the passport does not pretend it is attested.
- **Prior art exists.** vouch-protocol's Birth Certificate Protocol, OpenSSF Model Signing v1.0,
  and Cisco's Model Provenance Kit all predate this. Crucible's contribution is the 0G-native
  implementation, not the idea. See [../docs/PRIOR_ART.md](../docs/PRIOR_ART.md).

---

## 7. Local reproduction

Full setup, environment variables and verification steps are in the root
[README](../README.md). The short version:

```bash
npm install && npm run build && npm test
npm run doctor -w @crucible/cli          # live network check, no wallet required
npm start   -w @crucible/orchestrator    # :8787
npm run dev -w @crucible/web             # :3000
cd contracts && npx hardhat test
```
