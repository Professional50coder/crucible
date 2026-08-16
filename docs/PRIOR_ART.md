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
| **`databricks-dolly-15k`** | Demo dataset. JSONL, `instruction / context / response` — maps almost directly onto 0G's Format 1 (`instruction / input / output`). | **CC BY-SA 3.0** (checked against the dataset card 2026-08-16 — this repo previously said Apache 2.0, which was wrong) | **Use, and share alike.** The derived slice in `datasets/dolly-slice/` carries its own CC BY-SA 3.0 `LICENSE`; the root MIT licence does not cover it. |
| **`0gfoundation/agenticID-examples`** | Contract patterns for ERC-7857, Next.js + wagmi + RainbowKit scaffolding | **None found** — no `LICENSE` file, no `license` field in `package.json` | **Read only.** Reimplement; nothing copied |
| **`0gfoundation/0g-deployment-scripts`** | Hardhat/Foundry configs already verified for Galileo + mainnet | **None found** — no `LICENSE` file and no `package.json` on `main` | **Read only.** Our Hardhat config is written here |
| **`0gfoundation/fine-tuning-example`** | Reference for the end-to-end job flow | **MIT**, declared in `package.json` only — the repository ships no `LICENSE` file | **Read**, cite what it taught |

**Checked 2026-08-16** against the GitHub API: `GET /repos/0gfoundation/<repo>` reports
`"license": null` for all three, and `GET /repos/0gfoundation/<repo>/license` returns 404 for all
three. Only `fine-tuning-example` declares a licence at all, and only inside `package.json`.

Two of these three are therefore **unlicensed**, which means default copyright: readable, not
reusable. The first two rows previously read *"Check repo"* in this column while the Action column
said *"Lift patterns"* and *"Use directly"* — a reuse plan resting on a licence nobody had looked
up. Both actions are corrected above. This also sharpens `.paul/STATE.md`, which recorded that
`fine-tuning-example` "declares MIT": true, but in `package.json`, not in a `LICENSE` file.

### 🟢 Patterns reimplemented, with the source named

| Source | Licence | What was taken, and what was changed |
|---|---|---|
| **Excalidraw — `exportEmbedScene`** | MIT | The mechanism of embedding the source document inside the exported image, as a base64 payload between explicit markers in a metadata element, so an export is not a dead raster. Excalidraw embeds its scene JSON so the file stays *editable*; Crucible embeds the canonical manifest so the file stays *checkable* — a downloaded certificate can be keccak256'd and compared against `passportOf(tokenId).manifestRootHash` without trusting the page it came from. Reimplemented in `apps/web/src/lib/passport-export.ts`; no code copied. |
| **Documenso — certificate separate from audit log** | AGPL-3.0 | The structural idea only, and deliberately no code: a signed artifact is presented as a short scannable certificate plus a separate exhaustive evidence trail, both stamped with the same identifier so a third party can prove the two describe the same object. Informs how a passport separates its verification hero from its decoded manifest and chain-of-custody disclosures. AGPL means read, describe, reimplement — never paste. |

Ten open-source projects were surveyed for interface patterns on 2026-08-16. Seven of the ten
(AppFlowy, Immich, Documenso, ListMonk, Dub, RustDesk, FluidVoice) are AGPL-3.0 or GPL-3.0, and
Dub additionally carries proprietary enterprise directories; from all of those, only an idea may
be taken and only reimplemented from scratch. Excalidraw and Cal.DIY are MIT, and Penpot is
MPL-2.0 — file-level copyleft, so a copied file would carry its licence into this repository and
was therefore avoided too. Nothing was copied from any of them.

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
| **databricks-dolly-15k** | **CC BY-SA 3.0** — attribution *and* share-alike | Format 1 after remap (`context`→`input`, `response`→`output`) | Human-written, explicitly cleared for commercial use by its own card, well-known to judges. The share-alike obligation is met by `datasets/dolly-slice/LICENSE` |
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

## 4. Interface prior art — what the frontend borrows, and from where

The passport page and the gallery solve a problem someone else already solved well: presenting a
public, hash-heavy record so that a stranger can check it. The **Ethereum Attestation Service**
explorer is the closest working analogue, and two of its ideas are reimplemented here.

| Idea taken | Where it came from | What we did |
|---|---|---|
| **The full identifier printed untruncated under the title** | [EAS single-attestation view](https://easscan.org/attestation/view/) — the UID is shown whole, not shortened | `PassportView.tsx` prints the anchored manifest hash in full with a copy control. On a certificate the complete value *is* the content; truncation belongs in tables |
| **Typed field rows** — a cell carrying the type and field name beside the decoded value | EAS's *Decoded data* table (`STRING · Title`, `UINT64 · Startts`) | `TypedRow` / `TypedRows` in `Hash.tsx`, rendering `BYTES32 · dataset.rootHash`, `ADDRESS · task.provider`, `BOOL · tee.attestationVerified`. Turns a hash dump into a legible schema |
| **A stat header over a dense index** | [EAS attestations index](https://easscan.org/attestations) — three large figures above a one-line-per-record table with type badges and relative age | The gallery's stat row and passport table, with a provenance column distinguishing on-chain records from fixtures |

**Nothing was copied.** No EAS code, markup, stylesheet or asset is present in this repository.
These are observed interface patterns, rebuilt against Crucible's own tokens — which is the same
standard applied to 0G's example repos in §2.

### UI component libraries — evaluated and declined

| Library | Licence | Decision |
|---|---|---|
| [radix-ui/primitives](https://github.com/radix-ui/primitives) | MIT, actively maintained | **Permitted, not used.** Every candidate — the verify disclosure, the command palette's focus trap — turned out to need less code than the dependency. The disclosure is a native `<details>`; the trap is nine lines |
| [web3ui/web3uikit](https://github.com/web3ui/web3uikit) | MIT, last pushed 2025-07 | **Declined.** Built on styled-components; adopting it means a second styling runtime beside Tailwind for wallet components this project does not need |
| [GBKS/crypto-ux-handbook](https://github.com/GBKS/crypto-ux-handbook) | **No licence file** | Readable for principles only. Absent a licence, nothing may be copied |
| [goabstract/Awesome-Design-UI-Kits](https://github.com/goabstract/Awesome-Design-Tools/blob/master/Awesome-Design-UI-Kits.md) | catalogue | **Nothing usable.** Read in full: 184 entries, of which 3 are crypto and 3 are code — the rest are Sketch, Adobe XD and Figma files, mostly mobile app concepts from 2017–2020. No React component library in the list |

`framer-motion` (MIT) is a dependency and is used for entrance choreography only.

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
