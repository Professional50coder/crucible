# Changelog

Every version records two things: what was added, and **what we believed that turned out to be
wrong**. The second list is the more useful one. A repository whose claims only ever grow is a
repository nobody has checked.

Rule: a finding enters the README only once it has been executed against the live network or
confirmed against a primary source, and it leaves the README the moment it is disproved —
deleted, not softened. Every correction below is dated and says what replaced it.

---

## 0.5.0 — 2026-09-18

Wave 4. Three tracks landed on `wave4-improvements` and were re-run against the live network this
session: the Windows retrieval defect is now fixed rather than only diagnosed, the passport lineage
is registered in 0G's live ERC-8004 Identity Registry on testnet, and the web app gained a 3D layer
that does not touch the on-chain values it renders. The fix has since been exercised end to end: a
fresh fine-tune was retrieved, acknowledged and minted on native Windows as **Passport #3** — the
first fully honest passport, carrying a real on-chain-verified adapter root — and `verifyService`
now passes, so its `attestationVerified` flag is earned rather than reported false. Mainnet is still
not deployed.

### DEFECT-01 is fixed, not just diagnosed — this answers the judge

- **`HttpModelRetriever` retrieves the delivered model on Windows without the SDK.** It downloads
  the artifact straight from the 0G Storage indexer over plain HTTP (`GET {indexer}/file?root=<modelRootHash>`)
  — no bundled Linux `0g-storage-client` binary — then re-derives the 0G Storage Merkle root of the
  bytes (`services/orchestrator/src/storage-hash.ts`, a dependency-free SDK-exact reimplementation
  pinned by known-answer tests generated from `@0gfoundation/0g-storage-ts-sdk` v1.2.11 across 11
  sizes) and **refuses to acknowledge unless it matches the on-chain `modelRootHash`.**
  `preferHttpRetrieval()` selects this path on win32; the SDK path is retained on other platforms.
- **Verified on this Windows machine (win32), 2026-09-18.** Downloaded the 584-byte Passport #1
  manifest from `https://indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e6…e1140` and
  recomputed `zgStorageRoot = 0xc757a7e6…e1140` — an exact match. The operation that used to ENOENT
  on Windows now completes and validates. This was, at the time, a Windows-verified retrieval +
  integrity check rather than a fine-tune; a full fresh fine-tune on Windows followed — see
  **Passport #3** below.
- **Adapter-hash provenance in `packages/core`.** `type AdapterHashSource = 'sentinel' | 'onchain-verified'`,
  an optional `adapter.hashSource` manifest field (optional so legacy manifests hash identically),
  and `assertAdapterProvenance()` / `isVerifiedAdapterRoot()` guards, so a sentinel can never be
  published as a real adapter root.
- **Failed runs are recoverable in place.** `QueueRecovery.retrieveAndUpgrade()` and the route
  `POST /jobs/:id/retrieve` upgrade a failed run from sentinel to onchain-verified once the artifact
  is retrieved and validated, with no duplicate passport.
- This directly answers judge notmartin's Wave 3 feedback — *"Fix the path that anchored a sentinel
  hash, and make failed training or acknowledgement attempts recoverable without confusing a
  placeholder with a real adapter root."* Commit `5e089f4`. Tests: `packages/core` 160→172,
  `services/orchestrator` 200→239, both green this session.

### Passport #3 — the first fully honest passport, forged end to end on native Windows

This is the fix exercised, not just described: the exact operation that ENOENTed and lost run 1's
model — retrieve a delivered ~93 MB adapter on native win32 and acknowledge it — was completed, and
it produced a passport that carries a real, on-chain-verified adapter **and** an earned attestation.

- **A complete fine-tune, retrieved → acknowledged → minted on win32.** Task
  `d06d00e2-965b-430c-bf46-4d6444ee1c47` ran `Init → … → Delivered → UserAcknowledged`; its
  93,642,471-byte adapter was pulled from 0G Storage on this Windows host through `HttpModelRetriever`
  and its 0G Storage Merkle root re-derived to the on-chain model root
  `0x113b79c3b6c6a0bfa418e044770171b02b475e185fbbdf0ddc932ec6348a396c`
  (`adapter.hashSource: onchain-verified`) **before** acknowledgement, then minted as **Passport #3**
  (token 3). `ownerOf(3)` = the dev wallet `0xf4cEE5c1…FD3EF`. acknowledge tx
  [`0xaf0a48b0…01290b1`](https://chainscan-galileo.0g.ai/tx/0xaf0a48b0d538f26f9b5d482ca435593c51005b6fcb0f64d58dc95005d01290b1)
  block 55,456,191; mint tx
  [`0x1dde66f4…66fff3`](https://chainscan-galileo.0g.ai/tx/0x1dde66f40f24bbd353160e6995764ba208096e74ce39a3563c3726e13066fff3)
  block 55,457,526.
- **A stranger can verify it end to end.** The manifest is on 0G Storage at root `0xdfaa9b83…b216a7`
  (upload tx `0x990ea1f4…3cc015`); its keccak256 is the anchored hash `0x2e38e49c…85ef13`, and
  `verifyManifest(3, 0x2e38e49c…)` returns **true** on-chain. Dataset root `0xa5051ae7…9e7dbfd`
  (the sentiment set, 61 chat examples), reused at its existing root — no upload. Settled task fee
  **0.0118528 0G**, charged to the compute sub-account; the wallet paid only **~0.00265 0G** of gas
  for acknowledge + mint + manifest upload.
- **`verifyService` passes, so `attestationVerified` is earned — for Passport #3.** `runs/attestation-testnet.json`
  records `success: true`: the TEE signer in the provider's attestation report (`0x24135b4B…5583A`)
  matches the address registered on-chain for that provider, and the compose hash matches its own
  event log. Passport #3 is the first Crucible passport minted with `tee.attestationVerified: true`,
  and the flag stands for exactly those two checks. Passports #1 and #2 keep `false` in their
  immutable manifests and are not restated.
- **The 93 MB download dropped once and resumed — a follow-up is flagged.** The first attempt died
  mid-stream at 61,351,230 bytes (schannel "server closed abruptly"); a resumed retry completed the
  full 93,642,471 bytes. Run 4 got resume from a curl `fetchImpl` passed into the retriever (transport
  hardening only; the validation is unchanged). **Known follow-up:** the in-code retriever's own
  transport (`services/orchestrator/src/retrieval.ts`) should gain streaming + resume for artifacts
  over ~60 MB — it does not have it yet.
- Three honest passports now stand apart: #1 a labelled sentinel adapter (unrecoverable), #2 a real
  adapter retrieved from Linux (attestation `false`), **#3 a real adapter retrieved on Windows with
  an earned attestation.** Recorded in `runs/run4-e2e.json` and `runs/run4/mint.json`.

### ERC-8004 option (b) executed on Galileo testnet — registered, not verified

- The optional experiment §4(b) in `docs/ERC8004.md` was run. Passport #1's model manifest is now
  registered in the **live 0G Identity Registry** (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) on
  Galileo testnet (chain 16602) as **agentId 420**, plus six `setMetadata` lineage writes, all read
  back byte-equal on chain. `ownerOf(420)` = the dev wallet `0xf4cEE5c1…FD3EF`. `register` tx
  [`0x2a2e86d0…d2c85a`](https://chainscan-galileo.0g.ai/tx/0x2a2e86d027c6865b3be8826142179e97354249bab931c31494062b5352d2c85a),
  block 55,445,626. Commit `55d1f32`. Full detail in `docs/ERC8004.md` §7; the machine-readable
  record is `runs/erc8004-galileo.json`.
- **Described as "registered", not "verified", on purpose.** It registers a model artifact *as* an
  agent (a category claim); the registry is an upgradeable proxy whose admin is unidentified; and
  Crucible is a *user* of the registries, not an implementation — so there is no claim of "ERC-8004
  compliance". The Validation Registry that actually fits a passport is still not deployed on any
  chain. No mainnet write was attempted.

### Frontend 3D overhaul — without touching what the passport asserts

- **react-three-fiber, inside the existing monochrome design system.** A wireframe "forged core" 3D
  hero on the landing page and a small 3D seal on the passport certificate, both lazy client-only
  (`next/dynamic` `ssr: false`) so the passport still server-renders its real on-chain values, with
  a static SVG fallback under no-WebGL and `prefers-reduced-motion`. Deps: `three@0.170.0`,
  `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`. Commit `a709f33`. `apps/web` tests
  342→349, `next build` green (7 routes) — verified this session.

### ✗ Corrected — things we said that were wrong

| We said | Actually | How we know |
|---|---|---|
| `AGENTIC_ID_ALIGNMENT.md` attributed manifest hash `0x0f46406e…` to Passport #1 | **`0x0f46406e…` is token #2's value.** Passport #1's manifest hash is `0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f` — the value anchored on `Passport.sol` for token #1 and read back off the ERC-8004 registry for agentId 420 | `verifyManifest(1, 0x4f64bfe6…)` = true; the alignment doc corrected by the ERC-8004 track |
| DEFECT-01 was "a Windows user hits both and has no path left" | The SDK's paths are still broken, but **Crucible no longer depends on them on Windows** — `HttpModelRetriever` retrieves over HTTP and validates the 0G Storage root. Present-tense "no path left" is superseded; the historical loss stands | win32 run 2026-09-18, root recomputed to an exact match |
| `attestationVerified` is "still honestly `false` — the field is not yet earned … unchanged this wave" | **Earned on Passport #3.** `verifyService` passes on the provider (signer + compose hash both match, `runs/attestation-testnet.json`), so #3 was minted with `tee.attestationVerified: true`; the flag names exactly those two checks. #1 and #2 keep `false` in their immutable manifests | the mint manifest `runs/run4/mint.json` (`attestationVerified: true`) and the passing `verifyService` report |
| "No completed end-to-end fine-tune on Windows" | **Done — Passport #3.** A fresh fine-tune was retrieved, acknowledged and minted on native win32 (task `d06d00e2…`), adapter root `0x113b79c3…8a396c` verified on-chain | `runs/run4-e2e.json`; mint tx `0x1dde66f4…66fff3`, block 55,457,526 |

### Still open

- **Mainnet (16661).** Still not deployed. `Passport.sol` mainnet and ERC-8004 mainnet registration
  are both pending funding of the mainnet wallet `0xD68235F859f3756c87f50619b165F68b80FDdFD4`
  (balance 0). This remains the top open item.
- **`verifyService()` / `attestationVerified`.** ~~Still honestly `false`.~~ **Now earned on
  Passport #3** — `verifyService` passes (signer + compose match) and #3 carries
  `attestationVerified: true`. The remaining honest limit is that the flag stands for those two
  checks, not full TDX quote validation via `dstack-verifier`; #1 and #2 keep `false`.
- **`retrieval.ts` transport hardening.** The in-code retriever needs streaming + resume for
  artifacts over ~60 MB — run 4's 93 MB download dropped once at 61,351,230 bytes (schannel) and only
  a curl `fetchImpl` with resume completed it. Not yet in `services/orchestrator/src/retrieval.ts`.
- Wave 3 scored **3 points / 202.5 USDC**. Wave 4 closes 2026-09-20.

### Test totals — re-run this session

`packages/core` 172 · `packages/cli` 62 · `packages/ml` 320 · `services/orchestrator` 239 ·
`apps/web` 349 · `contracts` 104 — **1,246 total**, every suite re-run 2026-09-18.

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
