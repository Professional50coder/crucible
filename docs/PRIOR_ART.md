# Prior Art & Reusable Components

Checked 2026-08-14, before committing build time. Two questions:
**(1) has this been built already?** and **(2) what can we legitimately reuse?**

The buildathon rule that governs reuse:

> **Originality:** All work must be your own or properly credited.
> **Reused code must be open source and cited.**

So reuse is allowed — it just has to be declared. Everything below is tracked with
its license so the submission can cite it correctly.

---

## 1. Has this been built? — Partly. Not on 0G.

### ⚠️ The "birth certificate" framing is NOT novel

**vouch-protocol / vouch — "Birth Certificate Protocol"**, public disclosure PAD-018,
published **2026-02-14**. Establishes *"cryptographic chain of custody for AI models
through a comprehensive 'Birth Certificate' that binds a model's identity to its
verifiable lineage"*, tracking lineage through fine-tuning, distillation and merging.

That is the same concept and very nearly the same words I pitched. **We must not present
"model birth certificates" as our invention.** Cite it, position against it.

### Other established work in this space

| Project | What it does | Status |
|---|---|---|
| **OpenSSF Model Signing (OMS)** | Library + CLI to sign/verify ML models of any format or size. Built on `sigstore-python`. Designed to integrate with model hubs (HuggingFace, Kaggle) and frameworks. v1.0 stable. | Mature, adopted (NVIDIA NGC ships it) |
| **Cisco Model Provenance Kit** | Open-source Python toolkit + CLI. Determines whether two transformer models share a common origin from architecture metadata, tokenizer structure, and learned weights. Released ~2026-04-30. | Mature |
| **Atlas** | Framework for ML lifecycle provenance & transparency (arXiv 2502.19567) | Academic |
| **Verifiable Fine-Tuning (VFT)** | ZK training proofs bound to data provenance and policy. Merkle commitments over data sources + licenses + per-epoch quotas; verifiable batch sampler; PEFT-restricted update circuits enforcing AdamW semantics. (arXiv 2510.16830) | Academic — **this is the real version of what we're approximating** |
| **LineageMark** | White-box watermarking for contribution tracing in model derivation chains (arXiv 2606.17123) | Academic |
| **lakeFS** | Git-like version control over object stores for data | Mature, adjacent |

### What this means — the honest repositioning

**Model provenance is a solved-ish, actively-worked problem in mainstream ML.**
It is **not** solved on 0G, or on any decentralized AI L1 where compute, storage, and
identity are native primitives. Nobody has connected these two worlds.

So the pitch is no longer *"we invented model birth certificates."* It becomes:

> **Crucible brings established AI-provenance standards to 0G** — the first
> implementation where the training compute, the dataset storage, the attestation
> anchor, and the model's transferable identity all live on the same decentralized
> stack, rather than being bolted onto a centralised MLOps pipeline.

This is a **stronger** position for judging, not a weaker one. It shows field awareness,
it's defensible under questioning, and it turns a "nice hackathon idea" into "this person
knows the actual literature." The VFT paper also hands us a credible, specific Wave 4/5
roadmap: today Crucible proves lineage; VFT-style ZK circuits would prove *honest training*.

---

## 2. What we can reuse

### 🟢 Reuse — high value, permissive, citable

| Component | Use for | License | Action |
|---|---|---|---|
| **OpenSSF Model Signing (`model-signing` Python pkg)** | Sign the LoRA adapter with a standard signature instead of inventing our own. Anchor the OMS signature + our manifest hash on 0G. | Spec is Community Specification License 1.0; **verify the library's own license before depending on it** | **Integrate.** Standards-compliance is a differentiator, and it's how we avoid reinventing signing. |
| **`databricks-dolly-15k`** | Demo dataset. **Apache 2.0**, JSONL, `instruction / context / response` — maps almost directly onto 0G's Format 1 (`instruction / input / output`). | Apache 2.0 | **Use.** Field remap is exactly what `crucible-core`'s converter is for. |
| **`0gfoundation/agenticID-examples`** | Contract patterns for ERC-7857, Next.js + wagmi + RainbowKit scaffolding | Check repo | **Lift patterns**, cite in README |
| **`0gfoundation/0g-deployment-scripts`** | Hardhat/Foundry configs already verified for Galileo + mainnet | Check repo | **Use directly** |
| **`0gfoundation/fine-tuning-example`** | Reference for the end-to-end job flow | Check repo | **Read before the day-1 spike** |

### 🟡 Study, don't copy

- **Cisco Model Provenance Kit** — its "do these two models share an origin?" check is a
  *verification* capability we don't have. Worth citing as complementary; possibly worth
  wiring in later as an independent check on a passport's claim.
- **vouch PAD-018** — read the disclosure, cite it, and make sure our schema doesn't
  accidentally duplicate their naming.

### 🔴 Don't attempt

- **ZK proofs of training (VFT-style).** PEFT-restricted update circuits enforcing AdamW
  semantics is a research project, not a 16-day build. Cite it as roadmap. Claiming it
  would be the fastest way to lose credibility with technical judges.

---

## 3. Dataset shortlist for the demo

0G requires JSONL, ≥10 examples, UTF-8, one consistent format throughout, in one of:

1. `{"instruction", "input", "output"}`
2. `{"messages": [{"role", "content"}, …]}`
3. `{"text"}`

| Dataset | License | Format fit | Why |
|---|---|---|---|
| **databricks-dolly-15k** | Apache 2.0 | Format 1 after remap (`context`→`input`, `response`→`output`) | Human-written, commercially clean, well-known to judges |
| **DataProvenanceInitiative / Commercially-Verified-Licenses** | Mixed, **verified** | Varies | Thematically perfect — a *provenance* project training on a *license-verified* corpus is a good story |
| Alpaca-cleaned | Apache 2.0 (code); data is GPT-3.5-generated — **OpenAI terms make commercial use murky** | Format 1 | Widely used but **avoid**: a provenance project shouldn't demo on a dataset with questionable provenance |

**Decision: `databricks-dolly-15k`**, sliced to ~50 examples for demo runs (cost scales
with token count — 10k tokens × 3 epochs ≈ 0.025 0G).

The irony is the point: a project about provenance must be able to show the provenance
of its own training data. That's the demo narrative.

### 🎯 A sharper option

Rather than a generic dataset, fine-tune a small model **on the 0G docs themselves** —
a "0G expert" Qwen2.5-0.5B. Self-referential, obviously useful to the ecosystem, the
dataset is unambiguously ours to publish, and it demos beautifully: ask the base model a
0G question, ask the fine-tuned one, show the difference, then show the passport proving
how it was made. Combine: dolly for the generic path, 0G-docs for the hero demo.

---

## Sources

- [Verifiable Fine-Tuning for LLMs: Zero-Knowledge Training Proofs Bound to Data Provenance and Policy (arXiv 2510.16830)](https://arxiv.org/html/2510.16830v1)
- [vouch-protocol — PAD-018 Model Lineage Provenance](https://github.com/vouch-protocol/vouch/blob/main/docs/disclosures/PAD-018-model-lineage-provenance.md)
- [OpenSSF Model Signing (OMS)](https://openssf.org/projects/model-signing/)
- [OpenSSF Model Signing Specification](https://github.com/ossf/model-signing-spec)
- [Practical Model Signing with Sigstore](https://blog.sigstore.dev/model-transparency-v1.0/)
- [Cisco releases open-source toolkit for verifying AI model lineage](https://www.helpnetsecurity.com/2026/04/30/cisco-ai-model-provenance-kit/)
- [Atlas: A Framework for ML Lifecycle Provenance & Transparency (arXiv 2502.19567)](https://arxiv.org/pdf/2502.19567)
- [LineageMark (arXiv 2606.17123)](https://arxiv.org/pdf/2606.17123)
- [Attesting Model Lineage by Consisted Knowledge Evolution with Fine-Tuning Trajectory (arXiv 2601.11683)](https://arxiv.org/pdf/2601.11683)
- [mlabonne/llm-datasets — curated post-training datasets](https://github.com/mlabonne/llm-datasets)
- [DataProvenanceInitiative/Commercially-Verified-Licenses](https://huggingface.co/datasets/DataProvenanceInitiative/Commercially-Verified-Licenses)
- [Hugging Face datasets, Apache-2.0 licensed](https://huggingface.co/datasets?license=license:apache-2.0)
