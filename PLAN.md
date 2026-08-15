# Crucible — the board

The single place that says what is running, what is next, what is blocked, and what has to be kept
true. `TODO.md` is the short list; this is the whole picture. Updated as things land.

**Wave 3 closes 2026-08-30 20:30.** Treat 08-29 as the deadline. Judged against
[`submission/AKINDO_FORM_SPEC.md`](submission/AKINDO_FORM_SPEC.md).

Owner: **me** = the assistant · **you** = account or funds required · **agent** = delegated, running.

---

## DONE — the things that are now true

Each of these is checkable, not asserted.

| | Evidence |
|---|---|
| `Passport.sol` deployed **and source-verified** on 0G Galileo | `0x27087B5b…83C1c7` · `v0.8.19+commit.7dd6d404` / `paris` / 200 runs / 78,649 chars |
| **Passport #1** minted — the run that lost its model | block 49597171 · sentinel adapter · `acknowledged: false` · 30.0000% debited |
| **Passport #2** minted — the run that kept it | block 49612106 · real adapter root `0x40a5f256…` read off-chain at mint time |
| **Model retrieved** | 93,642,469 bytes · sha256 `0x9f788764…` · validated against the provider's on-chain root hash · `acknowledged: true` |
| Manifest on 0G Storage, and the verification loop closes | root `0xc757a7e6…` · submission 146937 · hashes to the anchored value |
| DEFECT-01 isolated to **two** distinct defects | identical code, Windows vs WSL2 — TEE path fails on both, storage path only on Windows |
| Frontend redesigned | motion register · landing hero · passport certificate · gallery · run views · progressive disclosure · **lineage graph with a trace that visibly fails on #1** |
| **271 tests, 20 files, 0 failures**; `next build` green, 7 routes | up from 174 at the start of the redesign |
| Docs | README rewritten around what is provable · claims audit · changelog recording corrections · prior art with interface citations · field notes · delegation rules |
| AKINDO | GitHub connected · team `Crucible` created |

## REMAINING — in the order I would do it

### Blocked on you
| # | What | Size |
|---|---|---|
| 1 | **~0.05 0G mainnet gas** → `0xD68235F859f3756c87f50619b165F68b80FDdFD4` | one Telegram message, drafted in `docs/OUTREACH.md` |
| 2 | Post the X thread | 5 min, drafts in `submission/X_POST.md` |
| 3 | Record the demo video | 30 min, after the script is rewritten |

### Mine, and short
| # | What | Why now |
|---|---|---|
| 4 | **Passport #2 as a fixture in the web app** | The app currently only shows #1. The two-outcomes comparison — the strongest thing we have — is not yet visible in the UI. The graph already supports it via its `compare` prop |
| 5 | **Screenshots, wallet disconnected** | A judge sees the quiet chip, not the amber warning. Unblocks the AKINDO gallery, which needs 1–5 images |
| 6 | **Register the AKINDO product** | Everything else is ready; the form spec is written |
| 7 | **Rewrite `DEMO_SCRIPT.md` against reality** | It currently films three things that do not exist: a mint button, a live daemon acknowledgement, and a mainnet address |

### Mine, once gas lands
| # | What |
|---|---|
| 8 | Deploy + verify `Passport.sol` on mainnet 16661, then one mint. Both commands already proven on Galileo |
| 9 | Fill the last `PLACEHOLDER_*` tokens and finalise the Wave 3 changelog — the field carrying 40% of the score |

## THE AUDIT BACKLOG

An adversarial pass found 39 findings. Tier 1 is fixed. What remains, roughly in order of how badly
it would read to a judge:

- `docs/PRODUCT.md` still claims mainnet in two places, and names competitors dismissively in a
  public repo whose URL is on the submission form — delete the competitor commentary.
- `submission/DEMO_SCRIPT.md` films three things that do not exist.
- `submission/ARCHITECTURE.md` re-states two claims the changelog already deleted as untrue, and its
  sample manifest reads as a real one while carrying `attestationVerified: true`, which no real run
  can produce.
- "Permanently locks a user out of the network" is overstated in seven files — the real scope is the
  deliverable queue for that provider, with a documented escape hatch.
- Unqualified "ERC-7857" survives in ~17 places; only "ERC-7857-style" is defensible.
- Folklore presented as measurement: the `CALL_EXCEPTION` on duplicate upload (never reproduced —
  and in fact disproved), "silently" routes to the inference sub-account, LoRA size figures.
- `datasets/0g-expert/build.mjs` teaches "the minimum deposit is 3 OG" — the exact error this
  project is proudest of disproving, in a public dataset.
- `docs/PRIOR_ART.md` says "Check repo" where licences belong; `.paul/STATE.md` has the real answer.

## THE PRODUCT GAPS — these change what is true

| # | Gap | Why it matters |
|---|---|---|
| 1 | **No mint path in the UI.** Passport #1 was minted by a Hardhat script | The demo should not film a button that does not exist |
| 2 | **`verifyService()` is never called**, so `attestationVerified` is `false` | We record the TEE signer without checking the attestation. That field should be earned |
| 3 | **The daemon has never performed a real acknowledgement** | Both acknowledgements were done by scripts. It is well-tested against fakes; one real run through the daemon makes the headline feature true rather than argued |
| 4 | ~~No adapter retrieved~~ | **Done.** 93.6 MB retrieved from WSL2 Linux; passport #2 carries its real root hash |
| 5 | No `transferFund` in the codebase | Already deleted from the changelog. Build it or keep it deleted |

## MAINTAIN — the standing rules

These are what keep the project defensible. They are not one-off tasks.

- **Nothing is claimed that has not run.** A finding enters the README only after it is executed
  against the live network or confirmed against a primary source, and it leaves the moment it is
  disproved — deleted, not softened, with the correction dated in `CHANGELOG.md`.
- **The chain is authoritative, not the provider's API.** `progress: Finished` is off-chain and
  advisory; `getDeliverables` is the truth. This project has already been burned once by that.
- **Commit feature by feature**, push at each boundary, keep the tree clean. Never bundle.
- **No AI or assistant attribution anywhere**, in any commit, comment, or document.
- **Secrets never enter the repo.** `.env`, `contracts/.env`, `CREDENTIALS.local.md`,
  `MAINNET_WALLET.local.md` — verify with `git check-ignore` before every commit.
- **Reused code is open source and cited** in `docs/PRIOR_ART.md`. Patterns are reimplemented, not
  pasted. Radix (MIT) is permitted; `web3uikit` and anything unlicensed is not.
- **Every agent reports gates**, and names what it did not attempt.
- **The honest version always ships.** One run lost its model, the other was retrieved by changing
  nothing but the operating system. That comparison is worth more than a clean demo would have been.

## DELEGATION RULES — learned the hard way

Every one of these is here because it already cost us something.

| Rule | What it cost when it was missing |
|---|---|
| **One owner for `next build`.** Agents run `npm test` only; the lead runs the single authoritative build | Three agents plus a dev server wrote to the same `apps/web/.next` concurrently. Two agents saw phantom failures — `_ssgManifest.js` and `.next/types/…` races — and one nearly reverted good work chasing a bug that did not exist. The build was green the moment it ran alone |
| **Every agent gets a time bound**, stated up front | Agents left open-ended ran for 25–35 minutes each while the critical path waited on them |
| **Numbered gates, in order, each blocking the next** | Without them an agent spreads effort evenly and finishes nothing completely. With them, a cut-off still yields working increments |
| **Report format is mandatory: `GATE n — PASSED/FAILED — evidence`, plus `BLOCKED` and `NOT ATTEMPTED` named explicitly** | A silently partial audit reads exactly like a complete one. The claims-audit agent's "not audited, treat as unaudited" section is the only reason the rest of it could be trusted |
| **Exclusive file ownership, listed by path** | Two agents editing one file is a merge conflict nobody asked for. Shared foundations — tokens, CSS, `package.json` — are the lead's, and agents request additions rather than editing |
| **Install shared dependencies before launching**, never from inside an agent | Three agents racing on `package.json` corrupts a lockfile |
| **Ground truth in the brief, and correct it mid-flight when it changes** | I briefed an agent that the first run completed successfully. It read the contract, found `acknowledged: false` and a 30% penalty, and told me I was wrong. Had it taken my word, a false claim would have shipped |
| **Say what must not be claimed**, not just what to build | Copy drifts toward the flattering version unless the honesty constraints are in the brief itself |
| **Agents may spawn their own sub-agents** | Fine, and sometimes faster. The gates and the report format still apply to whatever comes back |

---

## LATER — if Wave 3 lands

Wave 4 closes 2026-09-20; Wave 5 on 09-25; Demo Day at Token2049 in October.

- `verifyService()` attestation verification surfaced in the passport
- OpenSSF Model Signing interop so passports carry a standards-compliant signature
- Hosted inference against a fine-tuned adapter
- `authorizeUsage` developed into a model-licensing flow
- Full ERC-7857 compliance via `iTransferFrom` + a TEE oracle, against `0g-agent-nft`
