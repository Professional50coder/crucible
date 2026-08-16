# Updates in this Wave — Wave 3

This file is the source text for AKINDO's **"Updates in this Wave"** field. That field is what
the **Progress & Momentum** criterion reads, and Progress & Momentum is **40%** of the score —
the single largest weight. It is worth writing properly.

> **Before pasting:** every `PLACEHOLDER_*` token below must be replaced with a real value, and
> **any line describing work that did not actually land must be deleted, not softened.** A
> changelog claiming something that isn't in the repo is worse than a shorter changelog, because
> a judge can check the repo in thirty seconds. Deletion is free; a caught overclaim is not.
>
> **Audited 2026-08-15, re-audited 2026-08-16** against the repo and the live chain. Every claim
> below was checked; unsupported ones were removed rather than reworded. What remains is checkable.
> The 2026-08-16 pass disproved nine claims this repository had already published — they are listed
> in full below rather than quietly deleted, because a correction found by its author is evidence
> the checking is real, and a changelog whose claims only ever grow is one nobody has checked.

---

<!-- PASTE FROM HERE -->

## Crucible — Wave 3

**What it is:** Crucible turns fine-tuning on the 0G Compute Network into a single upload and
issues every resulting model a verifiable birth certificate — base model, dataset,
hyperparameters and TEE provider — canonically hashed, anchored on 0G Chain, and minted as an
ERC-7857-*style* Agentic ID.

Crucible went from an empty directory to a tested system with a live contract on 0G inside this
wave: **1,117 tests**, a `Passport.sol` deployment on 0G Galileo testnet, two minted passports,
three paid fine-tuning runs, and on-chain verification anyone can call themselves.

**Where it is not finished:** `Passport.sol` is **not yet on 0G mainnet (16661)**. That is the
Wave 3 hard requirement and it is the largest thing still open. It is stated here rather than
left for a judge to discover.

---

### Proof anyone can check right now — 0G Galileo testnet (16602)

| | |
|---|---|
| `Passport.sol` | [`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7) |
| Source verified | ✅ [`#code`](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7#code) — `v0.8.19+commit.7dd6d404`, evmVersion `paris`, optimizer 200 |
| Deployment tx | [`0x302a4278…8a6dd1`](https://chainscan-galileo.0g.ai/tx/0x302a4278b9759f985f2e43964a4d5db1c2b6f14ef453935f230441ce728a6dd1) · block 49596815 · gas 2,238,586 |
| Passport #1 mint tx | [`0xb608a8a5…00b3b1`](https://chainscan-galileo.0g.ai/tx/0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1) · block 49597171 · gas 327,702 |
| Passport #2 mint tx | [`0x60094f63…420324`](https://chainscan-galileo.0g.ai/tx/0x60094f63) · block 49612106 · gas 293,514 — the run that **kept** its model |
| Dataset on 0G Storage | root `0xa5051ae7…9e7dbfd` · upload tx `0xc38e4131…d7da52` · resolves to `datasets/sentiment/train.jsonl`, 11,695 bytes, verifiable with `node tools/identify-dataset.mjs` |
| 0G Compute fine-tuning tasks | **three, all paid**: `10551604-…` · `3e385c46-…` · `b1807e85-…` on provider `0xA02b95Aa…1E31A09` |
| Daemon acknowledgement tx | [`0x4e2c81e2…7e4cfa`](https://chainscan-galileo.0g.ai/tx/0x4e2c81e237efc53623d869d361f212bf649ff132dc6274fbb18dc0d80c7e4cfa) · block 49716408 · gas 49,263 — sent by the orchestrator itself, not by a script |
| Manifest on 0G Storage | root `0xc757a7e6…e1140` · upload tx `0x8372e7de…6ca10` · 584 bytes |

**The whole verification loop, walkable by a stranger with no wallet and no clone of this repo:**

```
1. GET indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e6…e1140   → 584 bytes
2. keccak256(those exact bytes)                                        → 0x4f64bfe6…890f
3. verifyManifest(1, 0x4f64bfe6…890f)                                  → true
4. verifyManifest(1, keccak256("tampered"))                            → false
```

Step 2 needs no special handling: the stored bytes are the canonical manifest itself, so the
hash of the downloaded file *is* the value anchored at mint. Step 4 is the point of the whole
exercise — change one byte and the chain says no.

> **Passport #1 is a live-chain smoke test of the contract, not a completed fine-tune.** Its
> base-model hash, dataset root hash, training-config hash, task ID and provider are the real
> values from the 2026-08-14 run. Its **adapter hash is a deliberate sentinel** —
> `keccak256("crucible:adapter-not-retrieved:<taskId>")` — because the adapter was never
> retrieved. It is intentionally not a plausible-looking root hash, so anyone recomputing it
> learns immediately that no adapter exists.

---

### The headline: the daemon did the thing it claims

Crucible's pitch is a daemon that sits at the CLI so you do not have to, and acknowledges before
the 48-hour deadline destroys your model. Until **2026-08-16 that daemon had never once done it
against 0G.** Runs 1 and 2 were driven by scripts. The component was thoroughly tested against
fakes, which is not the same thing as true, and the difference is exactly the kind a judge should
catch.

A third task was submitted through the daemon's own HTTP API and then left alone:

```
POST /jobs                    → job df56bffb-…, submitted by the Submitter as task b1807e85-…
delivered      08:53:57Z      → detected by the Poller
scheduled      09:53:57Z      → +1h, the real default. 47 hours of margin
downloaded     09:54:15Z → 09:55:50Z   93,642,471 bytes from 0G Storage
acknowledged   09:56:05Z      → tx 0x4e2c81e2…7e4cfa, block 49716408
```

Read back from the `FineTuningServing` contract rather than the provider's API — because this
project has already published one conclusion it inferred from a status field and had to retract
it — `getDeliverables` returns `acknowledged: true` with model root `0x3bdc74ea…fbad6`.

Two details matter more than the result. The daemon ran on its **own default**
`downloadMethod: 'auto'`, which tries 0G Storage first and therefore spawns the bundled Linux
binary that fails on Windows; forcing the TEE path would have proven less. And **nothing was
shortened for the demonstration** — the acknowledgement fired a full hour after delivery, exactly
as designed. Recorded with four explicit non-claims in `runs/run3-daemon.json`.

### ERC-8004: checked against the chain, not the docs

0G's Agentic ID documentation states that Agentic IDs are *"compatible with ERC-8004, the
Trustless Agent standard that 0G officially supports"*. Neither that page nor the EIP names a
deployed address, so we resolved it by `eth_call` instead of by reading. **The Identity and
Reputation registries are live on both 0G networks** — mainnet identity
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` answers `name()` with `AgentIdentity`.

And the finding that decides it: **there is no Validation Registry**, on 0G or anywhere; the
ERC-8004 contracts repository says that portion is still under discussion with the TEE community.
A Model Passport is structurally a validation attestation, so the registry that fits is the one
that does not exist, and the two that do exist are the half that fits worst — the score field is a
`uint8` 0–100 for which a lineage record has no honest value. `docs/ERC8004.md` therefore
recommends documentation-only alignment now rather than self-deploying a non-canonical singleton,
and states plainly what registering would *not* let us claim.

### Corrections this wave — nine claims that were wrong

Progress is not only what was added. Every item here was believed, published, and then disproved
by checking:

| We said | Actually | How we know |
|---|---|---|
| `databricks-dolly-15k` is **Apache 2.0** — in seven places | **CC BY-SA 3.0.** Share-alike is an obligation, so the derived slice inherits it and cannot sit under this repo's MIT licence. It now carries its own `LICENSE` | the dataset card's own front matter, `license: cc-by-sa-3.0` |
| Two 0G example repos are reusable — `PRIOR_ART` planned to "lift patterns" and "use directly" | **Both are unlicensed.** No `LICENSE`, no `license` field. Default copyright: readable, not reusable. Both actions corrected to read-only | GitHub API returns `"license": null` and 404 on `/license` for all three |
| A duplicate upload to 0G Storage reverts with `CALL_EXCEPTION` — taught in four places including a public training dataset | **It does not revert.** A second submission of the same root was accepted and charged again. The error is inverted: trusting the documented behaviour means paying twice silently | submissions 146937 and 146938, identical root |
| The minimum Compute deposit is 3 OG — taught in our own public dataset | **Client-side SDK guard.** `MIN_ACCOUNT_BALANCE()` reads 0.1 0G on testnet; our ledger was created with 0.3 | one `eth_call` |
| LoRA adapter is "~100 MB" | **93,642,469 bytes, measured.** Close, which is only knowable because it was checked | the retrieved artifact, sha256 `0x9f788764…` |
| "ERC-7857 Agentic ID", unqualified, in eleven places | **ERC-7857-*style*.** `authorizeUsage` and the identity surface are implemented; `transfer()` with oracle re-encryption and `clone()` are not | the contract |
| The bug "permanently locks a user out of the network", in seven files | It strands **that user's deliverable queue with that provider**. Several of those files offered the escape hatch two lines later, contradicting themselves | the SDK's own source |
| The architecture doc's sample manifest showed `network: mainnet` and `attestationVerified: true` | Nothing is on mainnet, and no real run can produce `true` because `verifyService()` is never called | the code |
| `@crucible/core` "converts" datasets — claimed in five places | It did not. There was no converter. **So one was built**, rather than deleting a fifth capability claim | `packages/core/src/convert.ts`, 16 tests |

### Shipped alongside those corrections

- **A dataset converter that refuses to lose a field.** Converts between 0G's three formats;
  `instruction` and `chat` round-trip byte-exactly, and a record that cannot convert without
  dropping something — a multi-turn conversation, a second system prompt — is skipped and reported
  by line rather than silently truncated. Converting *to* `text` is supported and flagged lossy;
  converting *from* it is refused, because there is no structure to recover and guessing one would
  be inventing provenance.
- **The library is reachable.** `packages/cli` had one command and no tests. It now exposes
  `validate`, `convert` and `config` over the same core rules, with 62 tests, and its cost display
  no longer prices every run at a hardcoded 10,000 tokens while calling it an estimate — `--dataset`
  prices your file, and the fallback is relabelled as 0G's documented reference figure.
- **A passport that stays checkable after you download it.** The certificate exports as SVG with
  the canonical manifest embedded as base64 inside it, so a downloaded file can be keccak256'd and
  compared against `passportOf(tokenId).manifestRootHash` without trusting the page it came from.
  Round-trip proven against both real passports. Mechanism credited to Excalidraw (MIT) in
  `docs/PRIOR_ART.md`.
- **An Open Graph card per passport**, keyed off the manifest hash so it is immutable, and honest
  at thumbnail size: passport #1 renders `ADAPTER NOT RETRIEVED` in red, passport #2 renders
  `ADAPTER RETRIEVED` in green, demo records carry a `DEMO RECORD` band, and nothing prints as
  attested.
- **A Hugging Face model card emitter**, so a passport's provenance travels to the largest model
  registry there is — `base_model_relation: adapter` (a LoRA is not a finetune), with the
  unverified attestation, the sentinel adapter, and "proves lineage, not honest training" all
  stated on the card rather than omitted from it.
- **One generic mint script**, parameterised and dry-run by default, replacing two scripts whose
  task IDs and hashes were hardcoded constants. It preserves the refusal to mint an unacknowledged
  deliverable, and it reproduces both existing passports' hashes byte-identically from their
  recorded inputs — a correctness proof that costs no gas.
- **The daemon tells you what it knows.** Full state-transition history and an explicit
  `ackDeadlineMissed` flag are now on the wire; previously a client could detect the worst outcome
  in the system — model lost, 30% forfeit — only by substring-matching human-readable error text.
  And the queue-recovery API is routed at last: `detectLock`/`unlock` were implemented and tested
  but reachable only for accounts that already had a local job, which is precisely not the account
  that arrives with a stranded queue.
- **The launch page stopped contradicting the landing page.** `/new` opened with mainnet
  pre-selected and asserted 0G fine-tuning "is available" there, two clicks from a page listing
  "not mainnet" under what this project does not claim.

---

### Core improvements

- **`@crucible/core` — the library that makes 0G's documented footguns unreachable.** Pure and
  network-free: 147 tests across 8 files, none of which requires a private key, funds, or a live
  network.
- **Training-config validation.** 0G rejects a fine-tuning config with extra *or* missing keys.
  Crucible enforces the exact five-parameter template — `neftune_noise_alpha`,
  `num_train_epochs`, `per_device_train_batch_size`, `learning_rate`, `max_steps` — with per-key
  range checks and a hard rule against exponent notation for `learning_rate`. Every rejection 0G
  would issue is caught locally, before any funds move.
- **Dataset conversion and validation.** Automatic format detection across all three 0G-accepted
  shapes (chat-messages, instruction, text-completion), mixed-format detection reported with
  line numbers, JSONL emission, UTF-8 and minimum-example enforcement, and error capping so a
  broken 15,000-line file produces a readable report instead of a wall. Exercised against 6 real
  datasets (614 records) and 11 deliberately invalid fixtures, all 11 correctly rejected.
- **A bug found by cross-checking, not by tests.** `validateDataset` takes already-parsed
  records, so it never sees bytes — and `JSON.parse` silently tolerates a trailing `\r`. A
  Windows-authored dataset passed validation and would have reached 0G unflagged. Fixed with
  `validateDatasetFile`.
- **Fee estimation from the live on-chain price.** Reads `pricePerToken` from the provider's
  service struct and adds the per-model storage reserve fee, reproducing 0G's own documented
  worked example exactly — the arithmetic matches theirs rather than merely looking plausible.
  Measured against the broker's real token count, the local estimator runs ~2.3× high on short
  chat records: conservative by design, never under-quoting, and labelled "estimated" in the UI
  because `calculateToken()` remains authoritative.
- **Passport manifest and canonical hashing.** A deterministic canonicalization — every key
  sorted recursively, no whitespace — so two manifests with identical content serialize
  byte-identically regardless of key insertion order. `keccak256` over those bytes is the value
  anchored on-chain. This is the invariant the entire verification story rests on: if it isn't
  deterministic, the anchor is meaningless. 37 tests.
- **The 48-hour deadline, automated.** After a task reaches `Delivered`, 0G's documentation gives
  you 48 hours to download and acknowledge the model; miss it and the provider force-settles, you
  lose access to the model, and *"30% of the total task fee will be deducted as compensation for
  the provider's compute resources."* No notification of any kind exists. Crucible's daemon acts
  at +1h rather than at the buzzer, retries with backoff, and falls back at +36h with 12 hours of
  deadline still in hand. 21 tests.
- **The locked-deliverable-queue bug, made unreachable.** The 0G SDK's own source records a May
  2026 hackathon bug report: a user took the legacy `downloadModelFrom0GStorage` + `decryptModel`
  path without acknowledging, the artifact was later garbage-collected from both 0G Storage and
  the TEE buffer, `acknowledgeModel` could no longer succeed, and every subsequent
  `addDeliverable` reverted with *"previous deliverable not acknowledged"*. What blocks is that
  user's deliverable queue with that provider — the report calls it permanent, though the same
  SDK names `acknowledgeDeliverable` as the escape hatch; what is genuinely unrecoverable is the
  garbage-collected model. Crucible only ever calls `acknowledgeModel`, so it cannot reach that
  state, and it exposes `acknowledgeDeliverable` as a one-click unlock for queues already stuck.

---

### 0G integration

Crucible uses all four 0G components. Each is described below at the level it actually reached.

- **0G Compute — used, paid for, and run against the live network.** Provider and model
  discovery, live fee calculation, task creation, log streaming and acknowledgement, via
  `@0gfoundation/0g-compute-ts-sdk@0.9.0`. A real fine-tuning task was created and paid for on
  the **testnet** provider `0xA02b95Aa6886b1116C4f334eDe00381511E31A09` — 1x H200 inside an Intel
  TDX enclave (Phala dstack), TEE signer `0x24135b4Bd964872284728F79F5f17eB874C5583A`
  acknowledged on-chain. Development runs on testnet deliberately, to keep real value out of the
  loop.
- **Credential-free discovery.** Crucible uses `createZGComputeNetworkReadOnlyBroker`, which
  needs no wallet and no private key, so provider status, hardware quota, TEE state and live
  pricing are visible to a visitor who has connected nothing. This is what allowed the entire
  discovery and validation layer to be built and tested before any wallet was funded.
- **0G Storage — both halves of the evidence live here.** The **training dataset** was uploaded
  and is addressed by root hash `0xa5051ae7…9e7dbfd` (upload tx `0xc38e4131…d7da52`); that root
  hash is one of the facts the passport commits to, and it is what lets a third party retrieve
  the training data and check it. The root hash is persisted before task creation, so a crash
  between the two never costs a second upload.

  The **passport manifest** is on 0G Storage too, at root
  `0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140` (upload tx
  `0x8372e7de…6ca10`). This is what turns the on-chain anchor from a gesture into a proof: an
  anchor whose bytes live on one laptop proves nothing, because a verifier cannot recompute a
  hash over bytes they cannot obtain. What is stored is **exactly the canonical manifest — 584
  bytes, no envelope, no metadata, no trailing newline** — so `keccak256` of the file precisely
  as downloaded *is* the anchored value, with nothing to unwrap first.
- **0G Chain — `Passport.sol` deployed to Galileo testnet (16602)**, address
  `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`, with passport #1 minted and `verifyManifest`
  demonstrated returning `true` for the anchored hash and `false` for a tampered one. Solidity
  0.8.19 with `evmVersion: paris`. 0G's docs ask for 0.8.19 *and* cancun; solc only added the
  cancun target in 0.8.24, so the two are mutually exclusive. Paris is the highest target 0.8.19
  can emit, and its bytecode contains no `PUSH0` or cancun-only opcodes, so it runs identically
  on a cancun-era chain. Probed on this toolchain and documented in `contracts/README.md`.
  - **Source-verified on the Galileo explorer** — confirmed through the explorer's own
    `getsourcecode` endpoint rather than by trusting the CLI: `ContractName Passport`,
    `v0.8.19+commit.7dd6d404`, `EVMVersion paris`, optimizer enabled at 200 runs, 78,649
    characters of source published. Notably **paris verified on the first submission**, which
    settles the compiler-pin question: 0G's documentation asking for cancun is advice, not a
    constraint.
  - **Getting verification to work at all was its own finding.** 0G chainscan is a Conflux-Scan
    derivative — not Blockscout and not Etherscan — and its Etherscan-compatible API is mounted
    at `/open/api`, not `/api`. `/api` is a route in the explorer's single-page app, so
    `hardhat-verify` receives the SPA's HTML shell and fails with `Unexpected token <`. Sourcify
    does not help either: 0G is not on its supported-chain list. Written up in
    `contracts/README.md` so nobody else loses the afternoon.
  - **0G mainnet (16661): not deployed.** `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` — **still open.**
    The same verification command is now known to work, so the mainnet deploy should verify too.
  - **Mainnet explorer activity:** `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL` — **still open**
- **0G Agentic ID — ERC-7857-*style*, and the qualifier is deliberate.** One fine-tune mints one
  token carrying its lineage hashes, so provenance travels with ownership instead of living in a
  database row. Implemented: `authorizeUsage` / `revokeAuthorization` (capped at 100 per token,
  all cleared on transfer) and a public `verifyManifest(tokenId, candidateHash)` view. 70 Hardhat
  tests. **Not implemented: ERC-7857's `transfer()` with oracle re-encryption, and `clone()`.**
  Passport lineage is public by design — there is no encrypted metadata to re-encrypt — so the
  oracle half of the standard has nothing to act on here. Calling this "full ERC-7857" would be
  an overclaim, so it is not called that anywhere.
- **Verified against the live network, not the docs.** Every network fact in this repo was
  executed and is published in `docs/FIELD_NOTES.md`, including three corrections to 0G's own
  documentation: mainnet fine-tuning **is** available (the official example's `.env.example` says
  it is not) and is 37.5% cheaper than testnet at 500 vs 800 neuron/token; the Builder Hub and
  the official example recommend different SDK package families; and the docs' config template
  (`max_steps: 3`) differs from the shipped working config (`max_steps: 45`).

---

### The failure this project exists to prevent, observed first-hand

The first authenticated run did **not** produce a usable model, and the reason is the exact
hazard Crucible was built for. Reporting it is more useful than hiding it, and it is all readable
on-chain by anyone.

Task `10551604-2664-4516-86cf-269a62f93bfc` progressed `Init → SettingUp → SetUp → Training →
Trained → Delivering → Delivered`. Then `acknowledgeModel` failed twice over:

1. `downloadMethod: 'auto'` tries 0G Storage first → **ENOENT**. The bundled `0g-storage-client`
   binary is a **Linux ELF** shipped to a Windows host. Its sibling `uploadDatasetToTEE()` fails
   earlier still, with `window is not defined` on a Node code path. Together these make 0G
   fine-tuning unusable on Windows through the official SDK.
2. The TEE fallback answered **HTTP 429 Too Many Requests**.

The provider then settled the deliverable unacknowledged. On 0G's `FineTuningServing` contract
(testnet `0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA`), `getDeliverables` still reports
`acknowledged: false`, `settled: true`, and an **empty `encryptedSecret`** — so the adapter,
which really was produced at root hash `0xbd1df54d…`, has no decryption key and cannot be
recovered. The `FeesSettled` event charged **0.00355584 0G** against a **0.0118528 0G** fee:
exactly 30%, the documented penalty, and the arithmetic that proves the model was lost rather
than delivered.

**No adapter file exists in this repo, and nothing here claims a completed end-to-end
fine-tune.** A user following 0G's documented flow by hand on Windows would have hit ENOENT, seen
no retry, and lost the same way — with no notification at any point. Crucible's acknowledger is
the direct response: it was not in the loop for this run, and it exists so that no subsequent run
depends on someone watching a terminal.

One clarification worth publishing, because the two are easy to conflate: `getLockedTime()`
returns **86400 (24h)**, which is the **refund** lock period the SDK uses as
`lockTime - (now - refund.createdAt)`. It is *not* the acknowledge deadline. The acknowledge
window is **48h** and is documentation, not a contract constant.

---

### Agent / AI workflow

- **The Model Passport** — a machine-readable, versioned manifest binding a fine-tuned adapter to
  its base model hash, dataset root hash, exact hyperparameters, and provider, canonicalized and
  hashed so the hash is reproducible by anyone. This is the artifact the whole project exists to
  produce.
- **One upload replaces a twelve-step CLI flow** with its documented footguns. Upload → validate
  → estimate → launch → watch → acknowledged automatically → passport → mint.
- **The real 0G state machine, not an invented progress bar.** Jobs mirror 0G's own states —
  `Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered → UserAcknowledged →
  Finished`, plus `Failed` — with streamed training logs. A provider reporting `occupied: true`
  is modelled as a first-class **queued** state rather than an error, because 0G exposes exactly
  one fine-tuning provider per network and tasks run one at a time.
- **Timing hazards handled.** Decryption is only attempted at `Finished`; attempting it earlier
  fails with `second arg must be public key` because the provider needs roughly a minute to
  settle and upload the key.
- **A dataset-quality layer that caught its own false positive.** `packages/ml` (320 tests) does
  leakage detection, PII scanning and duplicate detection before a dataset costs anything. Its
  leakage detector originally compared the whole prompt side *including* the `system` turn — but
  a constant system prompt is correct dataset design, appears verbatim in every record, and
  dominates similarity when user content is short. Two clearly different records scored **0.8137**
  with the 84-char system prompt included and **0.1875** on user content alone, against a 0.75
  threshold. Every well-built system-prompted dataset would have been reported contaminated.
  Fixed by excluding `system` turns from the leakage key while keeping them in the
  exact-duplicate key.

---

### Developer & demo improvements

- **`crucible doctor`** — a credential-free preflight command that reports live fine-tuning
  providers on both networks, whether each is occupied, hardware quota, TEE signer and
  acknowledgement state, current price per token, estimated cost of a demo run, and wallet
  readiness. It needs no private key for the provider half.
- **Orchestrator** — job store, 0G task poller, auto-acknowledge daemon, stuck-queue recovery,
  and an HTTP + SSE API. 174 tests across 11 files.
- **Web app** — upload, validate, configure, cost estimate and launch (`/new`); a live training
  view driven by the real task states (`/jobs`, `/jobs/[id]`); a public Model Passport page with
  every hash rendered next to its verification link (`/passport/[id]`); and a public gallery
  (`/gallery`). 310 tests across 24 files. It runs against the orchestrator when
  `NEXT_PUBLIC_CRUCIBLE_API_URL` is set and against an in-memory fixture store when it is not, so
  the UI can be demonstrated with no backend running.
- **Independent verification path, documented.** The root README carries a step-by-step procedure
  for verifying any passport with no wallet: fetch the manifest, recompute the canonical
  `keccak256`, call `verifyManifest` on the chain, then check the dataset root hash, the base
  model hash, and the provider's TEE signer.
- **`docs/FIELD_NOTES.md`** — live-verified network facts, the real SDK surface (much of which is
  undocumented on build.0g.ai), every footgun with its exact error string, and the three
  corrections to 0G's docs above. Written for every other 0G builder. These cost hours to find;
  nobody else needs to spend them.
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

**Crucible proves lineage, not honest training.** It proves that a manifest hashes to the value
anchored on-chain, that the dataset is retrievable at the stated root hash, and that the
provider's TEE signer is acknowledged on-chain. It does **not** prove the provider ran the epochs
it claimed — that requires zero-knowledge proofs over the training computation (PEFT-restricted
update circuits enforcing optimizer semantics, per arXiv 2510.16830), which is a research
programme and is on the roadmap, not in this submission.

Three further limits, stated rather than buried:

- **No completed end-to-end fine-tune.** The one settled run reached delivery and was never
  acknowledged; no adapter artifact exists. Passport #1's adapter hash is a labelled sentinel.
- **Nothing is on mainnet.** Wave 3 asks for a mainnet contract address plus explorer activity;
  the testnet deployment exists to de-risk that, not to substitute for it.
- **The web app has no mint button.** It reads and renders mint state; passport #1 was minted by
  a script. And with `NEXT_PUBLIC_CRUCIBLE_API_URL` unset it serves fixture data rather than a
  live backend.
- **Storage uploads run from scripts, not from the service.** The orchestrator's own upload path
  still calls the compute SDK's `uploadDataset()`, which is the one that breaks on Windows.

### Next wave

Mainnet deployment and mint first — it is the outstanding hard requirement. Then: a fine-tune
carried all the way through acknowledgement to a real adapter; moving the orchestrator's upload
path onto the storage SDK so the whole flow works on Windows; a hosted passport gallery so a
judge can click rather than clone; TEE attestation verification surfaced inside the passport via
`verifyService`; OpenSSF Model Signing interop so passports carry a standards-compliant
signature; hosted inference against fine-tuned adapters; and `authorizeUsage` developed into a
model-licensing flow.

<!-- PASTE TO HERE -->

---

## Placeholders that must be filled before this is pasted

Only two remain, and both are blocked on the same thing: a funded mainnet wallet.

| Token | Source |
|---|---|
| `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` | output of the mainnet deploy |
| `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL` | the contract's transactions tab, or a specific mint tx |

If mainnet is still not deployed at submission time, **delete both bullets and leave the
"Nothing is on mainnet" limitation** — an honest gap reads better than an unfilled placeholder.

## Lines to delete if the work did not land

Audited 2026-08-15. Result of each check recorded below.

- [x] **Passport manifest + canonical hashing** — `packages/core/src/passport.ts` is shipped and
      covered by 37 tests in `packages/core/test/passport.test.ts`. **Claim kept.**
- [x] **Auto-acknowledge daemon** — implemented in `services/orchestrator/src/acknowledger.ts`
      (not merely designed), with `recovery.ts` for the Bug #4 unlock and 21 tests. **Claim kept.**
- [x] **`Passport.sol` deployed and source-verified on mainnet** — **mainnet NOT DONE.** No
      mainnet deployment exists; `eth_getCode` returns `0x` and the wallet holds 0 with nonce 0.
      The old "deployed and source-verified on 0G mainnet, chain 16661" bullet was **deleted**
      and replaced with the testnet deployment, plus explicit open markers for mainnet.
      **Source verification on testnet is real** and was confirmed independently via the
      explorer's `getsourcecode` endpoint (`Passport`, `v0.8.19+commit.7dd6d404`, `paris`,
      optimizer 200, 78,649 chars of source) — not taken on the CLI's word.
- [x] **Web app: upload flow, live training view, passport page, gallery** — all four exist as
      routes (`/new`, `/jobs/[id]`, `/passport/[id]`, `/gallery`) with 158 tests, and `next build`
      is clean (7 routes, 88.8 kB shared JS). **Claims kept**, with the mock-mode default stated
      so nobody infers a live backend from a working UI, and with no claim of a mint button,
      which does not exist.
- [x] **Any claim that a real fine-tune completed end to end** — **it did not.** The run reached
      `Delivered` and was force-settled unacknowledged with the 30% penalty; the on-chain
      deliverable still reads `acknowledged: false` with an empty `encryptedSecret`. Every
      mention now says so plainly, and the sentinel adapter hash is labelled everywhere.

### Claims removed in this audit

Recorded so they are not reintroduced by a later edit.

| Removed claim | Why |
|---|---|
| "a working, **mainnet-anchored** system" | Nothing is on mainnet. Anchoring is on Galileo testnet |
| "`Passport.sol` deployed and **source-verified** on 0G mainnet, chain 16661" | Not deployed to mainnet; not source-verified anywhere |
| "Runs against the **mainnet** fine-tuning provider `0x940b4a10…`" | The real run used the **testnet** provider `0xA02b95Aa…`. Mainnet was probed read-only only |
| "the passport does not depend on Crucible staying online — the manifest is retrievable at its root hash" | Was unsupported when audited — the manifest existed only locally. **Since re-established as true**: the manifest is now on 0G Storage at root `0xc757a7e6…1140` and the downloaded bytes hash to the anchored value. Reinstated with the root hash and upload tx attached, which is what made it checkable |
| "Duplicate uploads … are caught and the existing root hash reused" | No `CALL_EXCEPTION` handling exists. Replaced with what the code does do: persist the root hash before task creation so a crash never costs a second upload |
| "Crucible funds the fine-tuning sub-account explicitly and verifies the balance before creating a task" | No `transferFund` or sub-account funding code exists. This was done by hand during the spike; the footgun stays documented in FIELD_NOTES, but it is not an implemented feature |
| "Mint-to-Agentic-ID flow" in the web app | The app renders mint state; it sends no mint transaction. Passport #1 was minted by `contracts/scripts/mint-testnet-passport.js` |
| "five documented footguns" | The count disagreed with `docs/PRODUCT.md`, which documents six. Replaced with an unnumbered reference |
