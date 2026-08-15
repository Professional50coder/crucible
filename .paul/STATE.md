---
description: "Crucible — current position and accumulated context"
type: ProjectState
about: "crucible"
---

# Project State

## Project Reference

See: .paul/PROJECT.md

**Core value:** Anyone who fine-tunes on 0G gets a working adapter and a verifiable public
record of how it was made — without touching a CLI or losing their model to a 48-hour deadline.
**Current focus:** v1.0 Wave 3 Submission — mainnet deployment is the one thing left that the
rules actually require.

## Current Position — 2026-08-15

Milestone: v1.0 Wave 3 Submission
Status: **Built and proven on testnet. Nothing on mainnet.**

| | |
|---|---|
| Code | `core`, `ml`, `orchestrator`, `contracts`, `web` all built and tested — **808 tests** |
| `Passport.sol` on Galileo testnet (16602) | ✅ deployed `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`, passport #1 minted, `verifyManifest` proven live |
| `Passport.sol` on mainnet (16661) | ❌ **not deployed.** Wallet balance 0, nonce 0. The single largest gap and a hard Wave 3 requirement — but it costs **~0.0103 0G of gas**, not 3 0G |
| AKINDO | GitHub **connected** (`Professional50coder`), team `Crucible` exists. No product yet, nothing submitted |
| First authenticated fine-tune | Ran on testnet. Reached delivery, then **was never acknowledged** — settled with 0G's 30% penalty. The model was lost. Detail below |
| Contract source-verified on the explorer | ✅ verified on Galileo — `Passport`, `v0.8.19+commit.7dd6d404`, `paris`, optimizer 200 |

**Target network for the fine-tuning flow is testnet** (decided 2026-08-14). Testnet is 60% more
expensive per token (800 vs 500 neuron) but that is irrelevant at these amounts, and it keeps
real value out of the development loop. Mainnet is the target for the `Passport.sol` deployment,
because that is what the Wave 3 requirement asks for. This supersedes the earlier decision to run
the flow itself on mainnet.

**Dev wallet:** `0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF` — throwaway, generated locally,
testnet only, key in gitignored `.env`. Never to hold real value.
Testnet balance **0.686326 0G**, nonce 5. Mainnet balance **0**, nonce 0. (Read from
`evmrpc-testnet.0g.ai` and `evmrpc.0g.ai` on 2026-08-15.)

## On-chain evidence — Galileo testnet, re-verified 2026-08-15

Every line below was read back from the live chain today, not copied from a deploy log.

| Fact | Value |
|---|---|
| `Passport.sol` | `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7` |
| Deploy tx | `0x302a4278b9759f985f2e43964a4d5db1c2b6f14ef453935f230441ce728a6dd1` · block 49596815 · gas 2,238,586 |
| Mint tx (passport #1) | `0xb608a8a5eeed36baa04c338ffed54b93458b1486b0cc66739fe36d68e400b3b1` · block 49597171 · gas 327,702 · status 1 |
| `ownerOf(1)` | `0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF` |
| Anchored manifest hash | `0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f` |
| `verifyManifest(1, anchored)` | **true** |
| `verifyManifest(1, keccak256("tampered"))` | **false** |

Compiler recorded in `contracts/deployments/galileo.json`: solc **0.8.19**, `evmVersion`
**paris**, optimizer on, 200 runs. Paris — not cancun: solc only added the cancun target in
0.8.24, so 0.8.19 cannot emit it.

**Source verification: done on Galileo.** Confirmed independently by calling the explorer's own
`getsourcecode` endpoint rather than trusting the CLI's exit code:

```
GET https://chainscan-galileo.0g.ai/open/api?module=contract&action=getsourcecode&address=0x27087B5b…
→ status 1 OK
  ContractName    Passport
  CompilerVersion v0.8.19+commit.7dd6d404
  EVMVersion      paris
  Optimizer       enabled, 200 runs
  SourceCode      78,649 chars   ABI 11,619 chars
```

Paris verified on the first submission, which settles the compiler-pin argument: 0G's docs asking
for cancun are advice, not a constraint.

**Why this took two attempts.** 0G chainscan is a **Conflux-Scan derivative** — not Blockscout
and not Etherscan — and its Etherscan-compatible API is mounted at **`/open/api`**, not `/api`.
`/api` is a route in the explorer's single-page app, so `hardhat-verify` was receiving the SPA's
HTML shell and failing with `Unexpected token <`. Sourcify is not an alternative: 0G is not on
its supported-chain list. Both networks now point at `/open/api`, so the mainnet deploy should
verify with the same command. Two further explorer quirks are written up in
`contracts/README.md` — notably that `checkverifystatus` returns *"Pending in queue"* for any
GUID including invalid ones, and `hardhat-verify` polls it uncapped, so a failed submission is
indistinguishable from a slow one and the CLI can hang forever. Confirm with `getabi` instead.

### The verification loop is closed, end to end

The manifest that passport #1's on-chain hash commits to is now **on 0G Storage**, so the full
chain of custody can be walked by a stranger with no wallet and no copy of this repo. Verified
by doing exactly that on 2026-08-15:

| Step | Result |
|---|---|
| Manifest on 0G Storage | root `0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140`, upload tx `0x8372e7de…6ca10` |
| `GET indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e6…` | HTTP 200, **584 bytes** |
| `keccak256(those exact bytes)` | `0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f` |
| Anchored on-chain at mint | `0x4f64bfe6…6059890f` — **identical** |
| `verifyManifest(1, that hash)` | **true** |

The bytes are the canonical manifest with nothing wrapped around them — no envelope, no
metadata, no trailing newline — so `keccak256` of the file exactly as downloaded *is* the
anchored value. That was a deliberate constraint: a verifier who has to unwrap something first
has to be told how, and then the format becomes part of the trust.

This is the single strongest artifact the project has. Until it landed, the anchor pointed at
bytes that existed only on one laptop, which proves nothing.

### Passport #1 is a smoke test, not a completed fine-tune

The token's base-model hash, dataset root hash, training-config hash, task ID and provider are
the real values from the 2026-08-14 run. Its **adapter hash is a deliberate sentinel** —
`keccak256("crucible:adapter-not-retrieved:<taskId>")` — because no adapter was ever retrieved.
`mint()` rejects a zero adapter hash, so the sentinel is the honest way to say "nothing here".
It is deliberately not a plausible-looking root hash: anyone who recomputes it gets the sentinel
and knows immediately that no adapter exists. Every document that mentions passport #1 says so.

## The fine-tuning run: what actually happened

The authenticated flow ran end to end up to delivery and then **failed at acknowledgement**. This
is not a guess — it is readable from the 0G `FineTuningServing` contract on testnet
(`0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA`) by anyone, with no credentials.

`getDeliverables(0xf4cEE5c1…, 0xA02b95Aa…)` returns exactly one deliverable:

| Field | Value | Meaning |
|---|---|---|
| `id` | `10551604-2664-4516-86cf-269a62f93bfc` | the task |
| `modelRootHash` | `0xbd1df54d06cf489dfae93b63f050780cae6b62087b1a8b79ed191f06296640a4` | the adapter **was** produced and registered |
| `encryptedSecret` | `0x` — **empty** | no decryption key was ever shared, so the adapter cannot be decrypted |
| `acknowledged` | **false** | the acknowledgement never happened |
| `settled` | **true** | the provider closed the task out anyway |
| `timestamp` | 1786706325 = 2026-08-14T11:18:45Z | delivery |

The settlement is a single event, `FeesSettled`, in tx
`0x45cd98ad74cab15f838c67d0bdcd81777892b341f1a048319545325e4d6e9d1f`, block 49419204,
**2026-08-14T17:19:17Z** — about six hours after delivery, well inside the 48-hour window:

```
FeesSettled(user, provider, "10551604-…", fee = 3555840000000000, acknowledged = false, nonce)
```

The contract itself records `acknowledged = false`. And the fee it charged is the tell:

```
sub-account funded   0.15        0G
sub-account now      0.14644416  0G
deducted             0.00355584  0G
full task fee        0.0118528   0G
30% of the task fee  0.00355584  0G   ← exact match
```

Only 30% was charged. That is 0G's documented penalty for a deliverable the user never
acknowledged — the provider is compensated for the compute, and the user loses the model. No
`DeliverableAcknowledged` event exists for this task.

**So the honest position: the run reached delivery, the adapter exists at root hash
`0xbd1df54d…`, and it is unrecoverable.** No adapter file exists anywhere in this repo. The
account also still carries one unacknowledged deliverable (`deliverablesCount` 1,
`deliverablesHead` 0), which is exactly the state that leads to Bug #4's locked queue.

### A second run is in flight — do not write it up yet

As of 2026-08-15 a second task exists on the same provider: `3e385c46-f5dc-4e93-b713-63ab7a987ae3`.
On-chain it reads `modelRootHash 0x40a5f256…`, `acknowledged: false`, **`settled: false`**, empty
`encryptedSecret`, and `runs/run2/adapter/` is empty. Unlike run 1 it has **not** been settled,
so its acknowledge window is still open and the outcome is genuinely undecided.

Nothing about run 2 may be claimed anywhere until it either produces an adapter on disk or is
settled. If it succeeds it is the honest end-to-end demo this project has not had; if it fails
the same way, that is a second data point for the same finding. Either way, wait for it.

### Why the acknowledgement failed

Two stacked failures, both recorded at the time:

1. `downloadMethod: 'auto'` tries 0G Storage first → **ENOENT** on the bundled
   `0g-storage-client` binary, which is a **Linux ELF** shipped to a Windows host.
2. The TEE fallback answered **HTTP 429 Too Many Requests**.

A retry loop with exponential backoff was run and did not recover it before the provider settled.

**This is the product's thesis happening to the project in real time.** The exact failure
Crucible's daemon exists to survive — a delivered model that cannot be retrieved on the first
attempt — occurred on the first real run, and it cost the model. A user following 0G's documented
flow by hand on Windows would have hit ENOENT, seen no retry, and lost the same way. The war
story is first-hand rather than quoted from an SDK comment.

The orchestrator's acknowledger is built against precisely this: act at +1h rather than at the
buzzer, retry with backoff, and fall back to `acknowledgeDeliverable` at +36h to save the queue
even at the cost of the artifact. It was not in the loop for this run.

### Two deadlines that are not the same thing

Do not conflate these; both are readable on-chain:

- **48 hours** — the acknowledge window after `Delivered`. Documented by 0G. Miss it and the
  model is lost and 30% of the fee is deducted. Not a contract constant.
- **`lockTime()` = 86400 (24h)** — the **refund** lock period, used by the SDK as
  `lockTime - (now - refund.createdAt)`. A different mechanism entirely.

`penaltyPercentage()` reads **30** on-chain, which is where the 30% figure comes from.

## Verified test totals — all re-run 2026-08-15

| Package | Tests | Files |
|---|---|---|
| `packages/core` | 105 | 6 |
| `packages/ml` | 320 | 15 |
| `services/orchestrator` | 155 | 11 |
| `apps/web` | 158 | 13 |
| `contracts` | 70 | — |
| **Total** | **808** | |

Datasets: **614 valid records across 6 files**; 11 invalid fixtures, all correctly rejected
(`node tools/verify-datasets.mjs`).

`apps/web` produces a clean `next build`: **7 routes, 88.8 kB shared JS** (`/`, `/_not-found`,
`/gallery`, `/jobs` static; `/jobs/[id]`, `/new`, `/passport/[id]` dynamic). Re-run 2026-08-15.
An earlier run this session failed type-checking at `src/lib/api.ts` on a `PassportSummary`
missing `provenance` and `adapterKind`; that is fixed.

## Two real bugs found by cross-checking components against each other

Neither was found by the tests of the component that had the bug. Both surfaced only because two
independently-built implementations disagreed on real data.

**1. CRLF blindness in `packages/core`** — `validateDataset` takes already-parsed records, so it
never sees bytes, and `JSON.parse` silently tolerates a trailing `\r`. A Windows-authored dataset
passed validation and would have reached 0G unflagged. Fixed with `validateDatasetFile`; core now
catches 11 of 11 invalid fixtures (was 10).

**2. System prompts manufacturing false leakage in `packages/ml`** — the leakage detector
compared the whole prompt side including the `system` turn. A constant system prompt is *correct*
dataset design (0G recommends one for classification), so it appears verbatim in every record and
dominates similarity whenever user content is short.

Measured on the project's own sentiment set: `"It arrived."` vs `"Arrived damaged."` — different
text, different labels — scored **0.8137** with the 84-char system prompt included and **0.1875**
on user content alone, against a 0.75 threshold. Every well-built system-prompted dataset would
have been reported contaminated. Fixed by excluding `system` turns from the leakage key while
keeping them in the exact-duplicate key. `sentiment` went from `severity: fail` to `warn`.

## Known limitations, recorded not fixed

- **PII phone detector matches dates.** All 45 findings across the demo datasets are false
  positives — `"2026-08-14"` matches a phone pattern, as do years in Dolly's Wikipedia contexts.
  Advisory-only (does not block), but noisy on any dataset containing dates.
- **`trainTestLeakage` throws on raw records.** It requires `normaliseRecords` first;
  `analyzeDataset` does this internally, but the exported function is a sharp edge.
- **`POST /jobs/:id/unlock` returns `txHash: null`** — the SDK's `acknowledgeDeliverable`
  resolves to `void` and surfaces no hash. Key kept for shape stability.
- **The web app defaults to mock mode.** With `NEXT_PUBLIC_CRUCIBLE_API_URL` unset it serves an
  in-memory fixture store; setting it switches to the live orchestrator. Useful for a demo with
  no backend, but it means "the app works" is not by itself evidence that the backend does.
- **No mint UI.** Passport #1 was minted by `contracts/scripts/mint-testnet-passport.js`. The web
  app reads mint state and renders it; it does not send a mint transaction.
- **Storage uploads live in scripts, not in the service path.** `tools/upload-manifest.mjs` and
  the dataset upload both use `@0gfoundation/0g-storage-ts-sdk` (now a root dependency) directly.
  The orchestrator's own code path still calls the compute SDK's `broker.uploadDataset()`, which
  is the path that is broken on Windows. Moving the orchestrator onto the storage SDK is the
  obvious follow-up.

## What the funding blocker turned out to be

There was never a funding blocker. It was an SDK bug, and it cost time because the cheapest check
was left until last.

```
LedgerManager.MIN_ACCOUNT_BALANCE()   testnet 0.1 0G   mainnet 3.0 0G
```

`broker.ledger.addLedger()` applies a hardcoded **3 0G** guard on *every* network, rejecting
client-side before any transaction is sent. On testnet the chain wants **0.1 0G** — a 30×
overstatement. The wallet already held 0.5 0G, five times what was actually required.

**True cost to start on testnet: ~0.15 0G, not 3.**

| Step | Result |
|---|---|
| Ledger created | 0.3 0G · tx [`0x36b4f848…7ec570`](https://chainscan-galileo.0g.ai/tx/0x36b4f848020c4e611c2f524e1adf8fb5214f77b892e89d86160d61ffea7ec570) · block 49369251 · gas 154,771 |
| Sub-account funded | 0.15 0G (`transferFund` → fine-tuning) |
| Dataset uploaded | root `0xa5051ae7…9e7dbfd` · tx `0xc38e4131…d7da52` |
| Task created | `10551604-2664-4516-86cf-269a62f93bfc` |
| Progressed | `Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered` |
| Acknowledged | **no** — settled unacknowledged, 30% penalty (above) |
| Charged | **0.00355584 0G** of a 0.0118528 0G fee |

On mainnet `MIN_ACCOUNT_BALANCE()` really is 3.0 0G — but **that figure gates running a
fine-tune, not deploying a contract**, and the two must not be conflated:

| Mainnet action | What it actually costs |
|---|---|
| Deploy `Passport.sol` + mint once | **~0.0103 0G** of gas at 4 gwei (deploy 0.008954, mint 0.001311) |
| Open a compute ledger to run a fine-tune | 3.0 0G, per `MIN_ACCOUNT_BALANCE()` |

The Wave 3 hard requirement is the first row. **The mainnet gap is a gas problem of about
0.02 0G, not a funding problem of any size.** Framing it as "needs 3 0G" overstates the blocker
by two orders of magnitude and has already cost this project time once.

### Estimate accuracy — worth correcting

The chars÷4 heuristic put the sentiment set at ~1,756 tokens; the broker's real count implies
about **772**. So the estimator runs roughly **2.3× high** on short chat records. It is
conservative (never under-quotes, so a user is never surprised by a bigger bill), but the UI must
label it "estimated" — `calculateToken()` remains authoritative. Note this run used
`max_steps: 10`, which caps work independently of dataset size, so this ratio is indicative
rather than a calibration constant.

## Accumulated Context

### Decisions made

| Decision | Rationale |
|---|---|
| Build Crucible, not the provider-SLA layer | 0G already ships an official Compute Router with failover and latency/price routing — that would be rebuilding their first-party product |
| Run the fine-tuning flow on **testnet**, deploy `Passport.sol` to **mainnet** | Testnet keeps real value out of the development loop; the Wave 3 requirement is specifically a mainnet contract address plus explorer activity. Supersedes the earlier mainnet-flow decision of 2026-08-14 |
| Use `@0gfoundation/*` SDKs (0.9.0 / 1.2.11) | Current packages; the official example still pins the older `@0glabs/*`. All ISC |
| Solidity 0.8.19 + `evmVersion: paris`, pinned | 0G's docs ask for 0.8.19 *and* cancun; those are mutually exclusive — solc only added the cancun target in 0.8.24. Paris is the highest 0.8.19 can emit and runs identically on a cancun-era chain |
| Read, don't copy, the 0G example repos | `agenticID-examples` and `0g-deployment-scripts` ship **no LICENSE file**; only `fine-tuning-example` declares MIT. Reimplementing also protects the originality score |
| Claim lineage, not honest training | Prior art (vouch, OpenSSF, Cisco, the VFT paper) is real and citable; overclaiming would be caught by technical judges |
| Plan / roadmap / state kept in `.paul/` | Lightweight project-tracking convention, MIT. Keeps the phase plan and the running state in the repo where a reader can check them against the code |

### Verified facts (2026-08-14, live network)

- Mainnet fine-tuning provider `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d` — available, H200, Intel TDX via Phala dstack, 500 neuron/token
- Testnet provider `0xA02b95Aa6886b1116C4f334eDe00381511E31A09` — available, 800 neuron/token
- Mainnet models: `Qwen2.5-0.5B-Instruct`, `Qwen3-32B`. Testnet: 0.5B only
- Inference providers: 21 mainnet, 2 testnet
- `createZGComputeNetworkReadOnlyBroker(rpcUrl)` needs **no wallet** — enables credential-free development
- Demo fine-tune cost ≈ **0.025 0G** (10k tokens, 3 epochs, 0.5B)

Full detail: [docs/FIELD_NOTES.md](../docs/FIELD_NOTES.md)

### Corrections to official docs (worth publishing)

1. `fine-tuning-example/.env.example` claims *"Mainnet — fine-tuning not yet available."* **False.** It is live.
2. Builder Hub recommends `@0gfoundation/*`; the official example pins `@0glabs/*`. Both exist.
3. Docs config template uses `max_steps: 3`; the shipped working config uses `max_steps: 45`.

### Known footguns being designed against

| Footgun | Consequence |
|---|---|
| **Bug #4** (May 2026 hackathon report) — legacy download path without acknowledge | Deliverable queue **permanently locked**; escape hatch is `acknowledgeDeliverable` |
| 48-hour acknowledge deadline | Model lost + 30% fee deducted. No warning exists. **Hit on the first real run** |
| Bundled `0g-storage-client` is a Linux ELF | `uploadDataset` / `downloadModel` fail with ENOENT on Windows. **Hit on the first real run** |
| `transfer-fund` without `--service fine-tuning` | Funds land in the inference sub-account; fails later as `MinimumDepositRequired` |
| Duplicate dataset upload | Reverts with `CALL_EXCEPTION` — expected; reuse the existing root hash |
| Decrypt before status `Finished` | `second arg must be public key`; provider needs ~1 min to settle |

### Open questions

1. Is `occupied` global or per-user? (one provider per network — matters a lot if global)
2. What does `calculateToken`'s `usePython` flag require locally?
3. `verifyService` output shape — needed to design the passport's attestation section
4. Real wall-clock training time for 30 examples on an H200 — decides whether the demo films live or pre-baked
5. Can a settled-but-unacknowledged deliverable still be cleared with `acknowledgeDeliverable`, or is the queue now stuck? One unacknowledged deliverable is outstanding

## Next Actions

1. **Put ~0.02 0G of gas on the mainnet wallet.** Owner action, and the gate on everything below. This is a small top-up, not a 3 0G funding round.
2. **Deploy + source-verify `Passport.sol` on mainnet 16661**, then mint at least once. Hard Wave 3 requirement. Verification should be routine now that the `/open/api` path is configured.
3. Let run 2 (`3e385c46-…`) resolve, then record what actually happened. Do not pre-write either outcome.
4. Create the AKINDO product and register it into the 3rd Wave — GitHub is connected now, so this is unblocked. Owner action.
5. Fix the README status row that claims a completed end-to-end fine-tune; the chain contradicts it.
6. Host the web app, then demo video, X post, and submit.

---
*State initialised: 2026-08-14 · Last verified against the live chain: 2026-08-15*
