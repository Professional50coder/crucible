# Crucible — Why This, What It Solves, What It's Worth

> **Verifiable fine-tuning on 0G.** Every model gets a birth certificate.

**Status:** Wave 3 of the 0G Bridge Buildathon · deadline 2026-08-30 20:30
**Written:** 2026-08-14 · every technical claim verified against the live network — see [FIELD_NOTES.md](FIELD_NOTES.md)

---

## 1. Why we chose this project

We evaluated seven candidate projects against four filters: is it genuinely unbuilt, does
it use 0G deeply, can it reach mainnet in 16 days, and does it survive past the buildathon.

**Three candidates died on contact with reality:**

| Candidate | Killed by |
|---|---|
| Compute provider SLA + routing SDK | 0G already ships an official **Compute Router** with automatic failover and *"route by lowest latency, lowest price"*. We'd be rebuilding their first-party product. |
| Agent memory layer | 0G ships an official `0g-memory` SDK. Plus Aevum, RecallMesh and SoulVault already exist. |
| Agent identity / marketplace | 8+ shipped projects; Axiom Protocol holds the buildathon's joint-top score at 28 points. |

**Fine-tuning provenance survived all four filters:**

1. **Genuinely unbuilt.** Of 173 projects ever shipped on 0G, **3** touch training at all, and
   **none** do provenance. Of 44 buildathon submissions, **zero**.
2. **Deep 0G use.** Storage + Compute + Chain + Agentic ID — all four components. The rubric
   weights "0G Integration" at 30%, and most competitors use exactly one.
3. **Reachable.** Verified 2026-08-14: a fine-tuning provider is **live and unoccupied on
   mainnet**, running Intel TDX TEEs on H200 GPUs. A demo run costs ~**0.025 0G**.
4. **Survives.** Model provenance is a real, funded problem in mainstream ML — it does not
   depend on the buildathon existing.

### The honest caveat, stated up front

**We did not invent model provenance.** It is an active field:

- **vouch-protocol's "Birth Certificate Protocol"** (PAD-018, Feb 2026) uses nearly our exact framing
- **OpenSSF Model Signing (OMS)** v1.0 — sigstore-based model signing, adopted by NVIDIA NGC
- **Cisco Model Provenance Kit** (Apr 2026) — determines whether two models share an origin
- **Verifiable Fine-Tuning** (arXiv 2510.16830) — ZK training proofs bound to data provenance

What has **not** been done is bringing this to a decentralized AI L1 where the training
compute, the dataset storage, the attestation anchor, and the model's transferable identity
are all native primitives on one stack. That is Crucible. Claiming more would be caught, and
should be.

---

## 2. The current problems — all verified, none hypothetical

### Problem 1 — The provenance chain exists and is thrown away

Every 0G fine-tuning task already emits a complete cryptographic lineage:

```
Pre-trained Model Hash   0xcb42b5ca…bab6dc     which base model
Dataset Hash             0xaae9b4e0…47a5fa     0G Storage root hash of the training data
Training Params          epochs, lr, batch, neftune
TEE delivery             Intel TDX, hash-verified against the on-chain root hash
```

Four facts that together answer *"where did this model come from?"* — printed to a terminal
and lost when the buffer scrolls. **Nothing surfaces them. Nothing persists them. Nothing
makes them checkable by a third party.**

### Problem 2 — A documented bug permanently locks users out of the network

From the SDK's own source comments, describing a **May 2026 hackathon bug report (Bug #4)**:

> A user retrieved a model via the legacy two-step flow and never called `acknowledgeModel`.
> Days later the artifact was garbage-collected from both 0G Storage and the TEE buffer, at
> which point `acknowledgeModel` could no longer succeed, and the user's deliverable queue
> was **permanently locked** — every subsequent `addDeliverable` reverted with *"previous
> deliverable not acknowledged"*.

Real users have been permanently locked out. The escape hatch exists but is undocumented
outside a TSDoc comment.

### Problem 3 — A 48-hour deadline with no warning

After a task reaches `Delivered`, you have 48 hours to acknowledge. Miss it and you **lose
the model** and **30% of the fee is deducted**. There is no notification, no dashboard, no
reminder. You are expected to poll a CLI.

### Problem 4 — The funding footgun

`transfer-fund` silently routes to the *inference* sub-account unless you pass
`--service fine-tuning`. The failure appears much later as an unexplained
`MinimumDepositRequired` when you try to create a task.

### Problem 5 — Getting from "done" to "usable" is a research project

You receive a **LoRA adapter**, not a model. To use it you must download the base weights
from HuggingFace, install a CUDA-matched torch, install PEFT, load the adapter, and know to
wait ~1 minute after acknowledge or decryption fails with `second arg must be public key`.

### Problem 6 — Documentation contradicts reality

- The example repo says *"Mainnet — fine-tuning not yet available."* **It is available**, and
  mainnet is **37.5% cheaper** than testnet (500 vs 800 neuron/token).
- The Builder Hub recommends `@0gfoundation/*` packages; the official example pins `@0glabs/*`.
- The docs' config template (`max_steps: 3`) differs from the shipped working config (`max_steps: 45`).

We lost hours to this. Every 0G builder loses the same hours.

---

## 3. What Crucible solves

| Problem | What Crucible does |
|---|---|
| Lineage discarded | Captures it into a signed, public **Model Passport** — manifest on 0G Storage, hash anchored on 0G Chain, minted as an ERC-7857 Agentic ID |
| Bug #4 queue lock | Only ever calls `acknowledgeModel`; exposes `acknowledgeDeliverable` as a one-click unlock for already-stuck accounts |
| 48-hour deadline | A daemon acknowledges automatically. Structurally impossible to miss. |
| Funding footgun | Funds the correct sub-account, verifies balance before creating a task |
| LoRA assembly | Ships a ready-to-run loader + hosted inference against the fine-tuned adapter |
| Docs vs reality | [FIELD_NOTES.md](FIELD_NOTES.md) — published, verified, dated |

**In one sentence:** Crucible turns a 12-step CLI flow with five documented footguns into one
upload, and turns the cryptographic exhaust it already produces into a permanent public record.

---

## 4. The value, and who pays for it

### Layer 1 — Ecosystem value (why 0G should care)

0G's Compute Network has **one fine-tuning provider and 21 inference providers**. Fine-tuning
is the underused half of their own product. Crucible makes it usable, and every Crucible run is
a paid task on 0G's mainnet. We are demand generation for the component 0G most needs adopted.

### Layer 2 — Builder value (immediate users)

Anyone fine-tuning on 0G today is fighting the CLI. Crucible removes that, and hands them a
shareable artifact proving what they built. The passport is also a *distribution* mechanism —
a public page per model, indexed and linkable.

### Layer 3 — Market value (why this outlives the buildathon)

AI provenance is becoming a compliance requirement, not a nice-to-have. The evidence that this
is a real market, not a hackathon fantasy:

- **NVIDIA** ships OpenSSF Model Signing in NGC, their production model registry
- **Cisco** open-sourced a model provenance kit in April 2026
- **OpenSSF** stood up a dedicated AI/ML Security Working Group and shipped OMS v1.0
- Academic work is active and well-funded (VFT, Atlas, LineageMark)

Serious infrastructure vendors do not ship tooling for problems that don't exist.

**Where Crucible is differentiated:** every one of those solutions assumes a centralised MLOps
pipeline — you sign a model *you already trained on your own hardware*. Crucible is the only
approach where **the training itself happened in a TEE on a decentralized network, and the
attestation is anchored on a public chain.** The provenance isn't asserted by the model owner;
it's produced by infrastructure the model owner doesn't control.

That distinction matters exactly where provenance matters most: when the party making the
claim is the party you don't trust.

### The SaaS shape (Wave 4–5 and beyond)

| Tier | Who | What they get |
|---|---|---|
| **Free** | Buildathon judges, hobbyists, 0G builders | Fine-tune, get a public passport, pay 0G costs directly |
| **Pro** | Teams shipping fine-tuned models | Private passports, org-scoped registry, hosted inference endpoints, webhook/CI integration |
| **Compliance** | Regulated / enterprise | Exportable audit packets, OMS-signed artifacts, retention guarantees, on-prem verifier |

Honest note: this is a **plausible** model, not a validated one. We have no customer
conversations yet. Treating it as validated would be exactly the overclaiming this project
is supposed to be against.

---

## 5. What Crucible does NOT claim

**Crucible proves lineage, not honest training.**

It proves: this adapter's artifacts hash-match, this dataset is retrievable at this root hash,
this provider's TEE signer is acknowledged on-chain, and 0G's integrity check passed on delivery.

It does **not** prove the provider actually ran the epochs it claimed. That requires ZK proofs
over the training computation — the VFT paper's PEFT-restricted update circuits enforcing AdamW
semantics — which is a research programme, not a 16-day build.

Saying this plainly is deliberate. Technical judges will ask, and the answer is the roadmap.

---

## 6. Scorecard against the buildathon rubric

| Weight | Criterion | How Crucible scores |
|---|---|---|
| **40%** | Progress & Momentum | Built inside the Wave window with daily commits; a sectioned changelog, where three of four current Wave 3 entries wrote `a` or one sentence |
| **30%** | 0G Integration | **All four components.** The only project in 173 using fine-tuning provenance. Runs on mainnet, not testnet. |
| **20%** | Technical Quality | TDD from commit one, real contract with tests, verified on chainscan, field notes correcting the official docs |
| **10%** | Traction & Communication | Public passport gallery; FIELD_NOTES is directly useful to every other 0G builder |

**The asymmetry worth naming:** as of 2026-08-14, Wave 3 has **4 submissions out of 44 projects,
all at 0 points**, and only one (Kavro Protocol) is a serious entry. The pool is $15,000 — the
largest of the program. A finished, mainnet-deployed, well-documented project is not competing
against 44 rivals. It is competing against one.
