# Claims audit

Every falsifiable claim this repository makes about the outside world, checked against a
primary source on **2026-08-15**, with the licence section added **2026-08-16**. A judge should be able to break any of these in a minute; the
point of this file is that they cannot.

Claims about our own code are not listed here — those are checked by running the tests.

---

## Prior art — the "birth certificate" framing is not ours

| Claim in the repo | Verdict | Source |
|---|---|---|
| vouch-protocol published the **Birth Certificate Protocol** in **February 2026** | ✅ accurate | PAD-018 "Model Lineage Provenance", disclosed 2026-02-14 — [vouch-protocol/vouch](https://github.com/vouch-protocol/vouch/blob/main/docs/disclosures/PAD-018-model-lineage-provenance.md) |
| **OpenSSF ships Model Signing v1.0** | ✅ accurate — released April 2025 by the OpenSSF AI/ML Working Group. The repo claims no date for it | [openssf.org](https://openssf.org/blog/2025/04/04/launch-of-model-signing-v1-0-openssf-ai-ml-working-group-secures-the-machine-learning-supply-chain/) · [ossf/model-signing-spec](https://github.com/ossf/model-signing-spec) |
| Cisco open-sourced a **Model Provenance Kit** in **April 2026** | ✅ accurate — Python toolkit and CLI for tracing model lineage, reported 2026-04-30 | [Help Net Security](https://www.helpnetsecurity.com/2026/04/30/cisco-ai-model-provenance-kit/) · [SecurityWeek](https://www.securityweek.com/cisco-releases-open-source-tool-for-ai-model-provenance/) |

**Why this matters.** Crucible does not claim the idea. It claims the 0G-native implementation:
a stack where the training compute, the dataset storage, the attestation anchor and the model's
transferable identity are all primitives of one network. The three projects above are all
centralised or signature-based and assume you trained on your own hardware.

---

## The limitation we state — proving honest training

| Claim in the repo | Verdict | Source |
|---|---|---|
| Proving a provider actually ran the epochs needs ZK proofs over the training computation, using **PEFT-restricted update circuits enforcing optimizer semantics**, per **arXiv 2510.16830** | ✅ accurate, and precisely characterised | *Verifiable Fine-Tuning for LLMs: Zero-Knowledge Training Proofs Bound to Data Provenance and Policy* — Akgul, Borg, Berisha, Rahimova, Novak, Petrov. The paper's update circuits are "restricted to parameter efficient fine tuning" and "enforce AdamW style optimizer semantics". [arXiv:2510.16830](https://arxiv.org/abs/2510.16830) |

This is the answer to the first hard question a technical judge asks. Crucible proves
**lineage, not honest training**, and the paper it defers to says exactly what we say it says.

---

## Network facts

| Claim | Verdict | Source |
|---|---|---|
| 0G mainnet is chain **16661**, RPC `https://evmrpc.0g.ai`, explorer `chainscan.0g.ai` | ✅ | [0G docs](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview) · [ChainList 16661](https://chainlist.org/chain/16661) |
| 0G Galileo testnet is chain **16602**, RPC `https://evmrpc-testnet.0g.ai`, explorer `chainscan-galileo.0g.ai` | ✅ | [0G docs](https://docs.0g.ai/developer-hub/testnet/testnet-overview) · [ChainList 16602](https://chainlist.org/chain/16602) |

Every other network fact in this repository — provider addresses, pricing, hardware, TEE signer,
model availability, the real cost of a run — was obtained by executing against the live network
rather than by reading a page, and is recorded with its transaction hash in
[`FIELD_NOTES.md`](FIELD_NOTES.md).

---

## Our own on-chain claims, verified through the RPC rather than the deploy script

Re-checkable by anyone with `curl` and a JSON-RPC endpoint.

| Fact | Value |
|---|---|
| `Passport.sol` on Galileo | `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7` — 9,874 bytes of deployed code |
| Deploy tx / block / gas | `0x302a4278…8a6dd1` · 49596815 · 2,238,586 |
| Mint tx / block / gas | `0xb608a8a5…00b3b1` · 49597171 · 327,702 |
| `name()` / `symbol()` | `Crucible Model Passport` / `CMP` |
| `totalMinted()` | `1` |
| `verifyManifest(1, anchored)` | `true` |
| `verifyManifest(1, keccak256("tampered"))` | `false` |
| Deployer wallet | `0xf4cEE5c1…1FD3EF` — 0.686326 0G, nonce 5 |
| **Mainnet** | balance 0, nonce 0 — **nothing deployed** |

---

## "Is this really ERC-7857?" — the question a 0G judge will ask

0G's own documentation gives ERC-7857 a core interface of three functions:

| Function | 0G's description | `Passport.sol` |
|---|---|---|
| `authorizeUsage()` | grant usage permissions without revealing sensitive data | ✅ implemented, capped at 100 executors, cleared on transfer, with `revokeAuthorization` |
| `transfer()` | ownership transfer **with metadata re-encryption via an oracle proof** (TEE or ZKP) | ⚠️ standard ERC-721 transfer, authorizations cleared. **No oracle re-encryption** |
| `clone()` | copy a token while keeping metadata secure | ❌ not implemented |

**So the honest claim is "an ERC-7857-style Agentic ID", not "a compliant ERC-7857 implementation",
and that is the wording used in the contract's own documentation.**

The reason is not laziness, and it is worth stating plainly because it is a design decision:

> **A passport has nothing to re-encrypt.** ERC-7857's oracle machinery exists to move *encrypted
> intelligent data* — the model itself — between owners without exposing it. A Model Passport is
> deliberately the opposite: `manifestRootHash` is public and unencrypted precisely so that a
> stranger holding no key can verify it. Bolting on a re-encryption oracle to transfer a document
> whose entire purpose is to be publicly readable would be theatre.

What the passport does take from the standard is the part that matters here: provenance travels
with ownership as a first-class on-chain object, and delegated use is granted and revoked without
handing over the asset.

If 0G's verification requires strict compliance, the gap is `iTransferFrom` plus a TEE oracle, and
the reference implementation to follow is `0gfoundation/0g-agent-nft` rather than the simplified
contract in `agenticID-examples`. That is a Wave 4 item, and it is on the roadmap as one.

Sources: [0G Builder Hub — Agentic ID](https://build.0g.ai/agentic-id) ·
[ERC-7857 in 0G's docs](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857)

---

## Licences of everything we read or depend on — checked 2026-08-16

The standing rule is that reused code must be open source and cited, and that unlicensed code
may be read but not copied. That rule is only worth having if someone checks the licences.

| Claim in the repo | Verdict | Source |
|---|---|---|
| The 0G SDKs are **ISC** | ✅ accurate | `license` field in `@0gfoundation/0g-compute-ts-sdk@0.9.0` and `@0gfoundation/0g-storage-ts-sdk@1.2.11` |
| `databricks/databricks-dolly-15k` is **Apache 2.0** | ❌ **wrong, and corrected 2026-08-16.** It is **CC BY-SA 3.0**. The card permits commercial use *under those terms*, which include share-alike — so the derived slice in `datasets/dolly-slice/` inherits CC BY-SA 3.0 and cannot sit under the root MIT licence. It now carries its own `LICENSE` | the dataset card itself: `license: cc-by-sa-3.0` in its front matter, and the body text naming the [CC BY-SA 3.0 Unported License](https://creativecommons.org/licenses/by-sa/3.0/legalcode) |
| `0gfoundation/fine-tuning-example` declares **MIT** | ⚠️ accurate but narrower than it sounded — MIT appears in `package.json`; the repository ships **no `LICENSE` file** | `GET /repos/0gfoundation/fine-tuning-example` → `"license": null`; `/license` → 404; `package.json` → `"license": "MIT"` |
| `0gfoundation/agenticID-examples` — patterns to lift | ❌ **no licence at all.** No `LICENSE` file, no `license` field. Default copyright: readable, not reusable | `GET /repos/0gfoundation/agenticID-examples` → `"license": null`; `/license` → 404 |
| `0gfoundation/0g-deployment-scripts` — "use directly" | ❌ **no licence at all.** No `LICENSE` file, and no `package.json` on `main` | `GET /repos/0gfoundation/0g-deployment-scripts` → `"license": null`; root listing is `.gitignore`, `README.md`, `foundry/`, `hardhat/`, `truffle/` |
| The 0G SDK versions are **0.9.0** (compute) and **1.2.11** (storage) | ✅ accurate | `package.json` of each installed package |

**What this changed.** `docs/PRIOR_ART.md` had planned to "lift patterns" from the first of those
and "use directly" from the second, with *"Check repo"* sitting in the licence column of both. No
code was in fact copied — the contract and the Hardhat config are written here — but the plan of
record rested on a licence nobody had looked up. Both entries are now read-only, and this row
exists so the question is not asked again from memory.
