# Crucible — Wave 3 Submission Checklist

**Deadline: 2026-08-30 20:30.** Treat 2026-08-29 as the real deadline. The AKINDO platform steps
in section 0 are **blocking** — none of the other work can be submitted until they are done, and
they are the kind of thing that fails at 20:15 on the last day for a reason nobody anticipated.
Do them first, on a day when they don't matter.

**Last audited 2026-08-15.** Every ✅ below carries its evidence inline. Anything not personally
checked is left unticked, including things that are probably fine — an unticked box costs
nothing, a wrong tick costs the submission.

Judging weights, for prioritisation when time runs short:

| Weight | Criterion | What reads it |
|---|---|---|
| **40%** | Progress & Momentum | `submission/WAVE3_CHANGELOG.md` + the commit history |
| **30%** | 0G Integration | mainnet address, explorer activity, the demo video, ARCHITECTURE.md |
| **20%** | Technical Quality | the repo itself — tests, contract, docs |
| **10%** | Traction & Communication | the X post, the public gallery, FIELD_NOTES |

### The three things standing between here and a valid submission

1. **`Passport.sol` on mainnet 16661 + a mint** — the hard requirement. Cost at 4 gwei: deploy
   0.008954 0G, mint 0.001311 0G, **~0.0103 0G total**. The mainnet wallet holds 0, so this is a
   **~0.02 0G gas top-up, not a funding round.** Do not confuse it with the 3.0 0G
   `MIN_ACCOUNT_BALANCE()`, which gates *running a fine-tune* on mainnet, not deploying a
   contract.
2. **Create the AKINDO product and register it into the 3rd Wave** — GitHub is now connected, so
   this is unblocked and is pure clickwork. A product that is not registered into the Wave is not
   submitted.
3. **Demo video and X post** — both mandatory, neither started.

---

## 0 · AKINDO platform — BLOCKING, do these first

- [x] Create / sign in to an AKINDO account — `Crypto_hg` loads with Manage controls
- [x] **Connect GitHub on AKINDO** — ✅ connected, profile shows `Professional50coder`. This was the blocker on everything below; it is cleared
- [x] **Create a team** — [`app.akindo.io/communities/nPmazde6Mtdag6vd`](https://app.akindo.io/communities/nPmazde6Mtdag6vd)
- [ ] **Create a product** for Crucible — now unblocked. Next action
- [ ] **Register the product into the 3rd Wave** of the 0G Bridge Buildathon — a product that exists but is not registered into the wave is not submitted
- [x] Confirm the submission form is reachable and note every field it asks for — every field of both live forms transcribed into `submission/AKINDO_FORM_SPEC.md` on 2026-08-15, with its constraint and acceptance test
- [ ] Do a dry run: confirm the "Updates in this Wave" field accepts the changelog's length and markdown — needs the product to exist first

> Known failure mode from the comments thread: if a team page already holds 3 products, the
> **New Product button silently does not appear**. The fix is a second team page, not support.

---

## 1 · Project name, description, summary

- [x] Project name: **Crucible**
- [x] One-line description, **max 30 words** — counted programmatically at **29 words**:

  > Crucible turns fine-tuning on 0G into one upload and issues every model a verifiable birth certificate: base model, dataset, hyperparameters and provider, hashed on-chain as an ERC-7857-style Agentic ID.

- [x] Re-count the word limit after any edit — re-counted 2026-08-15, still 29
- [x] Short summary covering all three required points:
  - [x] **What it does** — one upload replaces 0G's twelve-step fine-tuning CLI flow; the run's cryptographic lineage becomes a public, independently checkable Model Passport
  - [x] **What problem it solves** — a 48-hour acknowledge deadline with no notification that costs users their model plus 30% of the fee; a documented bug that strands a user's deliverable queue with a provider; and a complete provenance chain that 0G already produces and then discards
  - [x] **Which 0G components it uses** — Compute, Storage, Chain, and Agentic ID (ERC-7857)

---

## 2 · Public GitHub repository

- [x] Repo is **public** — confirmed unauthenticated against the GitHub API: `"private": false`
- [x] Repo URL recorded: **https://github.com/Professional50coder/crucible**
- [ ] **Meaningful commits inside the wave window** — ⚠️ **23 commits, all authored 2026-08-15.** They are inside the 8/13–8/30 window and each is small and separately described (`feat(core): …`, `feat(orchestrator): …`, `docs: …`), which is what the criterion wants. But they land on a **single day**, which reads closer to one dump than to sustained momentum. Nothing can retroactively fix this; what can help is that remaining work (mainnet deploy, video, X post) lands on later, separate days. Left unticked deliberately.
- [x] `README.md` present at the repo root with setup instructions
- [ ] README's quickstart actually works from a **fresh clone** — not yet done for real. One thing to know: the root `workspaces` glob is `packages/*`, so root `npm test` does **not** reach `services/orchestrator`, `apps/web` or `contracts`; the full 808 needs each run from its own directory, which the README does document
- [x] `.gitignore` covers `.env`, `*.local.md`, `CREDENTIALS.local.md`, `node_modules/`, build output — verified: `reference/`, `node_modules/`, `dist/`, `.next/`, `coverage/`, `.env`, `.env.*` (with `!.env.example`), `CREDENTIALS.local.md`, `*.local.md`, `*.pem`, `*.key`, plus model artifacts
- [x] **No secret is committed anywhere in history** — `git log -p --all -S "PRIVATE_KEY=0x"` returns one hit, `PRIVATE_KEY=0x... npm start` in `services/orchestrator/README.md`, which is a documentation placeholder. No `.env`, `CREDENTIALS.local.md`, `*.local.md`, `*.pem` or `*.key` has ever been tracked in any commit on any branch
- [x] `reference/` (third-party repos cloned for study) is excluded — gitignored and `git ls-files` matches 0 paths under it
- [x] A LICENSE file exists and is deliberate — `LICENSE` at the repo root
- [x] Third-party reuse is attributed with licenses — `docs/PRIOR_ART.md` plus the README Credits section

---

## 3 · 0G integration proof — HARD REQUIREMENT

This is the one that disqualifies a submission if it is missing. The requirement is **mainnet**.

### Mainnet (chain 16661) — nothing here yet

- [ ] `Passport.sol` **deployed to 0G mainnet, chain 16661** — ⛔ **not deployed.** `eth_getCode` returns `0x`; the dev wallet holds **0 0G at nonce 0**. Needs **~0.0103 0G of gas** at 4 gwei (deploy 0.008954 + mint 0.001311), not 3 0G
- [ ] Contract **source-verified** on mainnet — blocked by the deploy, but the method is now proven on testnet and both networks point at `/open/api`, so the same command should work
- [ ] Mainnet contract address recorded: `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS`
- [ ] Explorer link recorded: `PLACEHOLDER_CHAINSCAN_CONTRACT_URL`
- [ ] **Explorer link shows real on-chain activity** — a deployment transaction alone is thin. At least one mint. Recorded: `PLACEHOLDER_MINT_TX_URL`
- [ ] Explorer link opens correctly for a logged-out visitor

### Testnet — Galileo (chain 16602) — all of this is real and re-verified today

Not a substitute for mainnet. It exists to de-risk the mainnet deploy and to give a judge
something to click today.

- [x] `Passport.sol` deployed — [`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7), deploy tx `0x302a4278…8a6dd1`, block 49596815, gas 2,238,586
- [x] **Contract source-verified on the explorer** — confirmed through the explorer's own `getsourcecode` endpoint, not the CLI's exit code: `ContractName Passport`, `v0.8.19+commit.7dd6d404`, `EVMVersion paris`, optimizer enabled at 200 runs, 78,649 chars of source published. Paris verified first try, which settles the compiler-pin question
- [x] Mint transaction — `0xb608a8a5…00b3b1`, block 49597171, gas 327,702, status 1; `ownerOf(1)` = `0xf4cEE5c1…FD3EF`
- [x] **On-chain verification demonstrated live** — `verifyManifest(1, 0x4f64bfe6…890f)` → **true**; `verifyManifest(1, keccak256("tampered"))` → **false**. Both re-run against the live RPC on 2026-08-15
- [x] 0G Storage evidence — **dataset** root `0xa5051ae7…9e7dbfd` (upload tx `0xc38e4131…d7da52`) and the **passport manifest** root `0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140` (upload tx `0x8372e7de…6ca10`)
- [x] **The verification loop closes end to end** — downloaded the manifest from `indexer-storage-testnet-turbo.0g.ai` (HTTP 200, 584 bytes), hashed those exact bytes with `keccak256`, got `0x4f64bfe6…890f`, which is the value anchored at mint and the value `verifyManifest(1, …)` returns `true` for. No wallet, no clone, nothing to unwrap
- [ ] Confirm the root hashes also render on `storagescan-galileo.0g.ai` for a logged-out visitor — the indexer fetch works; the explorer UI has not been checked in a browser
- [x] 0G Compute evidence — task `10551604-2664-4516-86cf-269a62f93bfc` on provider `0xA02b95Aa6886b1116C4f334eDe00381511E31A09`, paid for, reached `Delivered`. ⚠️ It was **never acknowledged** and was settled with the 30% penalty; do not describe it as a completed fine-tune anywhere

- [x] **Clear proof of at least one 0G component integrated** — evidenced in three places:
  - [ ] The demo video shows it running — video not recorded
  - [x] `submission/ARCHITECTURE.md` §5 describes each module concretely
  - [x] The README's integration-proof table carries the addresses
- [x] `submission/WAVE3_CHANGELOG.md` chain placeholders reduced to the two that genuinely depend on mainnet
- [ ] Update the README's placeholder table with the mainnet values once they exist

---

## 4 · Demo video — max 3 minutes

Follow `submission/DEMO_SCRIPT.md`; it is timed to 2:50.

- [ ] Pre-flight checklist in `DEMO_SCRIPT.md` completed — **especially** no `.env`, no `CREDENTIALS.local.md`, and no private key in terminal scrollback
- [ ] Recorded
- [ ] **Runtime under 3:00 in the uploaded file**, not just in the edit timeline
- [ ] Shows core functionality
- [ ] Shows the user flow end to end
- [ ] Shows the 0G integration explicitly (Compute execution, Storage, chainscan, Agentic ID mint)
- [ ] Uploaded to YouTube (unlisted-but-public) or Loom (anyone with the link)
- [ ] **Playable while logged out**, in a private window
- [ ] Description contains: one-line summary, repo URL, mainnet contract address, explorer link, the four 0G components
- [ ] URL recorded: `PLACEHOLDER_DEMO_URL`
- [ ] Watched once at full screen looking for leaked secrets in any frame

> ⚠️ The app defaults to mock mode unless `NEXT_PUBLIC_CRUCIBLE_API_URL` is set. Decide before
> filming whether the app segments run against the real orchestrator or the fixture store, and
> say which on screen — a judge who later discovers it was fixture data will discount everything
> else. Also film the explorer segments against whichever network is actually deployed: as of
> now that is Galileo testnet, not mainnet.

---

## 5 · Documentation

- [x] Architecture diagram or technical description — `submission/ARCHITECTURE.md`, plus `docs/diagrams/` (architecture, lifecycle, verification, each as SVG and PNG)
- [ ] Mermaid diagrams render correctly **on GitHub** — open the file on github.com and look; local previews lie. Not yet checked
- [x] Which 0G modules are used and how — `ARCHITECTURE.md` §5, all four covered concretely
- [ ] Local deployment / reproduction steps verified from a fresh clone — see §2
- [x] `docs/FIELD_NOTES.md` published — live-verified network facts, the real SDK surface, every footgun with its exact error string, three corrections to 0G's own docs
- [x] `docs/PRIOR_ART.md` published — vouch-protocol, OpenSSF Model Signing, Cisco's Model Provenance Kit, and the Verifiable Fine-Tuning paper, all cited
- [x] The "proves lineage, not honest training" limitation is stated in the README, ARCHITECTURE, and changelog — present in all three. Do not quietly drop it to sound stronger; it is the answer to the first hard question a judge will ask

---

## 6 · Public X post — MANDATORY

Drafts and counts in `submission/X_POST.md`. Nothing posted yet.

- [ ] Posted from a **public** account
- [ ] Contains the project name: **Crucible**
- [ ] Contains a demo screenshot or clip
- [ ] Contains `#0GBridge`
- [ ] Contains `#BuildOn0G`
- [ ] Tags `@0G_labs`
- [ ] Tags `@0G_Builders`
- [ ] Tags `@AKINDO_io`
- [ ] All of the above are in the **root post**, not scattered across a thread
- [x] Under 280 characters — re-counted programmatically 2026-08-16, after "ERC-7857" was qualified to "ERC-7857-style" in drafts A and B (+6 each): Draft A **271**, Draft B **271** literal / **274** counting `PLACEHOLDER_DEMO_URL` as X's fixed 23-char t.co length, which is the right way to count it, Draft C **252** unchanged. All three still fit; B now has 6 characters of headroom, so re-count again after any further edit
- [ ] No secret visible in the attached image
- [ ] Post URL recorded: `PLACEHOLDER_X_POST_URL`
- [ ] Opens correctly for a logged-out visitor

---

## 7 · "Updates in this Wave" — the 40% field

- [x] `submission/WAVE3_CHANGELOG.md` finalised — rewritten and audited 2026-08-15
- [ ] Every `PLACEHOLDER_*` replaced — **two remain**, `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` and `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL`. Both depend on the mainnet deploy. If it does not happen, **delete both bullets** and leave the stated limitation
- [x] Every line describing work that did not land has been **deleted**, not softened — ten claims removed, each recorded with its reason in the table at the bottom of that file so a later edit cannot quietly reintroduce them. The removals include the mainnet deployment, manifest-on-0G-Storage, sub-account funding, duplicate-upload handling, and the web mint flow
- [x] Sectioned format preserved: Core improvements → 0G integration → Agent/AI workflow → Developer & demo improvements
- [ ] Pasted into the AKINDO field
- [ ] Rendered output checked in the form preview — formatting that breaks in their renderer costs you the thing this criterion reads

---

## 8 · Optional bonus (only after 0–7 are complete)

Do not start any of these while a hard requirement is outstanding.

- [ ] Pitch deck
- [ ] User feedback — even two or three real reactions from the 0G builder Telegram beat zero
- [ ] Tutorial / write-up — `docs/FIELD_NOTES.md` is most of one already; publishing it as a standalone post would serve other builders and the Communication score at once
- [ ] Frontend demo link — now unblocked (`next build` is clean); a hosted URL is the cheapest remaining win for the Communication score
- [ ] Public passport gallery reachable without a wallet — same, and it makes the demo clickable rather than clonable

---

## 9 · Final pass before submitting

- [ ] Every `PLACEHOLDER_*` token in `submission/` and the root README is replaced: `grep -rn "PLACEHOLDER" README.md submission/`
- [ ] Every link opens in a logged-out private window: repo, video, X post, chainscan, storagescan, frontend
- [ ] The README's status table is honest — ⚠️ **one row is not, and it is the most consequential one.** "End-to-end authenticated fine-tune ✅ **Completed on testnet** — ran `Init → Finished`" is contradicted by the chain: the deliverable for task `10551604-…` reads `acknowledged: false`, `settled: true`, `encryptedSecret` empty, and the `FeesSettled` event charged **exactly 30%** of the fee (0.00355584 of 0.0118528 0G) — 0G's documented penalty for a model the user never acknowledged. A provider-side status of `Finished` means the provider closed the task out, not that the acknowledgement happened. The task was delivered and lost. **Fix this row before submitting; it is exactly the kind of claim a technical judge can disprove in one `eth_call`**
- [x] `apps/web` produces a clean `next build` — 7 routes, 88.8 kB shared JS, re-run 2026-08-15
- [ ] `npm test` passes from a clean clone — and note that the root `workspaces` glob is `packages/*`, so root `npm test` does not reach orchestrator, web or contracts. The full 808 requires running each from inside its own directory
- [ ] Nothing in the submission claims a completed end-to-end fine-tune
- [ ] Submitted with **at least 24 hours** to spare
- [ ] Submission confirmation screenshotted and saved

### Verified test totals — all re-run 2026-08-15

| Package | Tests | Command |
|---|---|---|
| `packages/core` | 105 | `cd packages/core && npx vitest run` |
| `packages/ml` | 320 | `cd packages/ml && npx vitest run` |
| `services/orchestrator` | 155 | `cd services/orchestrator && npx vitest run` |
| `apps/web` | 158 | `cd apps/web && npx vitest run` |
| `contracts` | 70 | `cd contracts && npx hardhat test` |
| **Total** | **808** | |

Datasets: **614 valid records across 6 files**, and 11 invalid fixtures all correctly rejected
(`node tools/verify-datasets.mjs`).

---

## Placeholder register

Everything a human must fill in. Nothing here can be derived.

| Token | Where it appears | Source | Status |
|---|---|---|---|
| `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` | README table, WAVE3_CHANGELOG, this file | mainnet deploy output | ⛔ blocked on funding |
| `PLACEHOLDER_CHAINSCAN_CONTRACT_URL` | README table, this file | `https://chainscan.0g.ai/address/<contract>` | ⛔ blocked on the deploy |
| `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL` | WAVE3_CHANGELOG | contract transactions tab | ⛔ blocked on the deploy |
| `PLACEHOLDER_MINT_TX_URL` | README table, this file | first mainnet mint transaction | ⛔ blocked on the deploy |
| `PLACEHOLDER_DEMO_URL` | X_POST draft B, this file, AKINDO form | YouTube / Loom | not recorded |
| `PLACEHOLDER_X_POST_URL` | this file, AKINDO form | the posted tweet | not posted |

Resolved since the last audit: the repo URL (**https://github.com/Professional50coder/crucible**,
confirmed public), the task ID (`10551604-2664-4516-86cf-269a62f93bfc`), the 0G Storage root hash
(`0xa5051ae7…9e7dbfd`), and `.env.example`, which is committed and tracked.
