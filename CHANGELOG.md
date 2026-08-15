# Changelog

Every version records two things: what was added, and **what we believed that turned out to be
wrong**. The second list is the more useful one. A repository whose claims only ever grow is a
repository nobody has checked.

Rule: a finding enters the README only once it has been executed against the live network or
confirmed against a primary source, and it leaves the README the moment it is disproved —
deleted, not softened. Every correction below is dated and says what replaced it.

---

## 0.3.0 — 2026-08-15

### On-chain

- `Passport.sol` **deployed** to 0G Galileo testnet at
  [`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7)
  — block 49596815, gas 2,238,586.
- **Source-verified** on the explorer: `v0.8.19+commit.7dd6d404`, evmVersion `paris`, optimizer
  200 runs, 78,649 characters of source published.
- **Passport #1 minted** — block 49597171, gas 327,702. `verifyManifest` returns `true` for the
  anchored hash and `false` for a tampered one, on a public chain.
- **Second fine-tuning task created** — `3e385c46-f5dc-4e93-b713-63ab7a987ae3`, taking the TEE
  download path so the adapter is actually retrieved this time.

### Added

- Three diagrams — architecture, task lifecycle, verification — generated from one script so they
  share a design system (`docs/diagrams/`).
- `docs/CLAIMS_AUDIT.md` — every externally-checkable claim, with its primary source.
- `submission/AKINDO_FORM_SPEC.md` — every AKINDO form field as a parameter with an acceptance
  test, so the project is judged against the real requirements rather than our impression of them.
- `TODO.md` — live plan ordered by what unblocks the most.
- `tools/task-status.mjs`, `tools/preflight-run2.mjs`, `tools/run2-create.mjs`,
  `tools/run2-watch.mjs` — read-only diagnostics and the run harness.
- MIT `LICENSE`, root `.env.example`, and a brand mark.

### ✗ Corrected — things we said that were wrong

| We said | Actually | How we know |
|---|---|---|
| "The first fine-tune is **blocked**; acknowledgement is failing and a retry loop is running" | The task reads **`Finished`**. It settled 2026-08-14T17:19Z, ~6h after delivery — inside the 48-hour window. Zero pending deliverables; the queue was never locked. **The first end-to-end run completed.** | Re-queried `broker.fineTuning.getTask()` and `getAccountWithDetail()` against the live network |
| "Solidity 0.8.19 with `evmVersion: cancun`" — in five documents, repeating 0G's own docs | 0.8.19 **cannot emit cancun**; that target arrived in 0.8.24 and 0.8.19 rejects it outright. The build has always been `paris`, and `paris` verified on the explorer on the first submission | Compiler probe recorded in `contracts/hardhat.config.js`; explorer reports `EVMVersion: paris` |
| "`hardhat verify` fails because the 0G explorer is Blockscout" | It is a **Conflux-Scan** derivative, and its Etherscan-compatible API is at **`/open/api`**, not `/api`. The old path returned the explorer's HTML shell, which is why the error was a JSON parse failure | `GET /api` → `text/html`; `GET /open/api` → `application/json` |
| "Minted as an **ERC-7857 Agentic ID**" | **ERC-7857-*style***. The standard's core interface is `transfer()` with oracle re-encryption, `clone()`, and `authorizeUsage()`; `Passport.sol` implements only the third. A passport is public by design, so there is no encrypted payload to re-encrypt | 0G's Builder Hub and ERC-7857 docs, read directly |
| README quickstart: `npm start -w @crucible/orchestrator` | Fails with *No workspaces found* — root workspaces cover only `packages/core` and `packages/cli`. Every other package keeps its own lockfile deliberately | Ran it |
| Test totals of 773 | **808** — the orchestrator and web suites had grown since the number was written | Re-ran every suite |

### Newly sourced, no longer merely asserted

- The **48-hour acknowledge deadline**, the provider's force settlement, and the **30% fee
  deduction** are stated verbatim in 0G's own documentation. Previously this repo asserted them
  without a citation.
- ⚠️ **`getLockedTime()` returns 86400 — 24 hours, not 48.** It is the *refund* lock period, used
  as `lockTime - (now - refund.createdAt)`. Anyone reading it as the acknowledgement window builds
  a daemon that fires at the wrong time. Two clocks, one confusable name.
- Prior art dates confirmed: vouch-protocol's Birth Certificate Protocol (PAD-018, 2026-02-14),
  Cisco's Model Provenance Kit (2026-04-30), OpenSSF Model Signing v1.0.
- arXiv 2510.16830 confirmed to restrict its update circuits to parameter-efficient fine-tuning
  and to enforce AdamW-style optimizer semantics — the precise reason we claim lineage and not
  honest training.

### Still open

- **Mainnet.** Nothing deployed; wallet balance 0, nonce 0. The one hard Wave 3 requirement.
- GitHub not connected on the AKINDO profile, so no product can be registered yet.
- Demo video, X post, and the "Updates in this Wave" changelog.

---

## 0.2.0 — 2026-08-14

- `@crucible/core`, `packages/ml`, `services/orchestrator`, `apps/web` and `contracts` built and
  tested. 808 tests at the close of the day.
- First authenticated run on 0G testnet: ledger created, sub-account funded, dataset uploaded to
  0G Storage (`0xa5051ae7…9e7dbfd`), fine-tuning task created and delivered. Real cost 0.0118528 0G.
- **✗ Corrected:** "creating a ledger requires 3 0G" — the SDK applies a hardcoded 3 0G guard
  client-side on every network, but `LedgerManager.MIN_ACCOUNT_BALANCE()` reads **0.1 0G** on
  testnet. A 30× overstatement that cost a day to a supposed funding blocker that did not exist.
- **✗ Corrected:** the fee estimator runs ~2.3× high on short chat records. Conservative, never
  under-quoting, but the UI must label it an estimate — `calculateToken()` is authoritative.
- Two bugs found by cross-checking components against each other: CRLF blindness in dataset
  validation, and system prompts manufacturing false train/test leakage.

## 0.1.0 — 2026-08-14

- Repository scaffolded. Read-only network probe against both networks with no wallet, via
  `createZGComputeNetworkReadOnlyBroker`.
- `docs/FIELD_NOTES.md` opened with three corrections to 0G's own documentation.
