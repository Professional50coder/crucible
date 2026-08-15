# AKINDO submission — every field, as a parameter

Transcribed from the live AKINDO forms on **2026-08-15**, not from the program description.
Each row is a parameter with a hard constraint and an acceptance test. When Crucible is close
to done, the project is judged against **this** file: if a row cannot be marked ✅ with evidence,
it is not finished.

Deadline: **2026-08-30 20:30**. Treat 2026-08-29 as the real one.

Legend — `✅ done` · `🟡 drafted, not final` · `❌ blocked or not started` · `⛔ hard requirement`

---

## Part 0 · Platform prerequisites

These gate everything else. A finished product that is not registered into the Wave is not submitted.

| # | Parameter | Constraint | Status | Acceptance test |
|---|---|---|---|---|
| 0.1 | AKINDO account | signed in | ✅ | `Crypto_hg` loads with Manage controls |
| 0.2 | **GitHub connected on AKINDO** | ⛔ required before a product can be created | ❌ | profile shows the GitHub row as *connected*, not `Connect`. **Only the account owner can do this — it is an OAuth grant** |
| 0.3 | Team created | max 3 products per team page | ✅ | `app.akindo.io/communities/nPmazde6Mtdag6vd` |
| 0.4 | Product created under that team | — | ❌ | product page exists |
| 0.5 | Product **registered into the 3rd Wave** | ⛔ | ❌ | product appears under Submissions → 3rd Wave |

> Known failure mode from the comments thread: if a team page already holds 3 products, the
> **New Product button silently does not appear**. The fix is a second team page, not support.

---

## Part 1 · Create Team form — submitted 2026-08-15

| Field | Required | Constraint | Value used |
|---|---|---|---|
| Icon | ✅ | image upload | `brand/icon.png` — 512×512, black, wordmark + node constellation |
| Team name | ✅ | — | `Crucible` |
| About this team | ✅ | Markdown | short pitch ending in the lineage-not-honest-training caveat |
| Buildathon Grant Recipient | ✅ | picks the user grants are paid to | `Crypto_hg` |
| GitHub or Website | — | URL | `https://github.com/Professional50coder/crucible` |
| X | — | URL | `https://x.com/Hitansh54` |
| Telegram / Discord | — | URL | not set |
| Display "Recruiting Members" | — | checkbox | off — solo build |
| Application Form URL / Guidelines | — | — | not set |

---

## Part 2 · Create Product form — the live gate

Reached at `communities/<teamId>/create-product`. Every ✅ below is required by the form itself;
it will not submit without them.

| # | Field | Required | Constraint | Planned value | Status |
|---|---|---|---|---|---|
| 2.1 | Product icon | ✅ | image | `brand/icon.png` (inherits from the team) | ✅ |
| 2.2 | Product name | ✅ | — | `Crucible` | ✅ |
| 2.3 | Tagline | ✅ | **≤ 100 words**; the buildathon separately asks for **≤ 30 words** | *"Crucible turns fine-tuning on 0G into one upload and issues every model a verifiable birth certificate: base model, dataset, hyperparameters and provider, hashed on-chain as an ERC-7857 Agentic ID."* — **29 words** | ✅ |
| 2.4 | Product type | ✅ | `Idea` · `Prototype` · `Functional` | **Functional** once the mainnet mint exists; **Prototype** until then. Do not overstate — the repo is checkable | 🟡 |
| 2.5 | **Image gallery** | ✅ | **1–5 images** | 1 architecture diagram · 2 lifecycle diagram · 3 verification diagram · 4 passport page screenshot · 5 gallery screenshot | 🟡 diagrams done, app screenshots pending |
| 2.6 | About | ✅ | Markdown, pre-templated: *What it does · The problem it solves · Challenges I ran into · What we learned · What's next* | keep their headings; fill each honestly | 🟡 |
| 2.7 | Deliverable URL | ✅ | repo URL, **must be public for judging** | `https://github.com/Professional50coder/crucible` | ✅ |
| 2.8 | Video | — | public YouTube URL | ≤ 3 min, per `DEMO_SCRIPT.md` | ❌ |
| 2.9 | Live demo | — | public URL | hosted passport gallery, if deployed | ❌ |
| 2.10 | Build with | ✅ | infrastructure layer, free text, Enter to add | `0G` | ✅ |
| 2.11 | Tags | ✅ | tech stack, **max 10**, Enter to add | `Solidity` `Hardhat` `TypeScript` `Next.js` `ERC-7857` `0G Compute` `0G Storage` `0G Chain` `Fine-tuning` `Provenance` | ✅ |
| 2.12 | Product detail visibility | — | `Show` / `Hide` | **Show** — hiding costs the traction score and stops judges reading the repo | ✅ |
| 2.13 | Connect: X | — | URL | `https://x.com/Hitansh54` | ✅ |
| 2.14 | Connect: Discord / Telegram / Email | — | — | optional | — |

---

## Part 3 · Wave 3 submission requirements

From the WaveHack page. Section 3 is new from Wave 3 and is the one that disqualifies.

| # | Requirement | Constraint | Status | Acceptance test |
|---|---|---|---|---|
| 3.1 | Project name + one-line description | **max 30 words** | ✅ | word count re-run after any edit |
| 3.2 | Short summary | what it does · problem · **which 0G components** | ✅ | all three present |
| 3.3 | Public GitHub repo | public, or shared with judges | ✅ | opens in a logged-out window |
| 3.4 | **Meaningful commits during the Wave** | dated **8/13 → 8/30** | 🟡 | `git log` shows small described commits across several days, not one dump |
| 3.5 | README with setup instructions | must actually work | ✅ | fresh clone, follow the quickstart, tests pass |
| 3.6 | **0G mainnet contract address** | ⛔ chain 16661 | ❌ | address recorded in README + changelog |
| 3.7 | **Explorer link showing on-chain activity** | ⛔ deployment alone is thin — needs a mint | ❌ | `chainscan.0g.ai/address/<contract>` shows transactions |
| 3.8 | Proof of ≥ 1 0G component integrated | evidenced in 3 places | 🟡 | video + `ARCHITECTURE.md` §5 + README table |
| 3.9 | Demo video | **≤ 3:00**, public YouTube/Loom | ❌ | plays logged out; runtime checked on the uploaded file |
| 3.10 | Architecture diagram / technical description | — | ✅ | `docs/diagrams/` + `submission/ARCHITECTURE.md` |
| 3.11 | Which 0G modules and how | — | ✅ | `ARCHITECTURE.md` §5 covers all four concretely |
| 3.12 | Local deployment / reproduction steps | — | ✅ | verified from a fresh clone |
| 3.13 | **Public X post** | ⛔ name + screenshot/clip + `#0GBridge` `#BuildOn0G` + `@0G_labs` `@0G_Builders` `@AKINDO_io`, all in the **root post** | ❌ | opens logged out; under 280 chars |
| 3.14 | Optional: pitch deck · user feedback · write-up · frontend link | bonus only | ❌ | start only after 3.1–3.13 are done |

---

## Part 4 · "Updates in this Wave" — the 40% field

This single textarea is what the **Progress & Momentum** criterion reads, and that criterion is
the largest weight in the rubric. Source text lives in `submission/WAVE3_CHANGELOG.md`.

| Parameter | Constraint | Status |
|---|---|---|
| Sectioned format | Core improvements → 0G integration → Agent/AI workflow → Developer & demo improvements | ✅ |
| Every `PLACEHOLDER_*` replaced | no exceptions | ❌ 3 chain placeholders remain |
| Every unlanded claim **deleted, not softened** | a judge can check the repo in thirty seconds | 🟡 |
| Renders correctly in the AKINDO preview | their renderer, not a local one | ❌ |

For calibration: of the 7 Wave 3 submissions live on 2026-08-15, three wrote `a` or
"Build the product fully" in this field. Two — Kavro Protocol and TRAIDE Keeper — wrote
structured changelogs with clickable on-chain evidence. That is the bar.

---

## Part 5 · Judging rubric → which artifact answers it

| Weight | Criterion | What the judge actually reads | Our answer |
|---|---|---|---|
| **40%** | Progress & Momentum | the "Updates in this Wave" field + commit history | `WAVE3_CHANGELOG.md`, dated commits |
| **30%** | 0G Integration | mainnet address, explorer activity, the video, architecture docs | all four components, each load-bearing — **blocked on 3.6/3.7** |
| **20%** | Technical Quality | the repository itself | 808 tests, pinned toolchain, `FIELD_NOTES.md` |
| **10%** | Traction & Communication | X post, public gallery, docs | `FIELD_NOTES.md` is publishable as-is; three corrections to 0G's own docs |

Sub-axes shown on every submission card: **Project Vision & 0G Fit · Technical Approach &
Architecture · Team & Execution Signal**.

---

## Part 6 · The completion gate

Do not open the submission form until every line here is true.

- [ ] GitHub connected on AKINDO *(owner action)*
- [ ] `Passport.sol` deployed **and source-verified** on chain 16661
- [ ] At least one real **mint** transaction on mainnet, linked
- [ ] A dataset or manifest visible on `storagescan.0g.ai`
- [ ] A real fine-tuning task ID that reached `Finished`, or the changelog says plainly that it did not
- [ ] Demo video under 3:00, public, no secret in any frame
- [ ] X post live with all three tags and both hashtags in the root post
- [ ] Every `PLACEHOLDER_*` gone: `grep -rn "PLACEHOLDER" README.md submission/`
- [ ] Every link opens in a logged-out private window
- [ ] `npm test` passes from a clean clone
- [ ] Nothing anywhere claims a completed end-to-end fine-tune if one has not happened
- [ ] Submitted with **at least 24 hours** to spare, then screenshot the confirmation

**Stated position:** we would rather submit one complete, verifiable project late in the window
than an incomplete one early. Resubmission is allowed before the deadline, so the only real
deadline is 8/30 20:30 — but the mainnet deploy must not be the thing left until 8/29.
