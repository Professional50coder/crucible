# Status and roadmap

## Feature matrix

| Feature | Status | Where |
|---|---|---|
| Training-config validation (all five 0G rejection rules) | Done | `packages/core` |
| Dataset conversion and validation, 3 formats, mixed-format detection by line | Done | `packages/core`, `packages/cli` |
| Fee estimate from live on-chain price, reproduces 0G's worked example exactly | Done | `packages/core` |
| Canonical manifest + `keccak256` | Done | `packages/core` |
| `Passport.sol` deployed and source-verified on Galileo | Done | `contracts/` |
| Passports #1, #2, #3 minted | Done | `contracts/deployments/galileo-mints.json` |
| Auto-acknowledge daemon, proven end to end on Linux (run 3) | Done | `services/orchestrator` |
| HTTP retrieval + 0G Storage root check on Windows | Done | `services/orchestrator/src/retrieval.ts`, `storage-hash.ts` |
| Adapter-hash provenance types and guards | Done | `packages/core` |
| In-place recovery of failed runs | Done | `retrieveAndUpgrade()`, `POST /jobs/:id/retrieve` |
| `verifyService` attestation (signer + compose hash) in the passport | Done, Passport #3 | `tools/verify-attestation.mjs` |
| Lineage in 0G's Agentic ID (token #138) and ERC-8004 registry (agentId 420) | Done, testnet | `contracts/scripts/mint-agentic-id.js`, `tools/erc8004-register.mjs` |
| Dataset quality analysis (duplicates, leakage, PII) | Done, advisory | `packages/ml` |
| Live fine-tuning tasks created on Galileo (`Init → SettingUp → … → Delivered` in ~4 min) | Done, four times | `runs/` |
| 3D hero and passport seal: lazy client-only (`ssr: false`), static SVG fallback for no-WebGL and reduced motion; passport values still server-render | Done | `apps/web` |
| Windows end to end through `POST /jobs` and the daemon | Open | |
| Streaming + `Range` resume in the retriever transport (>60 MB) | Built and unit-tested; no live large-file run of the in-code resume recorded | `retrieval.ts`, `retrieval-resume.test.ts` |
| Signed passport envelope (DSSE / in-toto, ed25519): `crucible keygen`, `sign`, `verify-envelope`, and the `/verify` web page | Done, unit-tested; not run in a real browser; `model-signing` CLI interop untested | `packages/core/src/dsse.ts`, `packages/cli`, `apps/web/src/app/verify` |
| Usage licensing page over `authorizeUsage` / `revokeAuthorization` | Done, reads need no wallet | `apps/web/src/app/license` |
| `crucible init` starter scaffold | Done, unit-tested | `packages/cli`, [BUILDER_KIT.md](BUILDER_KIT.md) |
| Full TDX quote validation via `dstack-verifier` | Open | |
| Mint from the web app | Open | Passports were minted by script |
| Orchestrator upload path on the storage SDK (not the bundled binary) | Open | |
| Automatic sub-account funding | Not implemented | |
| Mainnet (16661) deployment | Open | |

## Roadmap

Everything below is **planned**, not shipped. Milestone-level history is in [ROADMAP_MILESTONES.md](ROADMAP_MILESTONES.md) and [../.paul/ROADMAP.md](../.paul/ROADMAP.md).

1. **Mainnet deploy (chain 16661).** About 0.0103 0G of gas, measured against Galileo gas for identical bytecode. Blocked on funding the deploy wallet, not on code. Nothing is deployed on mainnet today.
2. **Windows end to end through the product.** Carry the Passport #3 flow through `POST /jobs` and the daemon, and move the orchestrator's dataset upload onto `@0gfoundation/0g-storage-ts-sdk` instead of the bundled binary.
3. **A live large-file run** of the in-code resumable retriever against the real indexer.
4. **Full TDX quote validation** via `dstack-verifier`, so `attestationVerified` covers all three checks.
5. **Mint from the web app.** All passports so far were minted by script.
6. **Live wiring of the hosted app** (`NEXT_PUBLIC_CRUCIBLE_API_URL`) and a one-call `GET /verify/:id` route.
7. **Field notes upstream** as a 0G docs contribution.

Longer term: hosted inference against fine-tuned adapters; fuller ERC-7857 and ERC-8004 alignment if 0G signals a canonical path; org accounts and private passports; steps toward proof of honest training.
