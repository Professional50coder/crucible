---
description: "Crucible — current position and accumulated context"
type: ProjectState
about: "crucible"
---

# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-08-14)

**Core value:** Anyone who fine-tunes on 0G gets a working adapter and a verifiable public
record of how it was made — without touching a CLI or losing their model to a 48-hour deadline.
**Current focus:** v1.0 Wave 3 Submission → Phase 1, Spike & Foundation

## Current Position

Milestone: v1.0 Wave 3 Submission
Phase: 2 of 6 (crucible-core) — Phase 1 build work done, 01-03 gated on funding
Plan: 3 of 4 in current phase
Status: **Blocked on funding** — everything buildable without tokens is built
Last activity: 2026-08-14 — `crucible doctor` running live against testnet; 32 tests green

Progress:
- Milestone: [███░░░░░░░] 30%
- Phase: [███████░░░] 75%

**Target network switched to testnet** (user decision, 2026-08-14). Testnet is 60% more
expensive per token (800 vs 500 neuron) but that is irrelevant at these amounts, and it
removes real-value risk from development. Mainnet remains the target for the `Passport.sol`
deployment, which is what the Wave 3 requirement actually asks for.

**Dev wallet:** `0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF` — throwaway, generated locally,
testnet only, key in gitignored `.env`. Never to hold real value.

## Verified test totals (all re-run by the coordinator, not self-reported)

| Package | Tests |
|---|---|
| `packages/core` | 105 |
| `contracts` | 70 |
| `services/orchestrator` | 123 |
| `packages/ml` | 320 |
| `apps/web` | 155 |
| **Total** | **773** |

`apps/web` also produces a clean `next build` — 7 routes, 88.8 kB shared JS.
Datasets: 614 records across 6 files, all valid; 11 invalid fixtures, all correctly rejected.

## Two real bugs found by cross-checking components against each other

Neither was found by the tests of the component that had the bug. Both surfaced only
because two independently-built implementations disagreed on real data.

**1. CRLF blindness in `packages/core`** — `validateDataset` takes already-parsed
records, so it never sees bytes, and `JSON.parse` silently tolerates a trailing `\r`.
A Windows-authored dataset passed validation and would have reached 0G unflagged.
Fixed with `validateDatasetFile`; core now catches 11 of 11 invalid fixtures (was 10).

**2. System prompts manufacturing false leakage in `packages/ml`** — the leakage
detector compared the whole prompt side including the `system` turn. A constant system
prompt is *correct* dataset design (0G recommends one for classification), so it appears
verbatim in every record and dominates similarity whenever user content is short.

Measured on our own sentiment set: `"It arrived."` vs `"Arrived damaged."` — different
text, different labels — scored **0.8137** with the 84-char system prompt included and
**0.1875** on user content alone, against a 0.75 threshold. Every well-built
system-prompted dataset would have been reported contaminated. Fixed by excluding
`system` turns from the leakage key while keeping them in the exact-duplicate key.
`sentiment` went from `severity: fail` to `warn`.

## Known limitations, recorded not fixed

- **PII phone detector matches dates.** All 45 findings across our datasets are false
  positives — `"2026-08-14"` matches a phone pattern, as do years in Dolly's Wikipedia
  contexts. Advisory-only (does not block), but noisy on any dataset containing dates.
- **`trainTestLeakage` throws on raw records.** It requires `normaliseRecords` first;
  `analyzeDataset` does this internally, but the exported function is a sharp edge.
- **`POST /jobs/:id/unlock` returns `txHash: null`** — the SDK's `acknowledgeDeliverable`
  resolves to `void` and surfaces no hash. Key kept for shape stability.

## Shipped this session

| Module | Tests | What it does |
|---|---|---|
| `training-config` | 11 | Catches all five 0G config-rejection rules locally, before funds move |
| `dataset` | 13 | Format detection, mixed-format detection with line numbers, JSONL emission, error capping |
| `fee` | 8 | Fee estimation from live on-chain price — **reproduces 0G's documented worked example exactly** |
| `networks` | — | Verified endpoint/model/provider config for both networks |
| `@crucible/cli doctor` | — | Live preflight: providers, availability, hardware, TEE status, cost, wallet readiness |

`crucible doctor` needs no wallet for the provider half — `createZGComputeNetworkReadOnlyBroker`
makes discovery credential-free. That is what let the whole spike land without a funded key.

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◉        ○     [Applying]
```

## Accumulated Context

### Decisions made

| Decision | Rationale |
|---|---|
| Build Crucible, not the provider-SLA layer | 0G already ships an official Compute Router with failover and latency/price routing — we'd be rebuilding their first-party product |
| Run the real flow on **mainnet**, not testnet | Verified: mainnet fine-tuning is live, unoccupied, and 37.5% cheaper (500 vs 800 neuron/token). Also satisfies Wave 3's mainnet requirement with genuine activity |
| Use `@0gfoundation/*` SDKs (0.9.0 / 1.2.11) | Current packages; the official example still pins the older `@0glabs/*`. All ISC |
| Solidity 0.8.19 + `evmVersion: paris`, pinned | 0G's docs ask for 0.8.19 *and* cancun; those are mutually exclusive — solc only added the cancun target in 0.8.24. Paris is the highest 0.8.19 can emit and runs identically on a cancun-era chain |
| Read, don't copy, the 0G example repos | `agenticID-examples` and `0g-deployment-scripts` ship **no LICENSE file**; only `fine-tuning-example` declares MIT. Reimplementing also protects the originality score |
| Claim lineage, not honest training | Prior art (vouch, OpenSSF, Cisco, VFT paper) is real and citable; overclaiming would be caught by technical judges |
| Plan / roadmap / state kept in `.paul/` | Lightweight project-tracking convention, MIT. Keeps the phase plan and the running state in the repo where a reader can check them against the code |

### Verified facts (2026-08-14, live network)

- Mainnet fine-tuning provider `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d` — **available**, H200, Intel TDX via Phala dstack, 500 neuron/token
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
| 48-hour acknowledge deadline | Model lost + 30% fee deducted. No warning exists |
| `transfer-fund` without `--service fine-tuning` | Funds land in the inference sub-account; fails later as `MinimumDepositRequired` |
| Duplicate dataset upload | Reverts with `CALL_EXCEPTION` — expected; reuse the existing root hash |
| Decrypt before status `Finished` | `second arg must be public key`; provider needs ~1 min to settle |

## ✅ BLOCKER RESOLVED — Phase 1 plan 01-03 is DONE

**There was never a funding blocker. It was an SDK bug, and I misdiagnosed it.**

Option 4 on the old list — "verify whether the 3 0G minimum is real or just the docs' example
figure" — was the correct move, and it was listed last. It should have been first. Doing it
took one contract call:

```
LedgerManager.MIN_ACCOUNT_BALANCE()   testnet 0.1 0G   mainnet 3.0 0G
```

`broker.ledger.addLedger()` applies a hardcoded **3 0G** guard on *every* network, rejecting
client-side before any transaction is sent. On testnet the chain wants **0.1 0G** — a 30×
overstatement. The wallet already held 0.5 0G, five times what was actually required.

### The run that happened

| Step | Result |
|---|---|
| Ledger created | 0.3 0G · tx [`0x36b4f848…7ec570`](https://chainscan-galileo.0g.ai/tx/0x36b4f848020c4e611c2f524e1adf8fb5214f77b892e89d86160d61ffea7ec570) · block 49369251 · gas 154,771 |
| Sub-account funded | 0.15 0G (`transferFund` → fine-tuning) |
| Dataset uploaded | root `0xa5051ae7…9e7dbfd` · tx `0xc38e4131…d7da52` |
| Task created | `10551604-2664-4516-86cf-269a62f93bfc` |
| Progressed | `Init → SettingUp → SetUp → Training → Trained → Delivering → Delivered` |
| **Actual fee** | **0.0118528 0G** |

**True cost to start on testnet: ~0.15 0G, not 3.**

### Estimate accuracy — worth correcting

Our chars÷4 heuristic put the sentiment set at ~1,756 tokens; the broker's real count implies
about **772**. So the estimator runs roughly **2.3× high** on short chat records. It is
conservative (never under-quotes, so a user is never surprised by a bigger bill), but the UI
must label it "estimated" — `calculateToken()` remains authoritative. Note this run used
`max_steps: 10`, which caps work independently of dataset size, so this ratio is indicative
rather than a calibration constant.

## Live blocker: acknowledgement is failing on Windows

The task reached `Delivered` at 11:18:56 UTC on 2026-08-14, **starting the 48-hour clock**.
`acknowledgeModel` has failed on every attempt so far, for two stacked reasons:

1. `downloadMethod: 'auto'` tries 0G Storage first → **ENOENT** on the bundled `0g-storage-client`
   binary, which is a **Linux ELF** shipped to Windows.
2. Falls back to the TEE → **HTTP 429 Too Many Requests**.

A retry loop with exponential backoff (30s → 15min, ~64 min total budget) is running. Deadline
is 2026-08-16 11:18:56 UTC, so there is very large margin.

**This is the product's thesis happening to us in real time.** The exact failure Crucible's
daemon exists to survive — a delivered model that cannot be retrieved on the first attempt —
occurred on our first real run. A user following 0G's documented flow by hand, on Windows,
would have hit ENOENT, seen no retry, and had 48 hours to notice before losing the model and
30% of the fee. The war story is now first-hand rather than quoted from an SDK comment.

If retries are exhausted, the escape hatch is `acknowledgeDeliverable(provider, taskId)` —
acknowledges on-chain without retrieving the artifact, saving the queue at the cost of the
model. That is precisely the Bug #4 trade-off the orchestrator implements.

Open questions that only an authenticated run can answer:
1. Is `occupied` global or per-user? (one provider per network — matters a lot if global)
2. What does `calculateToken`'s `usePython` flag require locally?
3. `verifyService` output shape — needed to design the passport's attestation section
4. Real wall-clock training time for 30 examples on an H200 — decides whether the demo films live or pre-baked

## Next Actions

1. Continue Phase 2 (`crucible-core`) — dataset conversion, fee estimation, provider discovery. Not blocked.
2. User runs the Phase 1 spike with a funded wallet.
3. On spike success → Phase 3 contract work. On failure → pivot to inference provenance by end of day 2.

---
*State initialised: 2026-08-14*
