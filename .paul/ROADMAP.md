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

Phase 1 is a **gate, not a build**. If the authenticated flow doesn't complete, we pivot the same
contracts and UI to inference provenance and lose two days instead of sixteen.

## Current Milestone

**v1.0 Wave 3 Submission**
Status: In progress
Phases: 0 of 6 complete

## Phases

| Phase | Name | Plans | Status | Completed |
|-------|------|-------|--------|-----------|
| 1 | Spike & Foundation | 3 | 🚧 In progress | - |
| 2 | crucible-core | 4 | Not started | - |
| 3 | Passport Contract | 3 | Not started | - |
| 4 | Orchestrator & Daemon | 3 | Not started | - |
| 5 | Web App & Gallery | 4 | Not started | - |
| 6 | Submission Package | 4 | Not started | - |

## Phase Details

### Phase 1: Spike & Foundation

**Goal:** Prove the full authenticated fine-tuning flow completes on 0G, end to end, and
establish the repo's toolchain. This phase decides whether the project proceeds as designed.
**Depends on:** Nothing
**Research:** Complete — see [docs/FIELD_NOTES.md](../docs/FIELD_NOTES.md)
**Days:** 1–2

**Scope:**
- Monorepo, TypeScript, vitest, Paul — ✅ done
- Read-only network probe (no wallet) — ✅ done, providers confirmed live on mainnet
- One real fine-tune: fund → upload → create task → poll → acknowledge → decrypt → LoRA

**Plans:**
- [x] 01-01: Scaffold monorepo + test toolchain + Paul
- [x] 01-02: Read-only provider/model probe; publish FIELD_NOTES
- [ ] 01-03: **Authenticated end-to-end fine-tune** ⛔ *needs a funded wallet — user-run*

**Exit criteria (BDD):**
> **Given** a wallet funded with ≥3 0G on mainnet
> **When** a 30-example dataset is submitted to provider `0x940b4a10…60B0d` for `Qwen2.5-0.5B-Instruct`
> **Then** the task reaches `Finished` and a decrypted LoRA adapter exists on disk,
> **And** the task's dataset hash, model hash and fee are recorded.

**Kill switch:** if the task cannot complete, pivot to inference provenance. Same contracts,
same UI, same pitch. Decision must be made by end of day 2.

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
- [x] 02-01: Training-config validation
- [ ] 02-02: Dataset conversion + validation
- [ ] 02-03: Fee estimation + provider discovery
- [ ] 02-04: Task lifecycle wrapper + passport manifest

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
- ERC-7857 Agentic ID contract: one token per completed fine-tune
- Lineage hashes in metadata; manifest root hash public for verification without decryption
- `authorizeUsage` / `revokeAuthorization` (max 100 per token)
- Hardhat, Solidity **0.8.19**, `evmVersion: paris` (0.8.19 cannot emit cancun; see `contracts/README.md`)
- Deploy to mainnet 16661, verify on chainscan.0g.ai

**Plans:**
- [ ] 03-01: Contract + full test suite
- [ ] 03-02: Deploy to Galileo testnet, integration-test against core
- [ ] 03-03: **Deploy + verify on mainnet** → capture address and explorer link

**Exit criteria (BDD):**
> **Given** a completed fine-tune with a passport manifest
> **When** `mint` is called on 0G mainnet
> **Then** a token exists whose on-chain manifest hash matches the manifest stored on 0G Storage,
> **And** the contract is source-verified on chainscan.0g.ai.

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
- [ ] 04-01: Job state machine + persistence
- [ ] 04-02: Auto-acknowledge daemon + 48h scheduling
- [ ] 04-03: Stuck-queue recovery (Bug #4 unlock)

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
- [ ] 05-01: App shell, wallet connection, network switching
- [ ] 05-02: Upload + configure + launch flow
- [ ] 05-03: Live training view
- [ ] 05-04: Passport page + gallery + mint

**Exit criteria (BDD):**
> **Given** a visitor with no wallet
> **When** they open a passport URL
> **Then** they can independently verify the dataset on Storage Scan, the mint on chainscan,
> and the provider's TEE attestation — without connecting anything.

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
- [ ] 06-01: README, architecture diagram, reproduction steps
- [ ] 06-02: Demo video
- [ ] 06-03: X post + changelog
- [ ] 06-04: AKINDO submission (buffer before 8/30 20:30)

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
*Last updated: 2026-08-14*
