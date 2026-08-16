# Crucible — Demo Video Script

**Hard limit: 3:00.** This script runs to **2:50**, leaving 10 seconds of slack for a slow
page load or a fumbled cut. Do not spend the slack on a longer intro.

**Format:** screen recording with voiceover. 1920×1080, 30fps. No music under the voiceover —
it makes hashes on screen harder to read and adds nothing.
**Destination:** unlisted-but-public YouTube link, or Loom with "anyone with the link".
**Must contain, per the Wave 3 rules:** core functionality, the user flow end to end, and the
0G integration shown on screen.

---

## The rule this script is written under

**Film only what exists.** Every frame is either a page this repository builds, a file this
repository contains, or a public explorer showing a transaction this repository sent. Nothing
is mocked up for the camera, and where the app is serving fixture data the video says so while
the fixture data is on screen.

Three things the previous version of this script filmed **do not exist and have been cut**:

| Cut shot | Why |
|---|---|
| "Click **Mint**" in the web app | There is no mint path in the app. `apps/web/src/lib/api.ts:285` records that the `mintPassport()` stub was deleted; the orchestrator serves no mint route. Both passports were minted by `contracts/scripts/`. |
| A daemon acknowledgement shown inline in the live task view | The daemon and the web app are not wired together. The daemon's real acknowledgement is filmable — from `runs/run3-daemon.json` and the explorer — but not from that screen. |
| A mainnet contract address on the closing card | `docs/CLAIMS_AUDIT.md`: mainnet balance 0, nonce 0, **nothing deployed**. The deployment is 0G Galileo testnet, chain 16602. |

**The spine of the video is the two-outcome comparison.** Two fine-tuning runs, identical in
every variable except the operating system the acknowledgement ran on. One lost its model and
30% of the fee. One got its model back. Both are permanently recorded on the same contract.
That is the most compelling true thing this project has, and no competitor's demo has an
equivalent, because it required actually losing a model.

---

## Pre-flight checklist

Run this before you hit record. Every item exists because it has burned someone.

**Secrets — non-negotiable**

- [ ] Close `.env`, `.env.local`, `CREDENTIALS.local.md`, and `MAINNET_WALLET.local.md` in every editor tab and every file explorer window. All four are in the repo root and all four are gitignored for a reason.
- [ ] Clear the terminal scrollback completely (`Clear-Host` then close and reopen the window — scrollback survives a clear in some terminals). No private key, seed phrase, or funded address history anywhere in the buffer.
- [ ] Confirm no `PRIVATE_KEY=` line is visible in any shell history you might up-arrow into. Turn off shell autosuggestions for the recording.
- [ ] If you film a WSL terminal, check its scrollback separately — it is a different buffer, and `tools/run3-daemon.sh` sources `.env` into it.
- [ ] Wallet extension: use the throwaway demo wallet only. Never show a balance screen for a wallet that holds real value.
- [ ] The passport pages show an owner address. Confirm it is the throwaway deployer, not a funded wallet.

**Desktop hygiene**

- [ ] Browser: new clean profile or a fresh window. No other tabs, no bookmarks bar with personal links, no autofill dropdowns.
- [ ] Notifications off (Windows Focus Assist / Do Not Disturb). Slack, mail, Telegram closed.
- [ ] Editor: hide the file tree if it shows unrelated projects. Font size up — hashes must be legible at 1080p.
- [ ] Screen resolution set before recording, not after.
- [ ] Your `/mnt/c/Users/<name>/` path appears in `tools/run3-daemon.sh`. Either accept that your username is on screen or crop it.

**Content ready**

- [ ] Web app on `:3000`, every page visited once so nothing compiles on camera: `/`, `/new`, `/jobs`, `/jobs/job_1d55b2`, `/passport/p-000001`, `/passport/p-000002`.
- [ ] ⚠️ **Eight fixture records are labelled `mainnet` / chain 16661, and nothing is deployed on mainnet.** Four jobs — `job_7f21c4`, `job_2ad901`, `job_5c8e33`, `job_9b0f77` — and four gallery passports carry `network: 'mainnet'` (`apps/web/src/lib/mock/fixtures.ts`). **Film `job_1d55b2` — testnet, `Delivered`, so the acknowledgement strip renders — and keep `/jobs` and `/gallery` out of frame.** A judge who pauses on a mainnet chip and then reads `CLAIMS_AUDIT.md` has found the contradiction this rewrite exists to remove.
- [ ] **Decide mock or live, and film the decision.** With `NEXT_PUBLIC_CRUCIBLE_API_URL` unset the app runs on the fixture store and the header shows a `mock data` badge (`apps/web/src/components/SiteChrome.tsx:60-67`). **Leave that badge in frame.** Do not crop it, and do not set the variable just to hide it.
- [ ] Confirm you know which fixtures are real: `p-000001` and `p-000002` carry the genuine on-chain records for passports #1 and #2. Every other gallery entry carries `provenance: 'demo'` and the UI refuses to draw an explorer link beside a value that would 404 (`apps/web/src/lib/mock/fixtures.ts:1-22`).
- [ ] Explorer tabs open and already loaded, **Galileo testnet, not mainnet**:
  - `chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7#code`
  - `chainscan-galileo.0g.ai/tx/0x4e2c81e237efc53623d869d361f212bf649ff132dc6274fbb18dc0d80c7e4cfa`
  - `storagescan-galileo.0g.ai/submission/146937`
- [ ] `runs/run3-daemon.json` open in the editor, scrolled to the `timeline` block.
- [ ] A small dataset file staged for the upload shot — `datasets/sentiment/train.jsonl` works and is the one the real runs used.
- [ ] Practice the drag-and-drop once. A missed drop costs a whole take.
- [ ] Do **not** plan to train live on camera. A real fine-tune takes about four minutes to `Delivered` and the acknowledgement is an hour after that.

---

## Shot list

Total: **170 seconds**.

---

### 1 · 0:00–0:14 — The loss, cold open (14s)

**On screen:** `/passport/p-000001`. The custody panel in its danger state, reading *"Lost. The
deliverable was never acknowledged, so 0G destroyed the artifact and deducted 30% of the fee."*
(the string is in `apps/web/src/components/PassportView.tsx`), with the adapter row showing a
sentinel rather than a hash. Hold on it long enough to read. Then a plain title card: `48 HOURS`.

**Voiceover:**
> This is a model that no longer exists. It was fine-tuned on 0G, it was delivered, and then a
> 48-hour clock ran out. The model was forfeited and thirty percent of the fee was taken.
> Nothing warned us. This passport is the record of losing it.

---

### 2 · 0:14–0:38 — The flow that prevents it (24s)

**On screen:** `/new`, with the `mock data` badge visible in the header. Drag in
`datasets/sentiment/train.jsonl`. Validation resolves: format detected, example count, token
count. Show a rejected config — a training-parameter rule caught inline. Cost estimate panel
fills in. Click **Launch run**, cut to `/jobs/job_1d55b2` — testnet, `Delivered`: 0G's real
state list, and the `AckCountdown` strip showing both the deadline and the point inside the
window where Crucible acts. **Not `job_7f21c4`** — that fixture is labelled mainnet.

**Voiceover:**
> Here is the flow, and one thing said up front: this app is running on fixture data — that badge
> is the app telling you so. The evidence for the rest of this video is not. Drop in a dataset;
> Crucible detects the format and checks it against the rules 0G would reject you for, locally,
> before money moves. Bad hyperparameter, caught on the field. It estimates the fee, it launches,
> and from the moment a task is delivered it shows you the window and the point inside it where
> the acknowledgement fires.

---

### 3 · 0:38–0:54 — The passport (16s)

**On screen:** `/passport/p-000002`. Scroll slowly: base model and hash, dataset root hash,
the training config hash, adapter root hash, fee, TEE signer, manifest hash. Every hash with
its verification link.

**Voiceover:**
> This is a Model Passport. Base model, the exact dataset by its 0G Storage root hash, the
> training configuration, the adapter that came back, the TEE that ran it, and the manifest
> hash that binds all of it together and is anchored on 0G Chain.

---

### 4 · 0:54–1:14 — Two runs, one variable (20s)

**On screen:** passport #1 and passport #2 side by side, or cut between them on the same rows.
Highlight the identical values first — same provider, same dataset root, same config hash,
same base model — then the one row that differs: adapter.

**Voiceover:**
> Now put the two next to each other. Same contract, same wallet, same dataset, same base
> model, same training config, same provider, same SDK version. One row differs. Passport one
> carries a labelled sentinel where its adapter hash should be, because the download failed on
> Windows. Passport two carries a real root hash for ninety-three point six megabytes retrieved
> from Linux. One variable — the operating system — and one of these models is gone.

---

### 5 · 1:14–1:30 — The chain settles it (16s)

**On screen:** terminal, `node tools/deliverable-status.mjs`. Read-only, no key, no gas. Two
deliverables print: `acknowledged: false` for task `10551604-…f93bfc`, `acknowledged: true`
for `3e385c46-…7ae3`. Then the fee: `0.00355584` debited against `0.0118528`.

**Voiceover:**
> And we don't get to be the ones who decide which happened. The provider's own API reported
> this task as Finished, and we published that, and it was wrong. The contract says
> acknowledged false, and the debit is exactly thirty percent — 0G's documented penalty for a
> model the user never collected. That arithmetic is the proof the model was forfeited.

---

### 6 · 1:30–1:54 — The daemon does it unattended (24s)

**On screen:** `runs/run3-daemon.json` in the editor, scrolled to `timeline` — delivered
`08:53:57Z`, scheduled `09:53:57Z`, acknowledged `09:56:05Z`. Cut to
`chainscan-galileo.0g.ai/tx/0x4e2c81e2…4cfa`, block 49716408, status success. Cut back to
`node tools/deliverable-status.mjs b1807e85` → `acknowledged: true`.

**Voiceover:**
> Then we stopped driving it by hand. On the sixteenth of August the orchestrator daemon ran a
> third task end to end on its own defaults. A human started it, posted one job to its API, and
> watched. Delivered at 08:53. Acknowledgement scheduled for an hour later — its real default,
> nothing shortened for the demo — ninety-three megabytes pulled from 0G Storage, acknowledged
> on chain at 09:56. Here is the transaction. Here is the contract agreeing.

---

### 7 · 1:54–2:12 — Verify it without trusting us (18s)

**On screen:** terminal, `node tools/verify-manifest.mjs`. It downloads the manifest from 0G
Storage, canonicalises it, hashes it, and calls the contract:
`verifyManifest(1, hash)` → `true`, `verifyManifest(1, keccak256("tampered"))` → `false`. Cut
to `storagescan-galileo.0g.ai/submission/146937` and to the verified source tab on chainscan.

**Voiceover:**
> None of this needs our cooperation. The manifest is on 0G Storage — fetch it yourself,
> canonicalise it, hash it, and ask the contract whether it matches. It says yes. Change one
> byte and it says no. `Passport.sol` is deployed and source-verified on 0G Galileo.

---

### 8 · 2:12–2:24 — The mint refuses to lie (12s)

**On screen:** the header comment of `contracts/scripts/mint.js` — the acknowledgement refusal
and the dry-run default — then `contracts/test/mint-args.test.js` passing, including
`mint.js — offline dry run end to end · reproduces passport #2 from a manifest file and sends
nothing`.

> ⚠️ Do **not** film `node scripts/mint.js --manifest runs/run3.json …` from the file's own usage
> block. `runs/run3.json` does not exist — the run 3 record is `runs/run3-daemon.json`, and it is
> not in the manifest shape the script requires. You will get a file-not-found on camera. The
> test is the shot; it exercises the same code path offline and is green.

**Voiceover:**
> Minting is a script, not a button — that is deliberate, and it is dry-run by default. Before
> it mints, it reads the deliverable off the chain and refuses if acknowledged is false. There
> is no flag that turns that check off. A passport claiming an adapter the chain disagrees with
> is the exact dishonesty this project exists to make impossible.

---

### 9 · 2:24–2:38 — What we don't claim (14s)

**On screen:** plain text slide, four lines:
```
Galileo testnet only — nothing on mainnet
Lineage, not honest training
attestationVerified: false on every passport
Retrieval is broken on Windows — DEFECT-01
```

**Voiceover:**
> Four things we are not claiming. Nothing is deployed to mainnet. Crucible proves lineage, not
> that the provider honestly ran the epochs — that needs zero-knowledge proofs over training.
> The TEE attestation field reads false, because we check the signer and the compose hash but
> have not validated the Intel quote itself. And retrieval is still broken on Windows. All four
> are written down in the repo before you find them.

---

### 10 · 2:38–2:50 — Close (12s)

**On screen:** title card — project name, repo URL, `Passport.sol` at
`0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7` on **0G Galileo testnet (16602)**, and the four
0G components: Compute · Storage · Chain · Agentic ID.

**Voiceover:**
> Crucible. Fine-tuning on 0G with a birth certificate for every model, using Compute, Storage,
> Chain and an ERC-7857-style Agentic ID. Repo and contract are on screen. Every number in this
> video is in the repository or on the explorer.

---

## Timing audit

| # | Segment | In | Out | Length |
|---|---|---|---|---|
| 1 | Cold open — the lost model | 0:00 | 0:14 | 14s |
| 2 | The flow that prevents it | 0:14 | 0:38 | 24s |
| 3 | The passport | 0:38 | 0:54 | 16s |
| 4 | Two runs, one variable | 0:54 | 1:14 | 20s |
| 5 | The chain settles it | 1:14 | 1:30 | 16s |
| 6 | The daemon, unattended | 1:30 | 1:54 | 24s |
| 7 | Verify it yourself | 1:54 | 2:12 | 18s |
| 8 | The mint refuses to lie | 2:12 | 2:24 | 12s |
| 9 | What we don't claim | 2:24 | 2:38 | 14s |
| 10 | Close | 2:38 | 2:50 | 12s |
| | **Total** | | | **170s (2:50)** |

14 + 24 + 16 + 20 + 16 + 24 + 18 + 12 + 14 + 12 = **170**. **170 < 180.** Slack: 10 seconds.

**Voiceover pacing:** roughly 420 words across 170 seconds — about 2.5 words per second, a calm
delivery. If a take runs long, cut words, not shots. The shots that cannot be cut are 4 (two
outcomes), 6 (the daemon) and 7 (independent verification): those three are the whole argument.
Shot 9 also stays — a limitation stated before a judge finds it is worth more than the thirty
seconds it might buy elsewhere.

---

## Every on-screen claim, and where a judge checks it

Pause the video anywhere and this table is the answer.

| Shot | Claim on screen | Checkable at |
|---|---|---|
| 1, 4 | Passport #1's adapter is a sentinel, not a hash | `contracts/deployments/galileo-mints.json`, token 1; the sentinel is `keccak256("crucible:adapter-not-retrieved:<taskId>")` and the page recomputes it live |
| 2 | The app is on fixture data | the `mock data` badge in the header, and `apps/web/src/lib/api.ts` |
| 3, 4 | Passport #2's adapter root `0x40a5f256…1b4d`, 93,642,469 bytes | `runs/run2-retrieval.json`; the root was read off-chain at mint time, not from our notes |
| 5 | `acknowledged: false` / `true`, 30.0000% debited | `node tools/deliverable-status.mjs` — read-only `eth_call` against `FineTuningServing` at `0xC6C075D8039763C8f1EbE580be5ADdf2fd6941bA` |
| 6 | Daemon delivered 08:53:57Z, acknowledged 09:56:05Z | `runs/run3-daemon.json`; tx `0x4e2c81e2…4cfa`, block 49716408 |
| 7 | Manifest hash matches the anchor | `node tools/verify-manifest.mjs`; submission 146937 on Storage Scan |
| 7, 10 | Contract deployed and source-verified | `chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7#code` |
| 8 | Mint refuses on `acknowledged: false`; dry-run by default | the check in `contracts/scripts/mint.js`, exercised offline by `contracts/test/mint-args.test.js`, which reproduces passports #1 and #2 byte for byte and sends nothing |
| 8 | The app has no mint path | `apps/web/src/lib/api.ts:280-288` and `apps/web/README.md:143-147` — the `mintPassport()` stub was deleted, and the orchestrator never served the route it posted to |
| 9 | Nothing on mainnet | `docs/CLAIMS_AUDIT.md` — mainnet balance 0, nonce 0 |
| 9 | `attestationVerified: false` | every minted manifest, and `docs/FIELD_NOTES.md` § `verifyService() passes — and what it does not check` |

Two things to say out loud rather than let a viewer infer:

- **Run 3 has no passport.** The daemon acknowledged it; nothing was minted for it. Do not cut
  from the daemon transaction to a passport page in a way that implies otherwise.
- **The web app and the daemon are not connected in this recording.** Shot 2 is the app on
  fixtures; shot 6 is the daemon's own record. Saying so costs four seconds and removes the one
  inference a judge could later call a lie.
- **Some fixtures are labelled mainnet; the deployment is not.** That is a fixture-data artefact,
  not a claim — which is exactly why those screens stay out of frame rather than being explained
  on camera. See the pre-flight warning.

---

## Requirement coverage

| Wave 3 requirement | Covered by |
|---|---|
| Core functionality | Shots 2, 3, 6, 8 |
| User flow, end to end | Shot 2 covers upload → validate → estimate → launch → task view → acknowledgement window. Shot 3 is the passport that ends that flow — minted by `contracts/scripts/`, not by the app, which shot 8 states outright. Do not imply the button in shot 2 produced the token in shot 3 |
| 0G integration shown | **Compute** — shots 5 and 6 are real tasks against the live testnet provider, read back from `FineTuningServing`; shot 2 is the interface to that integration running on fixtures, and is labelled as such on screen and in the voiceover. **Storage** — shot 7 (manifest, submission 146937) and the 93.6 MB adapter retrieval in shots 4 and 6. **Chain** — shots 5, 6, 7 (deliverable reads, the acknowledgement transaction, `verifyManifest`). **Agentic ID** — shots 3, 4, 8 (`Passport.sol`, two minted tokens, the mint's refusal check) |
| ≤ 3 minutes | 2:50 |
| Public link | Upload as unlisted-public YouTube or link-shared Loom; verify in a private window before submitting |

---

## Post-production

- [ ] Watch the finished cut once at full screen, specifically looking for leaked secrets in any frame — including frames you scrubbed past quickly.
- [ ] Confirm the runtime is under 3:00 in the uploaded file, not just in the edit timeline.
- [ ] Confirm the word "mainnet" is spoken exactly once, in shot 9, and only to say nothing is deployed there.
- [ ] Scrub the cut frame by frame through shot 2 and confirm **no `mainnet` or `16661` chip is visible anywhere**, including in a nav hover or a page that flashed during a transition.
- [ ] Confirm the `mock data` badge is legible in at least one frame of shot 2.
- [ ] Open the public URL in a private/incognito window, logged out, and confirm it plays.
- [ ] Title: `Crucible — Verifiable Fine-Tuning on 0G` (or similar; keep the project name first).
- [ ] Description: one-line summary, repo URL, the Galileo testnet contract address plus its explorer link, the four 0G components, and one line stating the app segments run on fixture data.
- [ ] Paste the final URL into `submission/CHECKLIST.md` and into the AKINDO form.
