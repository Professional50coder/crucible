# Updates in this Wave — Wave 4

This file is the source text for AKINDO's **"Updates in this Wave"** field. That field is what
the **Progress & Momentum** criterion reads, and Progress & Momentum is **40%** of the score —
the single largest weight. It is worth writing properly.

> **The rule from Wave 3 still stands:** any line describing work that did not actually land must
> be deleted, not softened. A changelog claiming something that isn't in the repo is worse than a
> shorter one, because a judge can check the repo in thirty seconds.
>
> **Audited 2026-09-18** against the repo and the live chain. Every claim below was executed or
> read back this session; the two biggest — the DEFECT-01 fix and the ERC-8004 registration — are
> the direct answers to Wave 3 feedback. Wave 3 scored **3 points / 202.5 USDC**; Wave 4 closes
> **2026-09-20**.

---

<!-- PASTE FROM HERE -->

## Crucible — Wave 4

**What it is:** Crucible turns fine-tuning on the 0G Compute Network into a single upload and
issues every resulting model a verifiable birth certificate — base model, dataset, hyperparameters
and TEE provider — canonically hashed, anchored on 0G Chain, and minted as an ERC-7857-*style*
Agentic ID.

**What changed this wave:** the defect that lost a model on Windows is now **fixed, not just
diagnosed**; the passport lineage is **registered in 0G's live ERC-8004 Identity Registry** on
testnet; and the app gained a **3D layer that does not touch the on-chain values it renders**. All
three were re-run against the live network on 2026-09-18.

**Where it is not finished:** `Passport.sol` is **still not on 0G mainnet (16661)**. That is the
hard requirement carried over from Wave 3 and it is the largest thing still open. It is stated here
rather than left for a judge to discover.

---

### 1 · The judge's fix: DEFECT-01 is resolved, and failed runs are recoverable

Wave 3's headline defect was that on Windows + Node 22 the 0G SDK's `acknowledgeModel` cannot
retrieve a delivered model on either path — the 0G Storage path spawns a Linux ELF binary that
ENOENTs, the TEE path fails on every platform — so a Windows user hits both, loses the model, and
forfeits 30% of the fee. Judge **notmartin**'s Wave 3 feedback was exact: *"Fix the path that
anchored a sentinel hash, and make failed training or acknowledgement attempts recoverable without
confusing a placeholder with a real adapter root."* Both halves are done (commit `5e089f4`).

- **`HttpModelRetriever` retrieves without the broken SDK.** It downloads the delivered model
  straight from the 0G Storage indexer over plain HTTP — `GET {indexer}/file?root=<modelRootHash>`,
  no bundled binary — then **re-derives the 0G Storage Merkle root of the bytes** and refuses to
  acknowledge unless it matches the on-chain `modelRootHash`. The root reimplementation
  (`services/orchestrator/src/storage-hash.ts`) is dependency-free and SDK-exact, pinned by
  known-answer tests generated from `@0gfoundation/0g-storage-ts-sdk` v1.2.11 across 11 sizes.
  `preferHttpRetrieval()` selects this path on win32; the SDK path is retained elsewhere.
- **Proven on a Windows machine, 2026-09-18.** The 584-byte Passport #1 manifest was downloaded
  from `indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e6…e1140` and its `zgStorageRoot`
  recomputed to `0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140` — an exact
  match. The operation that used to ENOENT on Windows now completes and validates. This is a
  Windows-verified retrieval + integrity check; it is **not** a new fine-tune.
- **A sentinel can never be published as a real adapter root.** `packages/core` now types adapter
  provenance — `AdapterHashSource = 'sentinel' | 'onchain-verified'`, an optional
  `adapter.hashSource` field (optional so legacy manifests hash identically), and
  `assertAdapterProvenance()` / `isVerifiedAdapterRoot()` guards. This is the "placeholder vs real
  adapter root" confusion notmartin named, made structurally impossible.
- **Failed runs upgrade in place.** `QueueRecovery.retrieveAndUpgrade()` and `POST /jobs/:id/retrieve`
  take a failed run from sentinel to onchain-verified once the artifact is retrieved and validated,
  with no duplicate passport — the "recoverable without a placeholder" half of the feedback.

Tests: `packages/core` 160→172, `services/orchestrator` 200→239, both green this session.

### 2 · ERC-8004: the passport lineage is registered on-chain — registered, not verified

`docs/ERC8004.md` worked out in Wave 3 that a Model Passport structurally fits the ERC-8004
Validation Registry, which is not deployed on any chain, and that the Identity Registry that *is*
live fits worst. This wave the optional §4(b) experiment was executed on **0G Galileo testnet
(chain 16602)** (commit `55d1f32`).

| | |
|---|---|
| Registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://chainscan-galileo.0g.ai/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — `AgentIdentity` / `AGENT`, live |
| **agentId** | **420** — Passport #1's model manifest registered as an agent |
| `register` tx | [`0x2a2e86d0…d2c85a`](https://chainscan-galileo.0g.ai/tx/0x2a2e86d027c6865b3be8826142179e97354249bab931c31494062b5352d2c85a) · block 55,445,626 |
| `ownerOf(420)` | `0xf4cEE5c1…FD3EF` — the dev wallet, verified on chain |
| Lineage metadata | six `setMetadata` writes (base model, dataset root, adapter root, manifest root, task id, provider), all **read back byte-equal on chain** |
| Cross-check | `crucible.manifestRootHash` = `0x4f64bfe6…059890f`, the same digest anchored on `Passport.sol` for token #1, where `verifyManifest(1, 0x4f64bfe6…)` returns `true` |

The machine-readable record is `runs/erc8004-galileo.json`, written from values read back off the
chain. Full detail, including the ABI-against-bytecode survey, is `docs/ERC8004.md` §7.

**Read as "registered", never "verified".** Anyone who can pay gas can register; a row in the
Identity Registry attests to nothing but that. It registers a **model artifact as an agent** — a
deliberate category claim. The registry is an **upgradeable proxy whose admin we have not
identified**, so the code answering these calls can be replaced by someone we cannot name. Crucible
is a **user** of these registries, not an implementation — nothing here is "ERC-8004 compliant".
**No mainnet write was attempted.**

> **Correction carried in this wave:** `docs/AGENTIC_ID_ALIGNMENT.md` previously attributed the
> manifest hash `0x0f46406e…` to Passport #1. That value belongs to **token #2**. Passport #1's
> manifest hash is `0x4f64bfe6…059890f`, as `verifyManifest(1, …)` and the registry read-back both
> confirm.

### 3 · A 3D UI that leaves the evidence untouched

react-three-fiber was added **inside the existing monochrome design system**, not over it:

- A wireframe **"forged core" 3D hero** on the landing page and a small **3D seal** on the passport
  certificate.
- Both are **lazy client-only** (`next/dynamic` with `ssr: false`), so the passport page still
  **server-renders its real on-chain values** — the 3D never gates the evidence.
- A **static SVG fallback** renders under no-WebGL and under `prefers-reduced-motion`.
- Deps: `three@0.170.0`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`. Commit `a709f33`.

`apps/web` tests 342→349, and `next build` is green across 7 routes — verified this session.

---

### Proof anyone can check right now — 0G Galileo testnet (16602)

| | |
|---|---|
| `Passport.sol` | [`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7) — source-verified, `v0.8.19` / `paris` / 200 |
| Passport #1 / #2 mints | [`0xb608a8a5…00b3b1`](https://chainscan-galileo.0g.ai/tx/0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1) · [`0x60094f63…420324`](https://chainscan-galileo.0g.ai/tx/0x60094f63813827391266d7f77c02649342b435d86d297964d499d2deae420324) |
| ERC-8004 registration | agentId **420** · register tx [`0x2a2e86d0…d2c85a`](https://chainscan-galileo.0g.ai/tx/0x2a2e86d027c6865b3be8826142179e97354249bab931c31494062b5352d2c85a) · block 55,445,626 |
| Manifest on 0G Storage | root `0xc757a7e6…e1140` · 584 bytes · re-derived on Windows this wave to an exact match |
| Daemon acknowledgement tx | [`0x4e2c81e2…7e4cfa`](https://chainscan-galileo.0g.ai/tx/0x4e2c81e237efc53623d869d361f212bf649ff132dc6274fbb18dc0d80c7e4cfa) · block 49716408 — sent by the orchestrator itself |
| **The app, live** | **[crucible-orpin.vercel.app](https://crucible-orpin.vercel.app/)** — opens logged out, no wallet, now with the 3D hero and passport seal |

---

### What is still pending — stated, not buried

- **0G mainnet (16661): not deployed.** `Passport.sol` mainnet and the ERC-8004 mainnet
  registration are both pending funding of the mainnet wallet
  `0xD68235F859f3756c87f50619b165F68b80FDdFD4` (balance 0). Deploy + mint is a measured
  **~0.0103 0G** of gas at 4 gwei; the block is holding any mainnet 0G at all, not engineering.
  `tools/erc8004-register.mjs` knows the mainnet registry address but refuses to broadcast to it.
- **`verifyService()` / `attestationVerified` is still `false`.** The TEE signer is recorded but
  the attestation is not verified end to end, so the field is not yet earned. Unchanged this wave.
- **No completed end-to-end fine-tune on Windows through the product.** The retrieval + integrity
  path is now proven on Windows against real 0G Storage bytes, but a fresh fine-tune carried all
  the way to a retrieved adapter on win32 has not been run. Passport #1's adapter hash remains a
  labelled sentinel; its artifact is unrecoverable (empty `encryptedSecret`).

### Test totals — every suite re-run 2026-09-18

`packages/core` 172 · `packages/cli` 62 · `packages/ml` 320 · `services/orchestrator` 239 ·
`apps/web` 349 · `contracts` 104 — **1,246 total**.

### What Crucible still does not claim

**Crucible proves lineage, not honest training.** It proves a manifest hashes to the value anchored
on-chain, the dataset is retrievable at its root hash, and the provider's TEE signer is acknowledged
on-chain. It does **not** prove the provider ran the epochs it claimed — that needs ZK proofs over
the training computation (arXiv 2510.16830), a research programme, not this submission. And an
ERC-8004 registration does not move that line by an inch: registration is not verification.

<!-- PASTE TO HERE -->
