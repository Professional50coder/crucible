# Crucible — the board

The single place that says what is running, what is next, what is blocked, and what has to be kept
true. `TODO.md` is the short list; this is the whole picture. Updated as things land.

**Wave 3 closes 2026-08-30 20:30.** Treat 08-29 as the deadline. Judged against
[`submission/AKINDO_FORM_SPEC.md`](submission/AKINDO_FORM_SPEC.md).

Owner: **me** = the assistant · **you** = account or funds required · **agent** = delegated, running.

---

## RUNNING RIGHT NOW

| What | Owner | Gate it must pass |
|---|---|---|
| Motion system + landing hero | agent | backdrop renders with reduced-motion fallback → landing rebuilt → tests + `next build` green |
| Passport certificate redesign | agent | verification hero → typed rows + full hashes → tests + build green |
| Gallery, runs, chrome | agent | first screen earns itself → network pill calmed → run views → tests + build green |
| Adapter retrieval from WSL Linux | me | `acknowledged: true` on-chain, or a named reason it failed |

## NEXT, IN ORDER

1. **Screenshots** of the redesigned app — gallery, passport, run view. Blocked on the three agents.
2. **Register the AKINDO product.** GitHub is connected, team exists, form spec written. Needs the screenshots for the 1–5 image gallery.
3. **Mainnet deploy + mint** the moment gas lands. One command; already configured and proven on Galileo.
4. **Demo video** ≤ 3:00, per `submission/DEMO_SCRIPT.md` — but the script currently films three things that do not exist (a mint button, a live daemon acknowledgement, a mainnet address). Rewrite it against reality first.
5. **X post** with both hashtags and all three tags in the root post.
6. **Finalise the "Updates in this Wave" changelog** — the field carrying 40% of the score.

## BLOCKED ON YOU

| # | What | Why it needs you | Size |
|---|---|---|---|
| 1 | **~0.05 0G on mainnet** to `0xD68235F859f3756c87f50619b165F68b80FDdFD4` | No mainnet faucet exists. Deploy + mint costs 0.0103 0G at 4 gwei | one Telegram message, drafted in `docs/OUTREACH.md` |
| 2 | Post the X thread | Your account | 5 min, drafts in `submission/X_POST.md` |
| 3 | Record the demo video | Your voice and face | 30 min once the app is final |

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
| 3 | **The daemon has never performed a real acknowledgement** | Well-tested against fakes. One real run through it makes the headline feature true |
| 4 | **No adapter retrieved** | In progress from WSL right now. A real adapter root hash replaces passport #1's sentinel |
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
- **The honest version always ships.** Two runs lost their models. That is the finding, and it is
  worth more than a clean demo.

## LATER — if Wave 3 lands

Wave 4 closes 2026-09-20; Wave 5 on 09-25; Demo Day at Token2049 in October.

- `verifyService()` attestation verification surfaced in the passport
- OpenSSF Model Signing interop so passports carry a standards-compliant signature
- Hosted inference against a fine-tuned adapter
- `authorizeUsage` developed into a model-licensing flow
- Full ERC-7857 compliance via `iTransferFrom` + a TEE oracle, against `0g-agent-nft`
