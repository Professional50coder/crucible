# Crucible — Demo Video Script

**Hard limit: 3:00.** This script runs to **2:50**, leaving 10 seconds of slack for a slow
page load or a fumbled cut. Do not spend the slack on a longer intro.

**Format:** screen recording with voiceover. 1920×1080, 30fps. No music under the voiceover —
it makes hashes on screen harder to read and adds nothing.
**Destination:** unlisted-but-public YouTube link, or Loom with "anyone with the link".
**Must contain, per the Wave 3 rules:** core functionality, the user flow end to end, and the
0G integration shown on screen.

---

## Pre-flight checklist

Run this before you hit record. Every item exists because it has burned someone.

**Secrets — non-negotiable**

- [ ] Close `.env`, `.env.local`, and `CREDENTIALS.local.md` in every editor tab and every file explorer window.
- [ ] Clear the terminal scrollback completely (`Clear-Host` then close and reopen the window — scrollback survives a clear in some terminals). No private key, seed phrase, or funded address history anywhere in the buffer.
- [ ] Confirm no `PRIVATE_KEY=` line is visible in any shell history you might up-arrow into. Turn off shell autosuggestions for the recording.
- [ ] Wallet extension: use the throwaway demo wallet only. Never show a balance screen for a wallet that holds real value.
- [ ] If the passport page shows an owner address, confirm it is the throwaway address.

**Desktop hygiene**

- [ ] Browser: new clean profile or a fresh window. No other tabs, no bookmarks bar with personal links, no autofill dropdowns.
- [ ] Notifications off (Windows Focus Assist / Do Not Disturb). Slack, mail, Telegram closed.
- [ ] Editor: hide the file tree if it shows unrelated projects. Font size up — hashes must be legible at 1080p.
- [ ] Screen resolution set before recording, not after.

**Content ready**

- [ ] Orchestrator running on `:8787`, web app on `:3000`, both warmed up (visit every page once so nothing compiles on camera).
- [ ] A **completed** passport already exists — do not train live on camera. A real fine-tune takes far longer than three minutes.
- [ ] The gallery has more than one entry so it reads as a gallery.
- [ ] `chainscan.0g.ai` page for the deployed contract open in a background tab, already loaded.
- [ ] `storagescan.0g.ai` page for the manifest upload open in a background tab, already loaded.
- [ ] A small dataset file staged on the desktop for the upload shot.
- [ ] Practice the drag-and-drop once. A missed drop costs a whole take.

---

## Shot list

Total: **170 seconds**.

---

### 1 · 0:00–0:12 — The problem, cold open (12s)

**On screen:** 0G task terminal output, `Delivered`, with the timestamp highlighted. Cut to a
plain title card: `48 HOURS`.

**Voiceover:**
> When a fine-tuning job on 0G finishes, a 48-hour clock starts. Acknowledge in time and you get
> your model. Miss it and you lose the model — and thirty percent of the fee. Nothing warns you.

---

### 2 · 0:12–0:24 — What gets thrown away (12s)

**On screen:** the terminal lineage block — pre-trained model hash, dataset hash, training
params, TEE delivery — then the buffer scrolls and it's gone.

**Voiceover:**
> Every 0G fine-tune already produces a full cryptographic lineage. Base model, dataset root
> hash, hyperparameters, TEE-verified delivery. It's printed to a terminal and then it's gone.
> Crucible keeps it.

---

### 3 · 0:24–0:42 — Upload and validate (18s)

**On screen:** Crucible web app. Drag the dataset file in. Validation panel resolves: format
detected, example count, token count. Then deliberately show a rejected config — the
five-parameter rule catching an error inline.

**Voiceover:**
> This is the whole user flow. Drop in a dataset. Crucible detects the format, validates it
> against 0G's rules, and converts it. Every rule 0G would reject you for is checked here,
> locally, before any money moves.

---

### 4 · 0:42–0:56 — Cost, then launch (14s)

**On screen:** cost estimate panel — price per token read live from the provider, training fee,
storage reserve, total. Provider card showing H200, Intel TDX, TEE signer acknowledged. Click
**Launch**.

**Voiceover:**
> The cost comes from the live on-chain price, not a guess. That's a real 0G fine-tuning
> provider — an H200 inside an Intel TDX enclave, with its TEE signer acknowledged on chain.
> Launch.

---

### 5 · 0:56–1:14 — Live training on 0G Compute (18s)

**On screen:** live task view stepping through the real 0G states — `SettingUp`, `SetUp`,
`Training`, `Trained`, `Delivering` — with streamed training logs beside it. (Use a recorded
or replayed run; state this in the description if asked.)

**Voiceover:**
> The job runs on 0G Compute. This is 0G's real state machine, not a progress bar we invented —
> streamed straight from the provider, with the training logs alongside it.

---

### 6 · 1:14–1:32 — The deadline, handled (18s)

**On screen:** state hits `Delivered`. A countdown appears. The daemon's log line shows the
acknowledgement firing immediately, not at the buzzer. Then the "unlock stuck queue" button.

**Voiceover:**
> Delivered — the 48-hour clock. Crucible's daemon acknowledges the moment it sees this, always
> through the safe call. There's a documented bug where the wrong download path locks an account
> out of 0G permanently. Crucible can't reach it — and it can unlock accounts already stuck.

---

### 7 · 1:32–1:52 — The passport (20s)

**On screen:** the Model Passport page. Scroll slowly through: base model + hash, dataset root
hash, the five training parameters, adapter hash, fee breakdown, TEE signer and acknowledgement
status, the manifest hash. Every hash rendered with its verification link.

**Voiceover:**
> This is the passport. The model's birth certificate. Base model and its hash. The exact dataset
> by its 0G Storage root hash. Every hyperparameter. The fee actually paid. The TEE that ran it.
> And the manifest hash that binds all of it together.

---

### 8 · 1:52–2:14 — Verify it without trusting us (22s)

**On screen:** click the dataset hash → storage scan showing the upload. Click the contract →
the explorer showing the deployed, source-verified `Passport.sol` and its mint transaction. Then
call `verifyManifest(tokenId, hash)` from the explorer's read tab → `true`, and again with a
tampered hash → `false`.

**Voiceover:**
> And you don't have to trust any of it. The dataset is on 0G Storage — here it is. The contract
> is deployed and source-verified on 0G. Recompute the manifest hash yourself, ask the chain
> whether it matches, and the chain answers. Change one byte and it says no.

> ⚠️ **Film against whichever network is actually deployed.** As of 2026-08-15 that is Galileo
> testnet (`chainscan-galileo.0g.ai`, contract `0x27087B5b…83C1c7`, verified). If mainnet is
> deployed before filming, use `chainscan.0g.ai` instead. Do not say "mainnet" over a testnet
> explorer — that single word is the kind of thing a judge checks.

---

### 9 · 2:14–2:28 — Agentic ID and the gallery (14s)

**On screen:** mint flow → token ID appears. Cut to the public gallery of passports.

**Voiceover:**
> Each passport mints as an ERC-7857 Agentic ID, so the provenance travels with the model instead
> of living in someone's database. Every passport is public and linkable.

---

### 10 · 2:28–2:38 — What we don't claim (10s)

**On screen:** plain text slide — "Crucible proves lineage, not honest training."

**Voiceover:**
> One honest limit: Crucible proves lineage, not honest training. Proving the epochs actually ran
> needs zero-knowledge proofs over the training itself. That's the roadmap, not the claim.

---

### 11 · 2:38–2:50 — Close (12s)

**On screen:** title card — project name, repo URL, mainnet contract address, the four 0G
components listed: Compute · Storage · Chain · Agentic ID.

**Voiceover:**
> Crucible. Verifiable fine-tuning on 0G, using all four components — Compute, Storage, Chain,
> and Agentic ID. Every model gets a birth certificate. Repo and contract are on screen.

---

## Timing audit

| # | Segment | In | Out | Length |
|---|---|---|---|---|
| 1 | Cold open — 48 hours | 0:00 | 0:12 | 12s |
| 2 | Lineage thrown away | 0:12 | 0:24 | 12s |
| 3 | Upload + validate | 0:24 | 0:42 | 18s |
| 4 | Cost + launch | 0:42 | 0:56 | 14s |
| 5 | Live training on 0G Compute | 0:56 | 1:14 | 18s |
| 6 | 48-hour deadline handled | 1:14 | 1:32 | 18s |
| 7 | The passport | 1:32 | 1:52 | 20s |
| 8 | Verify it yourself | 1:52 | 2:14 | 22s |
| 9 | Agentic ID + gallery | 2:14 | 2:28 | 14s |
| 10 | What we don't claim | 2:28 | 2:38 | 10s |
| 11 | Close | 2:38 | 2:50 | 12s |
| | **Total** | | | **170s (2:50)** |

**170 < 180.** Slack: 10 seconds.

**Voiceover pacing:** the script runs about 400 words across 170 seconds — roughly 2.4 words
per second, which is a calm, clear delivery. If a take runs long, cut words, not shots. The
shots that cannot be cut are 5 (0G Compute), 7 (the passport), and 8 (independent verification):
those three are what the "0G Integration" criterion is looking at.

---

## Requirement coverage

| Wave 3 requirement | Covered by |
|---|---|
| Core functionality | Shots 3, 4, 6, 7, 9 |
| User flow, end to end | Shots 3 → 4 → 5 → 6 → 7 → 9, in order and uncut |
| 0G integration shown | Shot 4 (Compute provider + TEE), 5 (Compute execution), 8 (Storage + Chain + explorer), 9 (Agentic ID) |
| ≤ 3 minutes | 2:50 |
| Public link | Upload as unlisted-public YouTube or link-shared Loom; verify in a private window before submitting |

---

## Post-production

- [ ] Watch the finished cut once at full screen, specifically looking for leaked secrets in any frame — including frames you scrubbed past quickly.
- [ ] Confirm the runtime is under 3:00 in the uploaded file, not just in the edit timeline.
- [ ] Open the public URL in a private/incognito window, logged out, and confirm it plays.
- [ ] Title: `Crucible — Verifiable Fine-Tuning on 0G` (or similar; keep the project name first).
- [ ] Description: one-line summary, repo URL, mainnet contract address + explorer link, and the four 0G components used.
- [ ] Paste the final URL into `submission/CHECKLIST.md` and into the AKINDO form.
