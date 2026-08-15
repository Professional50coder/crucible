# Crucible — working plan

Live status, updated as each item lands. Ordered by what unblocks the most.
Wave 3 closes **2026-08-30 20:30**; treat **08-29** as the deadline.

`✅ done` · `🔄 in progress` · `⏳ next` · `⛔ blocked — needs the account owner`

Judged against [`submission/AKINDO_FORM_SPEC.md`](submission/AKINDO_FORM_SPEC.md), which lists
every form field and its acceptance test.

---

## Now

| # | Item | Status | Evidence / blocker |
|---|---|---|---|
| 1 | Public GitHub repo, real commit history | ✅ | [Professional50coder/crucible](https://github.com/Professional50coder/crucible) — 18+ commits |
| 2 | AKINDO team created | ✅ | [communities/nPmazde6Mtdag6vd](https://app.akindo.io/communities/nPmazde6Mtdag6vd) |
| 3 | `Passport.sol` deployed **and source-verified** on testnet | ✅ | `0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7`, block 49596815, verified `0.8.19`/`paris` |
| 4 | First passport minted, `verifyManifest` proven live | ✅ | tx `0xb608a8a5…00b3b1`; true for the real hash, false for a tampered one |
| 5 | Architecture / lifecycle / verification diagrams | ✅ | [`docs/diagrams/`](docs/diagrams) |
| 6 | Every AKINDO form field captured as a parameter | ✅ | `submission/AKINDO_FORM_SPEC.md` |
| 7 | **Connect GitHub on the AKINDO profile** | ⛔ | OAuth grant — only the account owner can do it. Blocks product creation |
| 8 | Frontend polish, then screenshots for the product gallery | 🔄 | gallery needs 1–5 images; diagrams cover 3, app screenshots pending |
| 9 | Product created and registered into the 3rd Wave | ⏳ | blocked by 7 |

## Next

| # | Item | Status | Note |
|---|---|---|---|
| 10 | Source-verify the contract on the explorer | ✅ | Root cause: 0G chainscan is a **Conflux-Scan** fork whose Etherscan-compatible API lives at `/open/api`, not `/api` — the old path returned the explorer's HTML shell. Testnet [verified](https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7#code); the mainnet URL is fixed too, so item 13 will verify with the same command |
| 11 | ~~Retry the stuck acknowledgement~~ — it was never stuck | ✅ | Re-queried the broker: task `10551604-…` reads `Finished`, settled 2026-08-14T17:19Z, fee 0.0118528 0G, zero pending deliverables. The retry loop succeeded ~6h after delivery, inside the window. **The first end-to-end run completed.** No adapter is held locally, which is why passport #1 keeps a sentinel adapter hash |
| 11b | Second run, keeping the adapter this time | 🔄 | task `3e385c46-f5dc-4e93-b713-63ab7a987ae3` created; watcher acknowledges via the TEE path on arrival. Gives passport #2 a real adapter root hash |
| 12 | Fund a mainnet wallet | ⛔ | needs real 0G. Owner action |
| 13 | Deploy + verify `Passport.sol` on mainnet 16661 | ⏳ | blocked by 12. **Hard Wave 3 requirement** |
| 14 | One real mint on mainnet | ⏳ | blocked by 13. "Explorer link showing on-chain activity" needs more than a deployment |
| 15 | Demo video ≤ 3:00 | ⏳ | script exists and is timed to 2:50 (`submission/DEMO_SCRIPT.md`) |
| 16 | Public X post with both hashtags and all three tags | ⏳ | drafts in `submission/X_POST.md`, all under 280 chars |
| 17 | Finalise the "Updates in this Wave" changelog | ⏳ | three chain placeholders left; delete any claim that did not land |

## Later, if time allows

| # | Item | Note |
|---|---|---|
| 18 | Host the passport gallery publicly | a judge clicking beats a judge cloning |
| 19 | Publish `FIELD_NOTES.md` as a standalone write-up | already most of a tutorial; serves the 10% communication score |
| 20 | Second real fine-tune, end to end, acknowledged in time | the honest version of the demo |

---

## Standing rules for this project

- Nothing is claimed as working that has not run. Every status here is checkable.
- Every network fact is executed against the live chain, then recorded with its transaction.
- Crucible proves **lineage, not honest training**, and says so in every document.
- Submit complete and late in the window rather than incomplete and early — resubmission is
  allowed until the deadline, but the mainnet deploy must not be left to the last day.
