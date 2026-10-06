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

## M4 — Verify anywhere ✅
`crucible keygen`, `sign` and `verify-envelope` in `packages/cli`: sign a manifest into a DSSE
envelope and check it against a public key and an optional on-chain anchor, offline. *Check:*
`packages/cli/test/envelope.test.ts` (10 tests, 84 CLI total); run as a real process on
`runs/manifest-1.json` — the envelope verifies and `--expect` passes against the anchor recorded in
`contracts/deployments/galileo-mints.json`, while a wrong anchor exits 1. **Not done:** adding the
envelope to the web passport export.

## M5 — Honest sample-data disclosure ✅
A plain-language notice on the hosted site wherever a record is a demo, visible at every width.
*Check:* `apps/web/src/components/SampleNotice.test.tsx` (3 tests, including that no engineering terms appear); typecheck clean. Shown site-wide only when the app has no live backend; uses the same "on chain" / "demo" words as the record badges. **Not yet viewed** on the deployed site after release.

## M5b — Verify in the browser ✅
A `/verify` page: paste a signed envelope, the signer's public key and (optionally) the hash anchored
on chain, and check it on your own device with WebCrypto — no wallet, no RPC, nothing sent anywhere.
*Check:* `apps/web/src/lib/envelope-verify.test.ts` (7 tests; the envelope is signed with Node's
crypto the way `@crucible/core` signs, so the two implementations are proven to agree) and
`apps/web/src/app/verify/verify.test.tsx` (4 tests); typecheck clean. **Not yet checked:** a run in a
real browser. Ed25519 in WebCrypto needs a current Chrome, Edge, Safari or Firefox; older browsers
get a plain message rather than a wrong answer.

## M6 — Builder kit ✅
`crucible init <dir>` scaffolds a starter project (valid chat dataset, standard config, placeholder
`.env.example`, `.gitignore`, README); `docs/BUILDER_KIT.md` walks through every CLI command.
*Check:* `packages/cli/test/init.test.ts` (generated dataset and config pass the real validators, no
key-like strings, non-empty target refused, `parseArgs` handles `init`) plus `cli.test.ts`, run alone;
`tsc --noEmit` clean. Not verified: the `init` file I/O in `index.ts` was not run end to end, and no
fresh-clone walkthrough was executed, so the doc is checked against the usage text, not by running it.

## M7 — Standalone write-up ⏳
Publish `FIELD_NOTES.md` as a self-contained tutorial (retrieval defect, fix, resume, signing).

## M8 — Mainnet (queued) ⛔
Deploy + verify `Passport.sol` on 16661, one real mint. Blocked only on funding the deploy wallet.
Everything above is independent of it.

## Cadence
One milestone = one branch = one PR, tests green, `TODO.md`/`CHANGELOG.md` updated, honest status.
