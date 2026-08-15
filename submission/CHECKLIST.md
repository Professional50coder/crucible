# Crucible — Wave 3 Submission Checklist

**Deadline: 2026-08-30 20:30.** Treat 2026-08-29 as the real deadline. The AKINDO platform steps
in section 0 are **blocking** — none of the other work can be submitted until they are done, and
they are the kind of thing that fails at 20:15 on the last day for a reason nobody anticipated.
Do them first, on a day when they don't matter.

Judging weights, for prioritisation when time runs short:

| Weight | Criterion | What reads it |
|---|---|---|
| **40%** | Progress & Momentum | `submission/WAVE3_CHANGELOG.md` + the commit history |
| **30%** | 0G Integration | mainnet address, explorer activity, the demo video, ARCHITECTURE.md |
| **20%** | Technical Quality | the repo itself — tests, contract, docs |
| **10%** | Traction & Communication | the X post, the public gallery, FIELD_NOTES |

---

## 0 · AKINDO platform — BLOCKING, do these first

- [ ] Create / sign in to an AKINDO account
- [ ] **Connect GitHub on AKINDO** (required before a product can be created)
- [ ] **Create a team**
- [ ] **Create a product** for Crucible
- [ ] **Register the product into the 3rd Wave** of the 0G Bridge Buildathon — a product that exists but is not registered into the wave is not submitted
- [ ] Confirm the submission form is reachable and note every field it asks for, so nothing is discovered late
- [ ] Do a dry run: open the form, check field length limits, confirm the "Updates in this Wave" field accepts the changelog's length and markdown

---

## 1 · Project name, description, summary

- [ ] Project name: **Crucible**
- [ ] One-line description, **max 30 words** — the version below is 29 words:

  > Crucible turns fine-tuning on 0G into one upload and issues every model a verifiable birth certificate: base model, dataset, hyperparameters and provider, hashed on-chain as an ERC-7857 Agentic ID.

- [ ] Re-count the word limit after any edit
- [ ] Short summary covering all three required points:
  - [ ] **What it does** — one upload replaces 0G's twelve-step fine-tuning CLI flow; the run's cryptographic lineage becomes a public, independently checkable Model Passport
  - [ ] **What problem it solves** — a 48-hour acknowledge deadline with no notification that costs users their model plus 30% of the fee; a documented bug that permanently locks accounts; and a complete provenance chain that 0G already produces and then discards
  - [ ] **Which 0G components it uses** — Compute, Storage, Chain, and Agentic ID (ERC-7857); all four, each load-bearing

---

## 2 · Public GitHub repository

- [ ] Repo is **public** — verify in a logged-out private window, not just from your own account
- [ ] Repo URL recorded here: `PLACEHOLDER_REPO_URL`
- [ ] **Meaningful commits inside the wave window** — small, described, dated commits, not one squashed dump at the end. This is directly read by the 40% Progress criterion.
- [ ] `README.md` present at the repo root with setup instructions
- [ ] README's quickstart actually works — clone into a fresh directory and run it. Do this once, for real, before submitting.
- [ ] `.gitignore` covers `.env`, `*.local.md`, `CREDENTIALS.local.md`, `node_modules/`, build output
- [ ] **No secret is committed anywhere in history**, not just in the current tree — check with `git log -p --all -S "PRIVATE_KEY"` and equivalent searches for your key prefix
- [ ] `reference/` (third-party repos cloned for study) is excluded
- [ ] A LICENSE file exists and is deliberate
- [ ] Third-party reuse is attributed with licenses (`docs/PRIOR_ART.md`, README Credits)

---

## 3 · 0G integration proof — HARD REQUIREMENT

This is the one that disqualifies a submission if it is missing. Everything here is on **mainnet**.

- [ ] `Passport.sol` **deployed to 0G mainnet, chain 16661**
- [ ] Contract **source-verified** on `chainscan.0g.ai` (Solidity 0.8.19, `evmVersion: cancun` — newer EVM versions fail verification)
- [ ] Mainnet contract address recorded: `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS`
- [ ] Explorer link recorded: `PLACEHOLDER_CHAINSCAN_CONTRACT_URL`
- [ ] **Explorer link shows real on-chain activity** — a deployment transaction alone is thin. At least one mint. Recorded: `PLACEHOLDER_MINT_TX_URL`
- [ ] Explorer link opens correctly for a logged-out visitor
- [ ] **Clear proof of at least one 0G component integrated** — evidenced in three places, not one:
  - [ ] The demo video shows it running
  - [ ] `submission/ARCHITECTURE.md` §5 describes each module concretely
  - [ ] The README's integration-proof table carries the addresses
- [ ] 0G Storage evidence: a manifest or dataset upload visible on `storagescan.0g.ai` — `PLACEHOLDER_STORAGESCAN_URL`
- [ ] 0G Compute evidence: the fine-tuning provider actually used, with its task ID — `PLACEHOLDER_TASK_ID`
- [ ] Update the README's placeholder table with every real value above
- [ ] Update `submission/WAVE3_CHANGELOG.md`'s three chain placeholders

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

---

## 5 · Documentation

- [ ] Architecture diagram or technical description — `submission/ARCHITECTURE.md`
- [ ] Mermaid diagrams render correctly **on GitHub** (open the file on github.com and look; local previews lie)
- [ ] Which 0G modules are used and how — `ARCHITECTURE.md` §5, all four covered concretely
- [ ] Local deployment / reproduction steps — README quickstart, verified from a fresh clone
- [ ] `docs/FIELD_NOTES.md` published (bonus value: directly useful to every other 0G builder)
- [ ] `docs/PRIOR_ART.md` published (prior art cited honestly — a technical judge will look for this)
- [ ] The "proves lineage, not honest training" limitation is stated in the README, ARCHITECTURE, and changelog. Do not quietly drop it to sound stronger; it is the answer to the first hard question a judge will ask.

---

## 6 · Public X post — MANDATORY

Drafts and counts in `submission/X_POST.md`.

- [ ] Posted from a **public** account
- [ ] Contains the project name: **Crucible**
- [ ] Contains a demo screenshot or clip
- [ ] Contains `#0GBridge`
- [ ] Contains `#BuildOn0G`
- [ ] Tags `@0G_labs`
- [ ] Tags `@0G_Builders`
- [ ] Tags `@AKINDO_io`
- [ ] All of the above are in the **root post**, not scattered across a thread
- [ ] Under 280 characters (all three drafts verified: 265 / 268 / 252)
- [ ] No secret visible in the attached image
- [ ] Post URL recorded: `PLACEHOLDER_X_POST_URL`
- [ ] Opens correctly for a logged-out visitor

---

## 7 · "Updates in this Wave" — the 40% field

- [ ] `submission/WAVE3_CHANGELOG.md` finalised
- [ ] Every `PLACEHOLDER_*` replaced
- [ ] Every line describing work that did not land has been **deleted**, not softened — see the delete-list at the bottom of that file
- [ ] Sectioned format preserved: Core improvements → 0G integration → Agent/AI workflow → Developer & demo improvements
- [ ] Pasted into the AKINDO field
- [ ] Rendered output checked in the form preview — formatting that breaks in their renderer costs you the thing this criterion reads

---

## 8 · Optional bonus (only after 0–7 are complete)

Do not start any of these while a hard requirement is outstanding.

- [ ] Pitch deck
- [ ] User feedback — even two or three real reactions from the 0G builder Telegram beat zero
- [ ] Tutorial / write-up — `docs/FIELD_NOTES.md` is most of one already; publishing it as a standalone post would serve other builders and the Communication score at once
- [ ] Frontend demo link — a hosted URL for the passport gallery, so a judge can click rather than clone
- [ ] Public passport gallery reachable without a wallet

---

## 9 · Final pass before submitting

- [ ] Every `PLACEHOLDER_*` token in the whole `submission/` directory and the root README is replaced. Search for it: `grep -rn "PLACEHOLDER" README.md submission/`
- [ ] Every link in the submission opens in a logged-out private window: repo, video, X post, chainscan, storagescan, frontend
- [ ] The README's status table is honest — nothing is marked working that has not run
- [ ] `npm test` passes from a clean clone
- [ ] Nothing in the submission claims a completed end-to-end fine-tune if one has not happened
- [ ] Submitted with **at least 24 hours** to spare
- [ ] Submission confirmation screenshotted and saved

---

## Placeholder register

Everything a human must fill in. Nothing here can be derived.

| Token | Where it appears | Source |
|---|---|---|
| `PLACEHOLDER_REPO_URL` | README quickstart, this file, AKINDO form | the public GitHub repo |
| `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS` | README table, WAVE3_CHANGELOG, this file | mainnet deploy output |
| `PLACEHOLDER_CHAINSCAN_CONTRACT_URL` | README table, WAVE3_CHANGELOG, this file | `https://chainscan.0g.ai/address/<contract>` |
| `PLACEHOLDER_CHAINSCAN_ACTIVITY_URL` | WAVE3_CHANGELOG | contract transactions tab |
| `PLACEHOLDER_MINT_TX_URL` | this file, README table | first mint transaction |
| `PLACEHOLDER_STORAGESCAN_URL` | README table, this file | `https://storagescan.0g.ai` upload record |
| `PLACEHOLDER_TASK_ID` | README table, this file | the 0G fine-tuning task actually run |
| `PLACEHOLDER_DEMO_URL` | X_POST draft B, this file, AKINDO form | YouTube / Loom |
| `PLACEHOLDER_X_POST_URL` | this file, AKINDO form | the posted tweet |
| `PLACEHOLDER_ENV_EXAMPLE` | README quickstart | `.env.example` is not committed yet — either commit it or remove that line |
