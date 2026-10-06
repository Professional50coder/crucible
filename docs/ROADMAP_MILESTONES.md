# Crucible — milestone roadmap

Built to keep shipping real, checkable progress every wave without waiting on any one blocker.
The 0G Bridge scores **progress and momentum (40%)**, so each milestone is a small, finished,
tested increment — not a promise.

Rules: nothing is claimed that has not run; each milestone lists how it is checked; mainnet items
are queued behind funding but nothing else waits for them.

`✅ done` · `🔄 in progress` · `⏳ next` · `⛔ needs account owner / funds`

## M1 — Robust retrieval ✅
Streaming + resumable model download (`Range`), on-chain root still re-derived before anything is
acknowledged. *Check:* `services/orchestrator/test/retrieval-resume.test.ts`, 245 orchestrator tests.

## M2 — Portable signature ✅
DSSE envelope (in-toto Statement, ed25519) over the canonical manifest; verifiable with a public key
and no 0G RPC; bindable to the on-chain keccak256. *Check:* `packages/core/test/dsse.test.ts`.
Not a Sigstore bundle; `model-signing` CLI interop unverified.

## M3 — Licensing ✅
Turn a certificate into a primitive: a `/license` page over `authorizeUsage` / `revokeAuthorization` /
`isAuthorized` / `permissionsOf` / `authorizedExecutors`, with a pure, tested permissions codec.
*Check:* `apps/web/src/lib/license.test.ts` (15 tests); web suite 370 pass; `next build` green with `/license`; live Galileo reads (`ownerOf`, `authorizedCount`, `authorizedExecutors`) verified for tokens 1-3. **Not yet exercised:** a real grant/revoke transaction from the owner wallet.

## M4 — Verify anywhere ⏳
`crucible verify-envelope` in `packages/cli`: check a DSSE envelope against a public key and an
optional on-chain anchor, offline. Add the envelope to the passport export. *Check:* CLI tests.

## M5 — Honest sample-data disclosure ⏳
A plain-language notice on the hosted site wherever a record is a demo, visible at every width.
*Check:* component tests; no engineering internals shown to users.

## M6 — Builder kit ⏳
`crucible doctor / validate / convert` polished and documented as a template others can start from.
*Check:* CLI tests; a fresh-clone walkthrough that runs.

## M7 — Standalone write-up ⏳
Publish `FIELD_NOTES.md` as a self-contained tutorial (retrieval defect, fix, resume, signing).

## M8 — Mainnet (queued) ⛔
Deploy + verify `Passport.sol` on 16661, one real mint. Blocked only on funding the deploy wallet.
Everything above is independent of it.

## Cadence
One milestone = one branch = one PR, tests green, `TODO.md`/`CHANGELOG.md` updated, honest status.
