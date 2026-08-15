---
description: "Crucible — milestone and phase structure"
type: Roadmap
about: "crucible"
---

# Roadmap: Crucible

## Overview

Sixteen days from empty directory to a mainnet-deployed, submitted Wave 3 entry. The journey:
prove the network actually works with a funded wallet (Phase 1), build the library that removes
every known footgun (Phase 2), put the passport on-chain (Phase 3), automate the deadline that
destroys people's models (Phase 4), make it something a judge can click through (Phase 5), then
package it so the 40%-weighted "progress" score has something real to read (Phase 6).

Phase 1 was a **gate, not a build**. It passed: the authenticated flow ran on 0G testnet, so the
pivot to inference provenance was never needed.

## Current Milestone

**v1.0 Wave 3 Submission**
Status: In progress — everything buildable is built; the mainnet deployment is not done
Phases: **4 of 6 complete**

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Spike & Foundation | 3 | ✅ Gate passed — see caveat in 01-03 | 2026-08-14 |
| 2 | crucible-core | 4 | ✅ Complete | 2026-08-15 |
| 3 | Passport Contract | 3 | 🚧 In progress — testnet done, **mainnet not deployed** | - |
| 4 | Orchestrator & Daemon | 3 | ✅ Complete | 2026-08-15 |
| 5 | Web App & Gallery | 4 | ✅ Complete | 2026-08-15 |
| 6 | Submission Package | 4 | 🚧 In progress — docs done, video/X post/AKINDO not | - |

Phase 3 is the only phase blocking the submission, and only its last plan. Mainnet needs about
**0.0103 0G of gas** (deploy 0.008954 + mint 0.001311 at 4 gwei) and the wallet holds 0. The
3.0 0G `MIN_ACCOUNT_BALANCE()` gates *running a fine-tune* on mainnet, not deploying a contract —
do not conflate the two.

**Verified totals as of 2026-08-15: 808 tests** — core 105, ml 320, orchestrator 155, web 158,
contracts 70. `apps/web` also produces a clean `next build`: 7 routes, 88.8 kB shared JS.

## Phase Details

### Phase 1: Spike & Foundation

**Goal:** Prove the full authenticated fine-tuning flow completes on 0G, end to end, and
establish the repo's toolchain. This phase decides whether the project proceeds as designed.
**Depends on:** Nothing
**Research:** Complete — see [docs/FIELD_NOTES.md](../docs/FIELD_NOTES.md)
**Days:** 1–2

**Scope:**
- Monorepo, TypeScript, vitest, Paul — ✅ done
- Read-only network probe (no wallet) — ✅ done, providers confirmed live on both networks
- One real fine-tune: fund → upload → create task → poll → acknowledge → decrypt → LoRA

**Plans:**
- [x] 01-01: Scaffold monorepo + test toolchain + Paul
- [x] 01-02: Read-only provider/model probe; publish FIELD_NOTES
- [x] 01-03: **Authenticated fine-tune run on testnet** — ran; delivered but never acknowledged

**Exit criteria (BDD), as written:**
> **Given** a wallet funded with ≥3 0G on mainnet
> **When** a 30-example dataset is submitted to provider `0x940b4a10…60B0d` for `Qwen2.5-0.5B-Instruct`
> **Then** the task reaches `Finished` and a decrypted LoRA adapter exists on disk,
> **And** the task's dataset hash, model hash and fee are recorded.

**What actually happened — the criteria were only partly met.** The run was moved to testnet
(0.15 0G, not 3 on mainnet) against provider `0xA02b95Aa…1E31A09`. Task
`10551604-2664-4516-86cf-269a62f93bfc` progressed `Init → … → Delivered`, and its dataset root
hash, base-model hash, config hash and fee were all recorded — those became passport #1.

But **no adapter exists on disk.** `acknowledgeModel` failed (the bundled `0g-storage-client` is
a Linux ELF on a Windows host → ENOENT; the TEE fallback returned HTTP 429), and the provider
settled the deliverable unacknowledged at 2026-08-14T17:19:17Z, charging 0G's documented 30%
penalty — 0.00355584 of a 0.0118528 0G fee. The chain still reads `acknowledged: false` and an
empty `encryptedSecret`, so the adapter at root hash `0xbd1df54d…` cannot be decrypted.

The **gate question was still answered yes**: the network works, the flow is real, the costs are
known, and the failure mode this project exists to prevent was observed first-hand. The pivot to
inference provenance was therefore not taken. Full evidence in `.paul/STATE.md`.

**Kill switch (not used):** if the task could not run at all, pivot to inference provenance —
same contracts, same UI, same pitch.

---

### Phase 2: crucible-core

**Goal:** A TypeScript library that makes every documented footgun structurally impossible.
**Depends on:** Phase 1 (real API behaviour confirmed)
**Research:** Unlikely — API surface already mapped
**Days:** 3–5

**Scope:**
- Training-config validation — ✅ shipped (11 tests)
- Dataset: CSV→JSONL, format detection, validation (≥10 examples, UTF-8, consistent format)
- Fee estimation from live `pricePerToken` + storage reserve fee
- Provider/model discovery via the read-only broker
- Task lifecycle wrapper with correct funding (`--service fine-tuning`) and duplicate-upload handling
- Passport manifest schema + canonical hashing

**Plans:**
- [x] 02-01: Training-config validation — 11 tests
- [x] 02-02: Dataset conversion + validation — 22 tests (`dataset` + `dataset-file`)
- [x] 02-03: Fee estimation + provider discovery — 8 tests; reproduces 0G's worked example
- [x] 02-04: Task lifecycle wrapper + passport manifest — 64 tests (`task-state` + `passport`)

**Status: complete.** `packages/core` is 105 tests across 6 files, all network-free — no test
requires a key, funds or a live endpoint.

**Exit criteria (BDD):**
> **Given** a raw CSV of instruction/response pairs
> **When** it is passed to `@crucible/core`
> **Then** a valid 0G-format JSONL is produced, the fee is estimated within 5% of the broker's
> figure, and every 0G-rejection rule is caught locally before any funds move.

---

### Phase 3: Passport Contract

**Goal:** `Passport.sol` live and verified on 0G mainnet — satisfies the Wave 3 hard requirement.
**Depends on:** Phase 2 (manifest schema fixes the on-chain fields)
**Research:** Unlikely — patterns lifted from `agenticID-examples`
**Days:** 5–7

**Scope:**
- ERC-7857-*style* Agentic ID contract: one token per completed fine-tune. Implements the
  identity + `authorizeUsage` surface, **not** ERC-7857's oracle-re-encryption `transfer()` or
  `clone()` — passport lineage is public, so there is nothing for the oracle half to re-encrypt
- Lineage hashes in metadata; manifest root hash public for verification without decryption
- `authorizeUsage` / `revokeAuthorization` (max 100 per token)
- Hardhat, Solidity **0.8.19**, `evmVersion: paris` (0.8.19 cannot emit cancun; see `contracts/README.md`)
- Deploy to mainnet 16661, verify on chainscan.0g.ai

**Plans:**
- [x] 03-01: Contract + full test suite — 70 Hardhat tests
- [x] 03-02: Deploy to Galileo testnet, mint passport #1 — `0x27087B5b…83C1c7`, block 49596815
- [ ] 03-03: **Deploy + verify on mainnet** → capture address and explorer link ⛔ *mainnet wallet holds 0; needs ~0.0103 0G of gas*

**Exit criteria (BDD):**
> **Given** a completed fine-tune with a passport manifest
> **When** `mint` is called on 0G mainnet
> **Then** a token exists whose on-chain manifest hash matches the manifest stored on 0G Storage,
> **And** the contract is source-verified on chainscan.0g.ai.

**Testnet status — met.** `verifyManifest(1, 0x4f64bfe6…)` returns **true** and returns **false**
for a tampered hash; both re-checked against the live chain on 2026-08-15. The manifest those
hashes commit to is on 0G Storage at root `0xc757a7e6…1140`, and downloading those 584 bytes and
hashing them reproduces the anchored value exactly — so the criterion's "matches the manifest
stored on 0G Storage" clause is now literally satisfied, not just structurally.

One caveat stands: passport #1 is a smoke test of the contract, not a completed fine-tune, and
its adapter hash is a labelled sentinel.

**Source verification — done on Galileo.** Confirmed via the explorer's own `getsourcecode`
endpoint: `Passport`, `v0.8.19+commit.7dd6d404`, `EVMVersion paris`, optimizer 200 runs. The
blocker was the API path — 0G chainscan is a Conflux-Scan derivative whose Etherscan-compatible
API lives at `/open/api`, not `/api`; the latter is an SPA route that returns HTML. Same command
should now work for mainnet.

**Mainnet status — not started.** Nothing deployed, no code at any address, wallet balance 0.

---

### Phase 4: Orchestrator & Daemon

**Goal:** Jobs survive without a human watching them — the feature that prevents real model loss.
**Depends on:** Phase 2
**Research:** Unlikely
**Days:** 7–9

**Scope:**
- Job state machine mirroring 0G's: `Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered → UserAcknowledged → Finished` (+ `Failed`)
- **Auto-acknowledge daemon** — acts well inside the 48-hour window, always via `acknowledgeModel`
- `acknowledgeDeliverable` exposed as a one-click unlock for accounts already stuck by Bug #4
- `occupied` handling — a busy provider is a first-class queued state, not an error
- Persistence + restart safety

**Plans:**
- [x] 04-01: Job state machine + persistence — `states.ts`, `store.ts`, `poller.ts`
- [x] 04-02: Auto-acknowledge daemon + 48h scheduling — `acknowledger.ts`, 21 tests
- [x] 04-03: Stuck-queue recovery (Bug #4 unlock) — `recovery.ts`, `POST /jobs/:id/unlock`

**Status: complete.** 155 tests across 11 files. The daemon acts at +1h after `Delivered`, retries
with backoff, and falls back to `acknowledgeDeliverable` at +36h — 12 hours of deadline still in
hand. It was **not** in the loop for the 2026-08-14 run, which is why that model was lost; the
daemon is the response to that failure, not evidence against it.

**Exit criteria (BDD):**
> **Given** a task that has reached `Delivered`
> **When** no human interacts with the system
> **Then** the model is downloaded, hash-verified and acknowledged automatically,
> **And** the deliverable queue is never left in an unacknowledged state.

---

### Phase 5: Web App & Gallery

**Goal:** Something a judge can click through in three minutes.
**Depends on:** Phases 3 and 4
**Research:** Unlikely
**Days:** 9–13

**Scope:**
- Next.js + wagmi + RainbowKit (matching `agenticID-examples`)
- Upload → validate → configure → estimate cost → launch
- Live training view driven by real task states + `getLog`
- **Public Model Passport page** — every hash rendered with its verification link
- **Public gallery** — the demo centrepiece
- Mint-to-Agentic-ID flow

**Plans:**
- [x] 05-01: App shell, wallet connection, network switching — wagmi + RainbowKit
- [x] 05-02: Upload + configure + launch flow — `/new`
- [x] 05-03: Live training view — `/jobs`, `/jobs/[id]`
- [x] 05-04: Passport page + gallery — `/passport/[id]`, `/gallery`

**Exit criteria (BDD):**
> **Given** a visitor with no wallet
> **When** they open a passport URL
> **Then** they can independently verify the dataset on Storage Scan, the mint on chainscan,
> and the provider's TEE attestation — without connecting anything.

**Status: built and tested — 158 tests across 13 files, plus a clean `next build` (7 routes,
88.8 kB shared JS) — with two caveats to keep straight.**

1. **The app defaults to mock mode.** With `NEXT_PUBLIC_CRUCIBLE_API_URL` unset it serves an
   in-memory fixture store; setting it switches to the live orchestrator. Good for demoing with
   no backend, but it means a working UI is not on its own evidence of a working backend.
2. **There is no mint transaction in the UI.** The app reads and renders mint state; passport #1
   was minted by `contracts/scripts/mint-testnet-passport.js`. "Mint-to-Agentic-ID flow" was in
   the original scope and did not land as a UI action.

The app is not yet hosted anywhere, so the exit criterion is met by cloning, not by clicking.
Hosting it is now unblocked and is the cheapest remaining win for the traction score.

---

### Phase 6: Submission Package

**Goal:** Convert built work into rubric points. This phase is not optional polish — the
"Progress & Momentum" criterion is 40% of the score and it reads *this*.
**Depends on:** Phase 5
**Research:** Unlikely
**Days:** 13–16

**Scope:**
- Demo video, **≤3 minutes**, public (YouTube or Loom)
- Architecture diagram + technical description
- README with reproduction steps
- Public X post: `#0GBridge #BuildOn0G` + `@0G_labs @0G_Builders @AKINDO_io`
- **"Updates in this Wave"** changelog in Kavro's sectioned format
- AKINDO platform: connect GitHub → create team → create product → submit

**Plans:**
- [x] 06-01: README, architecture diagram, reproduction steps — `docs/diagrams/`, `submission/ARCHITECTURE.md`
- [ ] 06-02: Demo video — script written and timed to 2:50; **not recorded**
- [ ] 06-03: X post + changelog — changelog written; **X post not posted**
- [ ] 06-04: AKINDO submission — GitHub connected, team created; **no product yet, not registered into the Wave**

**Status.** The written half is done. Nothing has been published or submitted, and the AKINDO
platform steps are gated on an OAuth grant only the account owner can make.

**Exit criteria (BDD):**
> **Given** the Wave 3 submission form
> **When** it is submitted
> **Then** all seven required items are present, including a mainnet contract address and an
> explorer link showing real on-chain activity.

---

## 📋 Planned Milestone: v1.1 — Wave 4

**Goal:** Depth on the integration score and the first real users.
**Prerequisite:** v1.0 submitted
**Deadline:** 2026-09-20 20:30

| Phase | Focus | Research |
|-------|-------|----------|
| 7 | TEE attestation verification in-passport (`verifyService`) | Likely |
| 8 | OpenSSF Model Signing (OMS) interop — standards-compliant signatures | Likely |
| 9 | Hosted inference against fine-tuned adapters | Unlikely |
| 10 | Passport marketplace — `authorizeUsage` as model licensing | Unlikely |

## 📋 Planned Milestone: v2.0 — Wave 5 & beyond

**Deadline:** 2026-09-25 20:30 (Wave 5), then Token2049 Demo Day (Oct 7–8)

| Phase | Focus | Research |
|-------|-------|----------|
| 11 | Org accounts, private passports, retention | Unlikely |
| 12 | Exportable compliance audit packets | Likely |
| 13 | Steps toward VFT-style proof of honest training | Likely |

---
*Roadmap created: 2026-08-14*
*Last updated: 2026-08-15 — phase table reconciled against the repo and the live chain*
