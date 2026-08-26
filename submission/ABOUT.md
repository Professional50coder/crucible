## What it does

Crucible gives every model fine-tuned on 0G a **birth certificate**.

You upload a dataset. Crucible validates it, converts it, prices the run, submits it to a 0G
Compute fine-tuning provider, watches the task through every state, retrieves the adapter from 0G
Storage, and acknowledges it on-chain before the 48-hour deadline that would otherwise cost you
the model and 30% of the fee.

Then it does the part nobody else does. It takes the four facts that answer *where did this model
come from* — the base model's hash, the dataset's 0G Storage root, the exact training
configuration, and the provider that ran it — canonicalises them into a manifest, stores that
manifest on 0G Storage, hashes it with keccak256, anchors the hash on 0G Chain, and mints it as an
ERC-7857-style Agentic ID: a **Model Passport**.

A stranger can then check it with **no wallet, no account, and no clone of this repo**. Pull the
manifest from the public 0G Storage indexer, recompute the hash yourself, and ask the deployed
contract whether it agrees:

```
curl -s "https://indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140"
verifyManifest(1, 0x4f64bfe6…6059890f)  →  true
verifyManifest(1, keccak256("tampered"))  →  false
```

That is the whole trust claim, and it runs against public endpoints that never touch our servers.

**What it does not claim, stated up front:** Crucible proves **lineage and delivery integrity**,
not honest training. It shows what model, what data, what configuration and what enclave — not
that the provider actually ran the epochs it said it did. Proving that needs zero-knowledge proofs
over the computation itself. Anyone claiming otherwise on a public repo would be caught, and
should be.

## The problem it solves

**Why this is the need of the hour.** Fine-tuning has moved off the machine that owns the weights.
Adapters are trained on rented GPUs, inside enclaves, by providers the buyer never meets, and then
shipped, resold, merged and served. The moment training leaves your hardware, "where did this model
come from" stops being a question you can answer from your own filesystem — and it is the exact
question that regulators, model marketplaces, and the agents about to trade these things
autonomously all need answered. The field agrees: vouch-protocol's Birth Certificate Protocol,
OpenSSF Model Signing, Cisco's Model Provenance Kit and the Verifiable Fine-Tuning line of work
(arXiv 2510.16830) are all circling this. **We did not invent model provenance.** What has not been
done is landing it on a decentralised AI L1 where the training compute, the dataset storage, the
attestation anchor and the model's transferable identity are all native primitives on one stack.
That is the gap Crucible fills, and 0G is the only place it can currently be filled.

Underneath that, four concrete failures — all measured on the live network, none hypothetical:

**1 · The provenance chain already exists, and 0G throws it away.** Every fine-tuning task on 0G
emits the base model hash, the dataset root hash, the training parameters, and a TEE-verified
delivery. Four facts that together answer the question — printed to a terminal, and lost when the
buffer scrolls. Nothing surfaces them, nothing persists them, nothing makes them checkable by a
third party.

**2 · A 48-hour deadline with no warning.** After a task reaches `Delivered` you have 48 hours to
acknowledge. Miss it and you lose the model, and 30% of the fee is deducted. No notification, no
dashboard, no reminder — you are expected to poll a CLI. **We ran into this for real.** Our first
fine-tuning task was force-settled unacknowledged and debited exactly **30.0000%** of the fee. The
model is gone. That arithmetic is the proof it was forfeited rather than quietly delivered
somewhere else.

**3 · A documented bug that locks your deliverable queue.** The SDK's own source comments describe
a hackathon bug report where a user retrieved a model via the legacy path, never acknowledged, and
found every subsequent delivery reverting with *"previous deliverable not acknowledged"*. The
escape hatch — `acknowledgeDeliverable` — exists only in a TSDoc comment. Crucible exposes it as
`POST /jobs/:id/unlock`.

**4 · "Done" is not "usable".** You receive a LoRA adapter, not a model. Getting from one to the
other is a research project involving HuggingFace weights, a CUDA-matched torch, PEFT, and knowing
to wait about a minute after acknowledge or decryption fails with `second arg must be public key`.

## Challenges I ran into

**Model retrieval is broken on Windows, in two separate ways.** The TEE download path throws
`stream.on is not a function` universally, and the fallback 0G Storage client is a **Linux binary**
spawned on a Windows host. Both paths fail. That is what cost us the first model. The second run —
same contract, same wallet, same dataset, same base model, same config, same provider, same SDK,
one variable changed — was acknowledged from WSL2 Linux, retrieved 93,642,469 bytes, validated the
artifact against the root hash the provider had committed on-chain, and came back
`acknowledged: true`. Both outcomes are permanently recorded on the same contract, which is the
point: the difference is now diagnosable rather than anecdotal.

**Providers settle in about 6 hours, not the documented 48.** Anything built on the 48-hour figure
is built on sand. Our poller had to be rewritten around the measured number.

**Contract verification failed for a reason no error message explained.** 0G's explorer is a
Conflux-Scan derivative — not Blockscout, not Etherscan — and its Etherscan-compatible API is
mounted at `/open/api`, not `/api`. `/api` is a route in the explorer's own single-page app, so
`hardhat-verify` was being handed an HTML shell and failing with `Unexpected token <`. We
confirmed the fix by calling `getsourcecode` ourselves rather than trusting the CLI's exit code.

**The documentation contradicts the network.** The official example says mainnet fine-tuning is
unavailable; it is available, and cheaper. The Builder Hub recommends `@0gfoundation/*` while the
example pins `@0glabs/*`. The docs' config template disagrees with the shipped working config. The
SDK overestimates required funding by roughly 30×. And the Agentic ID page publishes three method
signatures that **do not exist in the deployed contract** — code against the documented `mint` and
you get an empty `execution reverted`, which is what a missing selector looks like and is
indistinguishable from a permission error, so you go hunting for a `MINTER_ROLE` you never needed.
We lost hours to each of these, and every 0G builder loses the same hours — which is why
`docs/FIELD_NOTES.md` exists and is publishable to 0G as-is. **15 defects in total**, each written
down with the evidence that found it and each reproducible by a reader.

## Technologies I used

**0G — all four components, each load-bearing:**

- **0G Compute** — the fine-tuning provider that trains the adapter, inside an Intel TDX TEE
- **0G Storage** — dataset in, adapter out, and the canonical manifest that a verifier downloads
- **0G Chain** — `Passport.sol`, deployed and **source-verified** on Galileo (chain 16602) at
  `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`
- **0G Agentic ID (ERC-7857-style)** — the passport as a transferable on-chain identity, and the
  same lineage additionally anchored into **0G's own official Agentic ID registry** as
  **token #138** (`0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`, mint tx `0x6e38a421…c8ef68`)

That last one is worth a sentence. Verifying a Crucible passport against Crucible's contract asks
you to trust Crucible's contract. So the same manifest hash is also written into a registry **0G
deployed and we do not control** — and the two agree:

```
getIntelligentDatas(138) on 0G's Agentic ID  →  0x0f46406e…3b93a7
verifyManifest(2, 0x0f46406e…3b93a7) on Crucible's Passport  →  true
verifyManifest(2, keccak256("tampered"))                     →  false
```

Two independent contracts carrying the same digest, plus a third check that needs neither of them —
hashing the manifest bytes off 0G Storage yourself. Every call above is a `view`. No wallet.

**Why a custom contract when 0G ships an Agentic ID?** Because ERC-7857 stores one opaque
`(description, hash)` pair, so you cannot ask it *"which token was trained on dataset 0xa5051ae7…?"*
— Crucible makes each element of the lineage a typed, indexed field. Because the standard's whole
purpose is keeping model data *encrypted* and re-encrypting it on transfer, which is the opposite of
what a birth certificate needs: ours is public by construction, so there is no payload to re-encrypt
and the oracle half of the standard has nothing to act on. And because ERC-7857 has no way for a
stranger to check a claim, while `verifyManifest` does. Crucible matches the official surface where
the shape is right — including the same 100-authorization cap — and anchors into 0G's registry as
well, so the lineage is readable from a contract we do not control. Full comparison, with the
on-chain evidence: `docs/AGENTIC_ID_ALIGNMENT.md`.

**Stack:** TypeScript · Node 22 · Solidity 0.8.19 (`paris`, optimizer 200) · Hardhat · Next.js 14 ·
React 18 · viem · wagmi · RainbowKit · Tailwind · Framer Motion · Vitest · keccak256 · LoRA on
Qwen2.5-0.5B-Instruct.

## How we built it

Five packages, each independently testable, **808 tests** total:

- `packages/core` — dataset validation and conversion, token estimation, fee arithmetic that
  matches 0G's own calculation, canonical manifest generation, deterministic keccak256 hashing,
  and Hugging Face model-card emission
- `packages/ml` — dataset analysis before you pay for anything: balance, duplicates, leakage,
  length distribution, PII detection, plus an eval harness that scores the tuned adapter against
  the base model
- `services/orchestrator` — the daemon. Submit, poll, retrieve, acknowledge, recover. Built around
  an explicit state machine and a clock abstraction, so every deadline path is tested without
  waiting for real time to pass
- `contracts` — `Passport.sol`, its deploy and mint scripts, and the tests that pin the ABI
- `apps/web` — the public gallery, the passport pages, and the run launcher

The design rule throughout: **every claim carries its receipt.** The manifest is canonical JSON so
two independent implementations hash it identically. The gallery labels which records are on chain
and which are fixtures, in the product itself, on every hash. `docs/CLAIMS_AUDIT.md` exists because
ten claims that could not be settled against the chain were **deleted, not softened**.

## What we learned

**Losing the first model was worth more than a clean run.** A successful task proves the happy
path. A forfeited one proves the penalty is real, produces an exact 30.0000% debit as evidence, and
tells you precisely which environmental defect caused it. Both are minted. Passport #1 records a
run that lost its model, and its own page says so before it says anything else — because a
provenance system whose first record is flattering is not a provenance system.

**The verification story only matters if it needs nothing from us.** Any design where you have to
trust our server, our API or our clone is theatre. Three curl-able commands against public 0G
endpoints, and a contract call anyone can make — that is the bar, and it forced real decisions
about canonicalisation.

**Documentation is infrastructure.** Most of the days lost on this build were lost to docs that
disagreed with the network. Writing down all 15 defects was not a side quest; it is the part most
likely to still be useful to 0G after the buildathon ends.

## What's next for Crucible

- **Mainnet.** `Passport.sol` on chain 16661, with at least one real mint and the explorer link,
  source-verified the same way Galileo was. Gas cost measured at ~0.0103 0G.
- **Wire the web launcher to the live orchestrator**, and retire the `MOCK DATA` badge the app
  currently wears honestly.
- **TEE attestation in the manifest** — carry the Intel TDX quote into the anchored document so the
  enclave itself is part of the record, not a footnote.
- **Repair the Windows retrieval path**, upstream. It needs 0G SDK fixes; the diagnosis is written
  up and ready to hand over.
- **Ship `FIELD_NOTES.md` to 0G** as a documentation PR. Fifteen defects, four of them corrections
  to 0G's own docs — including an Agentic ID page whose published `mint` signature is not in the
  deployed bytecode.
- **The honest frontier:** proofs over the training computation itself. Crucible establishes
  lineage. Establishing that the epochs were actually run is a different, harder problem — and we
  would rather name it than quietly imply we solved it.
