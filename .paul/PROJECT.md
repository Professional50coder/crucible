---
description: "Verifiable fine-tuning on 0G — every model gets a birth certificate"
type: Project
about: "crucible"
---

# Crucible

## What This Is

Crucible turns fine-tuning on the 0G Compute Network into a single upload, and turns the
cryptographic exhaust that flow already produces — base-model hash, dataset root hash,
training config, TEE-verified delivery — into a permanent, public, independently checkable
**Model Passport**, minted as an ERC-7857-*style* Agentic ID on 0G. (Deployed and minted on
Galileo testnet; mainnet is the Wave 3 target and is not deployed yet.)

Today that provenance chain is printed to a terminal and lost. Today the flow has five
documented footguns, one of which strands a user's deliverable queue with a provider.

## Core Value

Anyone who fine-tunes a model on 0G gets a working adapter and a verifiable public record
of exactly how it was made — without touching a CLI or losing their model to a 48-hour deadline.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application (web app + SDK + smart contract) |
| Version | 0.1.0 |
| Status | Prototype |
| Last Updated | 2026-08-14 |

**Target URLs:** (not yet deployed)
- Web app: TBD
- Passport gallery: TBD
- Contract: 0G mainnet, chain 16661 — TBD

## Requirements

### Core Features

- Upload a CSV/JSONL dataset; Crucible validates and converts it to a 0G-accepted format
- Configure and launch a fine-tuning task on 0G Compute without touching the CLI
- Live task progress mirroring 0G's real state machine
- **Automatic acknowledgement** before the 48-hour deadline expires
- A public Model Passport page per completed fine-tune, with every hash independently checkable
- Mint a passport as an ERC-7857 Agentic ID on 0G mainnet
- Public gallery of all passports

### Validated (Shipped)

- [x] Training-config validation against 0G's five-parameter template — 11 tests green, 0.1.0

### Active (In Progress)

- [ ] `@crucible/core` — dataset conversion + validation, fee estimation, provider discovery
- [ ] Authenticated spike: one real fine-tune end to end

### Planned (Next)

- [ ] `Passport.sol` — ERC-7857 contract, 0G mainnet
- [ ] Orchestrator API with auto-acknowledge daemon
- [ ] Next.js web app + passport gallery
- [ ] Submission package (demo video, architecture diagram, X post)

### Out of Scope

- **ZK proofs of honest training** — that is the VFT paper's research programme (PEFT-restricted
  update circuits enforcing AdamW semantics), not a 16-day build. Roadmap item, not a claim.
- **Competing with 0G's Compute Router** — it already does inference routing with failover.
- **Training from scratch** — 0G lists this as "Coming", not live.
- **Qwen3-32B local inference** — needs 40GB+ VRAM; dev machine is CPU/int8 only.

## Target Users

**Primary:** Developers fine-tuning models on 0G
- Currently fighting a 12-step CLI with five undocumented footguns
- Need a working adapter, not a research project
- Want something shareable that proves what they built

**Secondary:** Teams who must evidence model provenance
- Compliance, audit, or customer-assurance pressure
- Need an artifact a third party can verify without trusting them
- Today served only by centralised MLOps tools that assume you trained on your own hardware

**Tertiary:** The 0G Foundation itself
- Fine-tuning is the underused half of 0G Compute — 1 fine-tuning provider vs 21 inference providers
- Every Crucible run is a paid mainnet task

## Context

**Why now:** 0G Bridge Buildathon Wave 3 closes **2026-08-30 20:30**. Pool is $15,000
($7,500 USDC + $7,500 credits) — 30% of the entire program, its largest single wave.
As of 2026-08-14 only 4 of 44 projects have submitted to Wave 3, all at 0 points, and
three wrote placeholder changelogs.

**Why this project:** Of 173 projects ever shipped on 0G, three touch training and none do
provenance. Of 44 buildathon submissions, zero. Verified live on 2026-08-14: a fine-tuning
provider is available and unoccupied on **mainnet**, on H200 GPUs inside Intel TDX TEEs, at
500 neuron/token — cheaper than testnet. A demo run costs ~0.025 0G.

**What we do not claim:** Crucible proves *lineage*, not *honest training*. Prior art exists
and is cited: vouch-protocol's Birth Certificate Protocol, OpenSSF Model Signing, Cisco's
Model Provenance Kit. Our novelty is bringing this to a decentralized AI L1 where compute,
storage, attestation and identity are all native — see [docs/PRODUCT.md](../docs/PRODUCT.md)
and [docs/PRIOR_ART.md](../docs/PRIOR_ART.md).

**Constraints:**
- 16 days, full-time, solo
- Dev machine has no CUDA runtime — CPU/int8 only
- Only one fine-tuning provider per network; tasks queue one at a time
- Submission must include mainnet contract address + explorer activity + ≤3min demo video + public X post
- Ships under a personal GitHub account, not PPC branding

---
*Project brief created: 2026-08-14*
