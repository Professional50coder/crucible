# Updates in this Wave — Wave 3

This file is the source text for AKINDO's **"Updates in this Wave"** field. That field is what
the **Progress & Momentum** criterion reads, and Progress & Momentum is **40%** of the score —
the single largest weight. It is worth writing properly.

> **Before pasting:** every `PLACEHOLDER_*` token below must be replaced with a real value, and
> **any line describing work that did not actually land must be deleted, not softened.** A
> changelog claiming something that isn't in the repo is worse than a shorter changelog, because
> a judge can check the repo in thirty seconds. Deletion is free; a caught overclaim is not.

---

<!-- PASTE FROM HERE -->

## Crucible — Wave 3

**What it is:** Crucible turns fine-tuning on the 0G Compute Network into a single upload and
issues every resulting model a verifiable birth certificate — base model, dataset,
hyperparameters and TEE provider — canonically hashed, stored on 0G Storage, anchored on 0G
Chain, and minted as an ERC-7857 Agentic ID.

Crucible went from an empty directory to a working, mainnet-anchored system inside this wave.

---

### Core improvements

- **`@crucible/core` — the library that makes 0G's documented footguns unreachable.** Pure,
  network-free, fully unit-tested. No test in the repo requires a private key, funds, or a live
  network.
- **Training-config validation.** 0G rejects a fine-tuning config with extra *or* missing keys.
  Crucible enforces the exact five-parameter template — `neftune_noise_alpha`,
  `num_train_epochs`, `per_device_train_batch_size`, `learning_rate`, `max_steps` — with per-key
  range checks and a hard rule against exponent notation for `learning_rate`. Every rejection 0G
  would issue is caught locally, before any funds move.
- **Dataset conversion and validation.** Automatic format detection across all three 0G-accepted
  shapes (chat-messages, instruction, text-completion), mixed-format detection reported with
  line numbers, JSONL emission, UTF-8 and minimum-example enforcement, and error capping so a
  broken 15,000-line file produces a readable report instead of a wall.
- **Fee estimation from the live on-chain price.** Reads `pricePerToken` from the provider's
  service struct and adds the per-model storage reserve fee. Verified by reproducing 0G's own
  documented worked example exactly — the arithmetic matches theirs, it does not merely look
  plausible.
- **Passport manifest and canonical hashing.** A deterministic canonicalization — every key
  sorted recursively, no whitespace — so two manifests with identical content serialize
  byte-identically regardless of key insertion order. `keccak256` over those bytes is the value
  anchored on-chain. This is the invariant the entire verification story rests on: if it isn't
  deterministic, the anchor is meaningless.
- **The 48-hour deadline, automated.** After a task reaches `Delivered`, 0G gives you 48 hours to
  acknowledge; miss it and you lose the model *and* 30% of the fee is deducted, with no
  notification of any kind. Crucible's daemon acknowledges on arrival rather than at the buzzer.
- **The permanently-locked-queue bug, made unreachable.** The 0G SDK's own source records a May
  2026 hackathon bug report: a user took the legacy `downloadModelFrom0GStorage` + `decryptModel`
  path without acknowledging, the artifact was later garbage-collected from both 0G Storage and
  the TEE buffer, `acknowledgeModel` could no longer succeed, and every subsequent
  `addDeliverable` reverted with *"previous deliverable not acknowledged"* — the account's queue
  was locked permanently. Crucible only ever calls `acknowledgeModel`, so it cannot reach that
  state, and it exposes `acknowledgeDeliverable` as a one-click unlock for accounts already stuck.

---

### 0G integration

Crucible uses **all four** 0G components, and each one is load-bearing — removing any of them
breaks a specific guarantee.

- **0G Compute.** Provider and model discovery, live fee calculation, task creation, log
  streaming, and acknowledgement, via `@0gfoundation/0g-compute-ts-sdk@0.9.0`. Runs against the
  mainnet fine-tuning provider `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d` — 1x H200 inside an
  Intel TDX enclave (Phala dstack), with TEE signer
  `0x24135b4Bd964872284728F79F5f17eB874C5583A` acknowledged on-chain.
- **Credential-free discovery.** Crucible uses `createZGComputeNetworkReadOnlyBroker`, which
  needs no wallet and no private key, so provider status, hardware quota, TEE state and live
  pricing are visible to a visitor who has connected nothing.
- **0G Storage.** Training datasets and passport manifests are both uploaded and addressed by
  root hash, via `@0gfoundation/0g-storage-ts-sdk@1.2.11`. The passport therefore does not depend
  on Crucible staying online — the manifest is retrievable at its root hash and still hashes to
  the value anchored on-chain. Duplicate uploads (which revert with a bare `CALL_EXCEPTION`) are
  caught and the existing root hash reused.
- **0G Chain.** `Passport.sol` deployed and source-verified on **0G mainnet, chain 16661**.
  Solidity 0.8.19 with `evmVersion: paris`. 0G's docs ask for 0.8.19 *and* cancun; solc only
  added the cancun target in 0.8.24, so the two are mutually exclusive. Paris is the highest
  target 0.8.19 can emit, and its bytecode contains no `PUSH0` or cancun-only opcodes, so it
  runs identically on a cancun-era chain. Probed and documented in `contracts/README.md`.
  - Contract: `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS`
  - Explorer: `PLACEHOLDER_CHAINSCAN_CONTRACT_URL`
  - On-chain activity (deployment + mints): `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL`
- **0G Agentic ID (ERC-7857).** One completed fine-tune mints exactly one Agentic ID token
  carrying its lineage hashes, so provenance travels with ownership instead of living in a
  database row. Includes `authorizeUsage` / `revokeAuthorization` (capped at 100 per token, all
  cleared on transfer) and a public `verifyManifest(tokenId, candidateHash)` view function that
  lets anyone check a manifest against the chain with no wallet and no trust in us.
- **Verified against the live network, not the docs.** Every network fact in this repo was
  executed on 2026-08-14 and published in `docs/FIELD_NOTES.md`, including three corrections to
  0G's own documentation: mainnet fine-tuning **is** available (the official example's
  `.env.example` says it is not) and is **37.5% cheaper** than testnet at 500 vs 800
  neuron/token; the Builder Hub and the official example recommend different SDK package
  families; and the docs' config template (`max_steps: 3`) differs from the shipped working
  config (`max_steps: 45`).

---

### Agent / AI workflow

- **The Model Passport** — a machine-readable, versioned manifest binding a fine-tuned adapter to
  its base model hash, dataset root hash, exact hyperparameters, fee paid, and TEE attestation
  state. This is the artifact the whole project exists to produce.
- **One upload replaces a twelve-step CLI flow** with five documented footguns. Upload → validate
  → estimate → launch → watch → acknowledged automatically → passport → mint.
- **Correct sub-account funding.** 0G's `transfer-fund` silently routes to the *inference*
  sub-account unless `--service fine-tuning` is passed; the failure surfaces much later as an
  unexplained `MinimumDepositRequired`. Crucible funds the fine-tuning sub-account explicitly and
  verifies the balance before creating a task.
- **The real 0G state machine, not an invented progress bar.** Jobs mirror 0G's ten states —
  `Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered → UserAcknowledged →
  Finished`, plus `Failed` — with streamed training logs. A provider reporting `occupied: true`
  is modelled as a first-class **queued** state rather than an error, because 0G exposes exactly
  one fine-tuning provider per network and tasks run one at a time.
- **Timing hazards handled.** Decryption is only attempted at `Finished`; attempting it earlier
  fails with `second arg must be public key` because the provider needs roughly a minute to
  settle and upload the key.

---

### Developer & demo improvements

- **`crucible doctor`** — a credential-free preflight command that reports live fine-tuning
  providers on both networks, whether each is occupied, hardware quota, TEE signer and
  acknowledgement state, current price per token, estimated cost of a demo run, and wallet
  readiness. It needs no private key for the provider half, which is what let the entire
  discovery and validation layer be built and tested before any wallet was funded.
- **Web app** — upload, validate, configure, cost estimate, launch, live training view, public
  Model Passport page with every hash rendered next to its verification link, and a public
  gallery of passports.
- **Independent verification path, documented.** The root README carries a step-by-step procedure
  for verifying any passport with no wallet: fetch the manifest from 0G Storage, recompute the
  canonical `keccak256`, call `verifyManifest` on the chain, then check the dataset root hash,
  the base model hash, and the provider's TEE signer.
- **`docs/FIELD_NOTES.md`** — live-verified network facts, the real SDK surface (much of which is
  undocumented on build.0g.ai), every footgun with its exact error string, and the three
  corrections to 0G's docs above. Written for every other 0G builder, not just for us. We lost
  hours to these; nobody else needs to.
- **`submission/ARCHITECTURE.md`** — component, sequence and state diagrams in Mermaid, plus a
  module-by-module description of how each 0G component is used.
- **Documented prior art and honest positioning.** `docs/PRIOR_ART.md` cites vouch-protocol's
  Birth Certificate Protocol, OpenSSF Model Signing v1.0, Cisco's Model Provenance Kit, and the
  Verifiable Fine-Tuning paper, and states plainly that the framing is not novel — the 0G-native
  implementation is.
- **Reuse declared with licenses.** Contract and frontend patterns were studied from
  `0gfoundation/agenticID-examples`, `0g-deployment-scripts` and `fine-tuning-example` and
  reimplemented rather than copied; every dependency's license is recorded.

---

### What Crucible does not claim

**Crucible proves lineage, not honest training.** It proves the adapter's artifacts hash-match,
the dataset is retrievable at the stated root hash, the provider's TEE signer is acknowledged
on-chain, and 0G's integrity check passed on delivery. It does **not** prove the provider ran the
epochs it claimed — that requires zero-knowledge proofs over the training computation
(PEFT-restricted update circuits enforcing optimizer semantics, per arXiv 2510.16830), which is a
research programme and is on the roadmap, not in this submission.

### Next wave

TEE attestation verification surfaced inside the passport via `verifyService`; OpenSSF Model
Signing interop so passports carry a standards-compliant signature; hosted inference against
fine-tuned adapters; and `authorizeUsage` developed into a model-licensing flow.

<!-- PASTE TO HERE -->

---

## Placeholders that must be filled before this is pasted

| Token | Source |
|---|---|
| `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` | output of the mainnet deploy |
| `PLACEHOLDER_CHAINSCAN_CONTRACT_URL` | `https://chainscan.0g.ai/address/<contract>` |
| `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL` | the contract's transactions tab, or a specific mint tx |

## Lines to delete if the work did not land

Check each against the repo before pasting. Delete, do not reword.

- [ ] Passport manifest + canonical hashing — is `packages/core/src/passport.ts` shipped and tested?
- [ ] Auto-acknowledge daemon — is it implemented in `services/orchestrator`, not just designed?
- [ ] `Passport.sol` deployed **and source-verified on mainnet** — an undeployed contract means the whole "0G Chain" bullet and its three placeholders must go, and the submission fails a hard requirement.
- [ ] Web app: upload flow, live training view, passport page, gallery — each is a separate claim.
- [ ] Any claim that a real fine-tune completed end to end. If the authenticated run has not happened, say what has: the flow is implemented and validated against the live read-only broker. Do not imply a completed training run.
