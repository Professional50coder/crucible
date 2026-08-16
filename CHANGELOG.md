# Changelog

Every version records two things: what was added, and **what we believed that turned out to be
wrong**. The second list is the more useful one. A repository whose claims only ever grow is a
repository nobody has checked.

Rule: a finding enters the README only once it has been executed against the live network or
confirmed against a primary source, and it leaves the README the moment it is disproved —
deleted, not softened. Every correction below is dated and says what replaced it.

---

## 0.4.0 — 2026-08-16

### The daemon did the thing it claims

- **First acknowledgement performed by the orchestrator itself.** Runs 1 and 2 were driven by
  scripts; the daemon at the centre of this project's pitch had never once acknowledged a real 0G
  deliverable. Task `b1807e85-a942-46f5-9d04-ec23fdff020a` was submitted through `POST /jobs`,
  tracked by the poller, and acknowledged by the acknowledger — delivered 08:53:57Z, acknowledged
  09:56:05Z at the real +1h default with 47 hours of margin, 93,642,471 bytes pulled from 0G
  Storage, tx
  [`0x4e2c81e2…7e4cfa`](https://chainscan-galileo.0g.ai/tx/0x4e2c81e237efc53623d869d361f212bf649ff132dc6274fbb18dc0d80c7e4cfa),
  block 49716408. `getDeliverables` reads `acknowledged: true`. Run on the daemon's own default
  `downloadMethod: 'auto'` — the path that fails on Windows — because forcing the TEE path would
  have proven less. Recorded in `runs/run3-daemon.json` with four explicit non-claims.
- **`verifyService()` called for the first time, and it passes** — the TEE signer in the provider's
  attestation report matches the address registered on-chain, and the compose hash matches its own
  event log. **It is not full verification.** The SDK names three steps and points at an external
  `dstack-verifier`; the Intel TDX quote is still cryptographically unvalidated on our end.
  `attestationVerified` therefore stays `false` — it is now a decision about what the field should
  assert, not a blocker. The 55 KB report is committed so anyone can run the real verifier on it.

### ERC-8004, resolved by `eth_call` rather than by reading

- 0G's docs say Agentic IDs are "compatible with ERC-8004, the Trustless Agent standard that 0G
  officially supports" but name no addresses. The **Identity and Reputation registries are live on
  both 0G networks** — mainnet identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` answers
  `name()` with `AgentIdentity`.
- **There is no Validation Registry**, on 0G or anywhere — the ERC-8004 contracts repo says that
  portion is still under discussion with the TEE community. A Model Passport is structurally a
  validation attestation, so the registry that fits does not exist and the two that do fit worst.
  `docs/ERC8004.md` recommends documentation-only alignment over deploying a non-canonical
  singleton.

### Added

- **A dataset converter** (`packages/core/src/convert.ts`) — the capability five documents already
  claimed and no code provided. Refuses to convert rather than lose a field; `instruction` and
  `chat` round-trip byte-exactly.
- **A CLI that reaches the library** — `validate`, `convert`, `config` on top of core's rules, and
  62 tests where there were none.
- **A self-verifying export** — the passport certificate exports as SVG with the canonical manifest
  embedded, so a downloaded file can be keccak256'd against the chain without trusting the page it
  came from. Mechanism from Excalidraw (MIT), cited.
- **An Open Graph card per passport**, keyed off the manifest hash, honest at thumbnail size.
- **A Hugging Face model card emitter** carrying the unverified attestation, the sentinel adapter,
  and "proves lineage, not honest training" onto the card rather than omitting them.
- **One generic mint script**, dry-run by default, reproducing both existing passports' hashes
  byte-identically from their recorded inputs.
- **State history and `ackDeadlineMissed` on the wire**, and the queue-recovery API finally routed
  for accounts that have no local job — which is exactly the account that arrives stranded.
- `tools/identify-dataset.mjs`, `tools/deliverable-status.mjs`, `tools/verify-attestation.mjs`,
  `tools/run3-daemon.sh`.

### ✗ Corrected — things we said that were wrong

| We said | Actually | How we know |
|---|---|---|
| `databricks-dolly-15k` is **Apache 2.0**, in seven places | **CC BY-SA 3.0.** Share-alike is an obligation: the derived slice inherits it and cannot sit under this repo's MIT licence. It now carries its own `LICENSE` | the dataset card's front matter, `license: cc-by-sa-3.0` |
| Two 0G example repos are reusable — `PRIOR_ART` planned to "lift patterns" and "use directly" | **Both unlicensed.** No `LICENSE`, no `license` field. Default copyright: readable, not reusable | GitHub API: `"license": null`, 404 on `/license` |
| A duplicate 0G Storage upload reverts with `CALL_EXCEPTION` — taught in four places including a public training dataset | **It does not revert.** A second submission of the same root was accepted and charged again. The error is inverted — trusting the docs means paying twice, silently | submissions 146937 and 146938, identical root |
| The minimum Compute deposit is 3 OG — taught in our own public dataset | **Client-side SDK guard.** `MIN_ACCOUNT_BALANCE()` reads 0.1 0G on testnet; our ledger was created with 0.3 | one `eth_call` |
| LoRA adapter size "~100 MB" | **93,642,469 bytes, measured** | the retrieved artifact |
| "ERC-7857 Agentic ID" unqualified, in eleven places | **ERC-7857-*style***, per the correction already made in 0.3.0 and then not applied | the contract |
| The queue bug "permanently locks a user out of the network", in seven files | It strands **that user's deliverable queue with that provider**. Several of those files offered the escape hatch two lines later | the SDK's own source |
| `ARCHITECTURE.md`'s sample manifest showed `network: mainnet` and `attestationVerified: true` | Nothing is on mainnet, and no real run can produce `true` | the code |
| `@crucible/core` "converts" datasets, claimed in five places | It did not. **So it was built**, rather than deleting a fifth capability claim | `packages/core/src/convert.ts` |
| `transfer-fund` "**silently**" routes to the inference sub-account | The routing is 0G's documented behaviour; the silence was our embellishment. We funded by hand and never tripped it | our own run log |

### Newly resolvable

- **The anchored dataset root now maps to a file.** Both passports carry
  `datasetRootHash: 0xa5051ae7…`, which no document could turn back into anything openable.
  `tools/identify-dataset.mjs` recomputes merkle roots across `datasets/` and matches it:
  `datasets/sentiment/train.jsonl`, 11,695 bytes, chat format, 61 examples.
- **The Dolly slice reproduces bit-for-bit.** Rebuilt from a freshly downloaded source whose sha256
  still matches the value recorded on 2026-08-14; the only byte that changed anywhere was the
  licence string.

### Still open

- **Mainnet.** Nothing deployed; the wallet holds 0 and nonce 0. Still the one hard Wave 3
  requirement, still ~0.0103 0G of gas.
- AKINDO product not registered — the team page exists with GitHub connected, but no product.
- Demo video and X post.

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
