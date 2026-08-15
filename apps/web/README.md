# `@crucible/web` — the Crucible web app

The launcher, the live training view, and the public Model Passport gallery.

**This app runs and is fully clickable with no backend, no wallet, and no network
access.** That is deliberate and non-negotiable: the contract, the core library
and the orchestrator are being built in parallel, and the demo must never depend
on another service being up. Everything below works from `npm run dev` on a fresh
clone.

```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run typecheck` | `tsc --noEmit` |

This package is **standalone**. It is not a member of the root npm workspace
(`workspaces: ["packages/*"]`), it has its own `package-lock.json`, and it never
imports from `packages/` or `contracts/` at build time — so installing or
building here cannot collide with work happening elsewhere in the repo.

---

## Pages

| Route | What it is |
|---|---|
| `/` | The problem — the 48-hour deadline, Bug #4, the funding footgun — and the answer |
| `/new` | Upload → validate → configure → estimate cost → launch |
| `/jobs` | Every run Crucible is managing |
| `/jobs/[id]` | Live training view: the real ten-state machine, the provider log, and the acknowledgement countdown |
| `/passport/[id]` | **The Model Passport.** Full manifest, every hash linked to its proof |
| `/gallery` | All passports, filterable by network and model |

### What makes the passport page the centrepiece

A visitor with no wallet can verify every claim on it:

- **Dataset and adapter root hashes** link to 0G Storage Scan — and to the
  *correct* Storage Scan, which is a different host per network
  (`storagescan.0g.ai` for mainnet, `storagescan-galileo.0g.ai` for Galileo).
  Sending a testnet hash to the mainnet host returns "not found", which on a
  provenance page reads as *the data is gone* rather than *the URL is wrong*.
- **Provider and TEE signer addresses** link to the right chainscan
  (`chainscan.0g.ai` / `chainscan-galileo.0g.ai`).
- **The manifest hash is recomputed in the reader's browser** — keccak256 over
  the canonical manifest, via viem — and compared against the value anchored on
  chain. This is not staged: the fixtures' anchored hashes are the genuine
  keccak256 of their own manifests, so if canonicalization ever breaks, the
  fixtures go red rather than silently agreeing.
- **"Verify this yourself"** spells out the four checks with the exact calls
  (`passportOf`, `verifyManifest`) and copy buttons on each.

---

## Configuration

Everything is optional — see `.env.example`. With nothing set, the app runs on
fixtures.

| Variable | Effect when unset | Effect when set |
|---|---|---|
| `NEXT_PUBLIC_CRUCIBLE_API_URL` | Mock mode. Jobs are simulated in memory; passports come from fixtures. A `MOCK DATA` badge is shown in the header. | Live mode. Every call in `src/lib/api.ts` hits this base URL. |
| `NEXT_PUBLIC_PASSPORT_ADDRESS_MAINNET` / `..._TESTNET` | The passport page labels its contract address as a placeholder rather than linking to a non-existent explorer page. | Used as the real `Passport.sol` address, selected by the passport's own network. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Injected wallets only (MetaMask, Rabby, anything exposing `window.ethereum`). WalletConnect is **not** initialised with a placeholder id, because that breaks the connect modal at runtime. | RainbowKit's full connector set. |

---

## What is mocked, and what each mock needs to become real

Everything crosses one seam: **`src/lib/api.ts`**. No page, component or hook in
this app calls `fetch` or reads fixture data directly. Swapping to the real
orchestrator is setting one environment variable.

Paths and field names in `api.ts` match `docs/INTERFACES.md` §5 exactly, so live
mode needs no translation layer.

### 1. Orchestrator HTTP API — `services/orchestrator/`

| Function | Live endpoint | Status |
|---|---|---|
| `listJobs` | `GET /jobs` | mocked |
| `getJob` | `GET /jobs/:id` | mocked |
| `getJobLogs` | `GET /jobs/:id/logs` | mocked — `parseRawLogs()` already converts the `{ logs: string }` blob into levelled lines |
| `createJob` | `POST /jobs` | mocked |
| `unlockJob` | `POST /jobs/:id/unlock` | mocked (Bug #4 escape hatch) |
| `listPassports` | `GET /passports` | mocked |
| `getPassport` | `GET /passports/:id` | mocked |
| `getHealth` | `GET /health` | mocked |

**To become real:** stand up the orchestrator and set `NEXT_PUBLIC_CRUCIBLE_API_URL`.

**Two gaps to close on the orchestrator side.** Both are marked "UI extension" in
`src/lib/types.ts` and every screen degrades to a placeholder without them, but
the job view is noticeably thinner:

1. **`Job` in INTERFACES.md §5 carries no `model`, `config`, `fee`, or dataset
   statistics.** The job page renders all four. They are optional fields on our
   `Job` type so a spec-conformant response still type-checks, but a real
   orchestrator response would leave the Config, Fee and Dataset panels empty.
   Adding `model`, `config`, `fee`, `dataset { filename, format, exampleCount,
   tokenCount }`, `adapterRootHash` and `name` to the `Job` shape would close it.
2. **`GET /passports` returns bare `PassportManifest[]`.** A manifest has no
   passport id, no mint data and no display name, so the gallery cannot link to
   a page or show a token number from it alone. This app consumes a
   `PassportRecord` (`{ id, manifest, mint, name?, summary? }`) — the manifest
   joined with what `passportOf(tokenId)` returns. Either the orchestrator does
   that join, or the web app reads the mint half from chain itself (the ABI is
   already here; see below).

Also useful but not blocking: `GET /jobs/:id/stream` (SSE) exists in the spec and
this app currently **polls** instead — 2 s on the job page, 3 s on the job list.
Switching to the SSE stream is a change confined to `src/app/jobs/[id]/page.tsx`.

### 2. `Passport.sol` — `contracts/`

- `src/lib/passport-abi.ts` is **generated** — a verbatim copy of
  `contracts/abi/Passport.json`, kept as a literal so `npm run build` never
  depends on reaching across a package boundary. Do not hand-edit it; anything
  written there is lost on the next sync. Deployment details that *are*
  hand-written live in `src/lib/passport-contract.ts` for exactly that reason.
- **No contract call is made yet.** The passport page renders mint data from the
  API response. The read path (`passportOf`, `verifyManifest`) needs no wallet
  and could run through viem against the public RPC as soon as an address exists.
- Addresses are per-network (`passportAddress(network)` in
  `src/lib/passport-contract.ts`). Testnet is baked in — `Passport.sol` is live
  and source-verified on 0G Galileo at
  `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7` — so a shared passport link
  resolves with no build-time configuration. Mainnet is deliberately empty, which
  is what makes the UI say "not yet deployed" rather than render a plausible
  address whose explorer link goes nowhere. Both are overridable with
  `NEXT_PUBLIC_PASSPORT_ADDRESS_{TESTNET,MAINNET}`. Demo records keep the
  fabricated `0x7B4f0C3a…148f6A`, labelled as such on the page.
- **Minting from the browser is not implemented.** `api.mintPassport()` exists
  and is wired to the orchestrator-managed path; a wallet-signed `mint()` through
  wagmi is the remaining piece, and needs the deployed address plus a decision on
  who owns the token (the runner or the orchestrator's key).

### 3. Duplicated logic that `@crucible/core` will own

Three modules are deliberate duplicates so the web app validates in the browser
with no round-trip and no build-time dependency on a package being written
concurrently. If core and these ever disagree, **core is right**:

- `src/lib/dataset.ts` — format detection and validation
- `src/lib/training-config.ts` — the five-parameter rules
- `src/lib/manifest.ts` — canonicalization and `manifestHash`
- `src/lib/fee.ts` / `src/lib/chains.ts` — fee arithmetic, network config,
  `explorerLinks()`

Core exports an equivalent `explorerLinks(manifest)` and
`STORAGE_SCAN_URLS`; prefer those once this app can depend on the package.

### 4. Fixture data

`src/lib/mock/fixtures.ts` holds two kinds of record, and every `PassportRecord`
carries a `provenance` field saying which it is. The UI keys off that field: a
`demo` record never renders an outbound explorer link for a value that would
404, because a link that goes nowhere teaches the reader that every link on the
page is decorative.

**`provenance: 'chain'` — passport #1 (`p-000001`).** Real. The 2026-08-14 run on
0G Galileo and the 2026-08-15 mint, recorded in
`contracts/deployments/galileo-mints.json`. Task
`10551604-2664-4516-86cf-269a62f93bfc`, dataset root `0xa5051ae7…9e7dbfd`,
token #1 in tx `0xb608a8a5…00b3b1` (block 49,597,171), manifest anchored at
`0x4f64bfe6…59890f` and stored on 0G Storage at submission 146937.

Three things on that page are recomputed in the reader's browser rather than
asserted: the anchored manifest hash (from `anchoredManifest`, the exact
document the mint hashed — not this app's v1 shape, which came later), the
config hash, and the **adapter sentinel**.

**That run lost its model, and the UI says so.** `acknowledgeModel` failed on
both download paths — the bundled `0g-storage-client` is a Linux ELF and the host
is Windows (`ENOENT`), and the TEE path dies at zero bytes with `stream.on is not
a function` before surfacing a 429 — so the deliverable was never acknowledged.
Reading 0G's FineTuningServing contract: `acknowledged: false`, empty
`encryptedSecret`, and 30.0000% of the fee deducted (0.00355584 of 0.0118528 0G).
The provider force-settled and the artifact was destroyed.

Two consequences the copy must keep:

- `manifest.task.state` is `Finished` because the **provider reports** it so.
  That is not acknowledgement and does not mean a model exists. The record
  carries `settlement.acknowledged: false`, `PassportView` renders a settlement
  panel from it, and the hint beside the state reads *deliverable never
  acknowledged*. Never show the provider's progress field on its own.
- The adapter field holds `keccak256("crucible:adapter-not-retrieved:<taskId>")`.
  The page hashes the published preimage locally and shows that it reproduces the
  anchored value, so a reader can confirm the failure rather than take it on
  trust.

Nothing in the UI may claim Crucible retrieves the model today. The honest and
still-strong claim, and the one the copy makes, is that it detects the delivery,
retries every path 0G offers, escalates before the window closes instead of
after, records the failure, and can release a locked queue with
`acknowledgeDeliverable`.

**`provenance: 'demo'` — everything else.** Genuine within them (verified live
2026-08-14, per `docs/FIELD_NOTES.md` and INTERFACES.md §6): provider addresses,
TEE signer, base-model hashes, per-token prices, chain IDs, RPC and explorer
hosts, hardware quota, storage reserve fees — those stay linked. Fabricated:
dataset root hashes, adapter root hashes, 0G task ids, mint transaction hashes,
token ids, owner addresses, and the demo contract address. Their manifest and
config hashes are *derived* from the manifests rather than invented, so the
page's own verification check is a real computation even on a demo record.

---

## The mock simulator

`src/lib/mock/store.ts` stands in for the orchestrator. It advances jobs through
the real ten-state lifecycle on a **compressed clock** — and only the clock is
compressed. Every rule it enforces is the real one:

- A job you launch reaches `Delivered` in about 60 seconds instead of ~20 minutes.
- `Delivered` then opens a genuine **48-hour** window, counting down at true speed.
- Acknowledgement is attempted ~2 minutes after delivery, which is the real
  policy — Crucible acknowledges as soon as the adapter is retrievable rather
  than waiting, with escalation 6 hours before the deadline as a backstop.
- One provider per network takes one task at a time, so launching while another
  run is active produces a genuinely `queued` job.
- Reaching `Finished` mints a passport, which appears in the gallery.

Seeded jobs exist for every state the UI must handle:

| Job | State | Why it exists |
|---|---|---|
| `job_7f21c4` | `Delivered` 90 s ago | The demo shot: countdown live, daemon fires ~30 s after page load |
| `job_1d55b2` | `Delivered` 26 h ago | Retries failing, countdown in `warning` |
| `job_2ad901` | `Training` | Advances on its own |
| `job_5c8e33` | `Finished` | Has a passport |
| `job_9b0f77` | `Failed` | The funding footgun, with the fix stated |
| `job_4e12aa` | `Init`, queued | Provider occupied — a state, not an error |

The store is in-memory and per-session: a reload reseeds it, and jobs created in
one browser tab are not visible in another.

---

## Tests

```
npm test
```

**158 tests across 13 files**, covering the logic where being wrong costs
something real:

| File | Covers |
|---|---|
| `lib/format.test.ts` | Middle truncation of hashes, exact 0G/neuron rendering, duration formatting, no exponent notation |
| `lib/deadline.test.ts` | The 48-hour window, urgency thresholds, auto-acknowledge scheduling, the 30% penalty |
| `lib/task-states.test.ts` | Lifecycle order, monotonic progress, failure placement |
| `lib/dataset.test.ts` | Every validation rule, with line numbers and fixes |
| `lib/training-config.test.ts` | The five-parameter rules and ranges |
| `lib/manifest.test.ts` | Canonicalization determinism, and that fixtures anchor their own real hash |
| `lib/fee.test.ts` | Fee arithmetic against 0G's published price |
| `lib/chains.test.ts` | Per-network Storage Scan and chainscan host selection |
| `lib/api.test.ts` | Mock API behaviour, filtering, job simulation, queueing, reload persistence |
| `components/Hash.test.tsx` | Truncated display, full-value copy, verification links |
| `components/StateMachine.test.tsx` | Phase rendering across the lifecycle and on failure |
| `components/AckCountdown.test.tsx` | Countdown display, urgency, "when Crucible will act" |
| `components/DatasetInput.test.tsx` | Inline validation feedback |

Styling is not tested. No test requires a private key, funds, or a live network.

---

## Design notes

Dark, technical, near-monochrome. Colour is reserved for signal — running,
verified, at-risk, failed — with one interactive accent (`phosphor`, a lime
`#c8f050`) for links, focus rings and the numbers that matter. No gradient hero.

Constraints held throughout:

- **Every hash is monospace, middle-truncated, and copyable.** Middle, not tail:
  you compare hashes by their ends. The full value is in the `title` and on the
  clipboard.
- **Nothing scrolls the page sideways.** Wide content (logs, code, tables) lives
  in its own `overflow-x` container; long values use `break-hash`.
- **Real loading, empty and error states** on every data-driven screen, with a
  retry that actually retries.
- `prefers-reduced-motion` disables all animation.
- Fonts are system stacks, so a build never depends on fetching a font.
