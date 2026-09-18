# Crucible — Detailed Milestones Wave 4 & Wave 5

**How each milestone helps and shapes the 0G community.** Source of truth for AKINDO Milestone fields. Every claim below is checkable against the repo or the live chain.

---

## Wave 4 — 2026-08-31 → 2026-09-20 20:30 (3 weeks) — Make it usable on mainnet

### Objective
Land the Wave 3 hard requirement honestly and remove the two places a new builder currently loses a day or a model. Compute stays on Galileo (cost), Chain moves to mainnet (value) — exactly the FAQ split `submission/CHECKLIST.md:38`.

> **Progress — landed 2026-09-18 (`wave4-improvements`).** Three tracks are already in, re-run against the live network this session; the plan below is now partly done.
> - **DEFECT-01 fixed** (part of B): `HttpModelRetriever` retrieves the delivered model on Windows over plain HTTP (`GET {indexer}/file?root=<modelRootHash>`) and re-derives the 0G Storage Merkle root (`services/orchestrator/src/storage-hash.ts`) before acknowledging — no bundled Linux binary. Win32-verified 2026-09-18 (manifest root `0xc757a7e6…e1140`, exact match). Adapter-hash provenance typed; failed runs upgrade in place via `retrieveAndUpgrade()` / `POST /jobs/:id/retrieve`. Commit `5e089f4`. Answers judge notmartin. *(Note: this fixed the download/retrieval path; moving the orchestrator's upload path onto the storage SDK, as B describes, is a separate item still to do.)*
> - **ERC-8004 registered on Galileo testnet**: Passport #1's manifest registered in the live Identity Registry `0x8004A818…BD9e` as agentId 420, six lineage writes read back byte-equal (register tx `0x2a2e86d0…d2c85a`, block 55,445,626, commit `55d1f32`). **Registered, not verified**; no mainnet write. Detail: `docs/ERC8004.md` §7.
> - **3D UI**: react-three-fiber hero + passport seal, `ssr:false` so on-chain values still server-render, SVG fallback. Commit `a709f33`. `apps/web` 342→349 tests, next build green.
> - **Still open:** A (mainnet deploy + mint), the C/D/E items below, and `verifyService()` (`attestationVerified` still `false`).

### Deliverables & Technical Approach

#### A. Passport.sol on 0G Mainnet (16661) — source-verified + activity
- Deploy `contracts/contracts/Passport.sol:25` with `Solidity 0.8.19 / paris / 200` via `contracts/hardhat.config.js:49` where `apiURL: https://chainscan.0g.ai/open/api` (not `/api` — `hardhat.config.js:82` proven on Galileo).
- Cost measured 2026-08-26 at 4 gwei: deploy `0.008954` + mint `0.001311` = `0.010265 0G` (~$0.0016) `submission/WAVE3_CHANGELOG.md:280`. Fund throwaway `0xD682...` with `0.02 0G`, run `npm run deploy:mainnet` from `contracts/`, verify via `getsourcecode` (expects `ContractName Passport`, 78,649 chars).
- Mint 2 passports from paid runs: `3e385c46…` adapter `93,642,469` bytes root `0x40a5f256…` + sentinel `keccak256("crucible:adapter-not-retrieved:10551604…")` for lost run. Explorer `https://chainscan.0g.ai/address/<mainnet>` shows deployment + mints. Update `README.md:17`, `submission/CHECKLIST.md:112`, flip AKINDO Product type `Prototype → Functional` `submission/AKINDO_FORM_SPEC.md:51`.

#### B. Real end-to-end via the product (not a script)
- Path today breaks on Windows: `broker.uploadDataset()` spawns `binary/0g-storage-client` ELF `docs/FIELD_NOTES.md:399`, `uploadDatasetToTEE()` throws `window is not defined`. Fix: move `services/orchestrator` upload to `@0gfoundation/0g-storage-ts-sdk` `ZgFile.fromFilePath → merkleTree → indexer.upload` already proven `docs/FIELD_NOTES.md:417` with root `0xa5051ae7…9e7dbfd` tx `0xc38e41…`.
- Flow: `POST /jobs` → `services/orchestrator/src/submitter.ts` → poller `services/orchestrator/src/poller.ts` → `acknowledgeModel` `services/orchestrator/src/acknowledger.ts` with `downloadMethod:auto` (Storage first, TEE fallback) → `Finished` (~60s, `second arg must be public key` if early) → `packages/core/src/passport.ts` canonicalize (recursive sort, no whitespace) → `keccak256` → store manifest on Storage → mint. Record in `runs/run4-mainnet.json` like `runs/run3-daemon.json` (delivered `08:53:57Z` → ack `09:56:05Z` tx `0x4e2c81…` block `49716408`).

#### C. Live wiring — retire mock badge
- Set `NEXT_PUBLIC_CRUCIBLE_API_URL` in Vercel, root cause `submission/CHECKLIST.md:219` (Root Dir, Preset Other, Auth). `/new` validation uses `packages/core/src/convert.ts` (16 tests, `instruction↔chat` byte-exact, `text→*` refused), fee from live `pricePerToken` + reserve. `/jobs` SSE live states `Init→Finished`, `/passport/[id]` renders `verifyManifest` links. Add `GET /verify/:id` — fetch indexer `file?root=`, hash, `eth_call` — one curl verification.

#### D. Attestation earned
- Today `tee.attestationVerified: false` everywhere `submission/ARCHITECTURE.md:194`. `tools/verify-attestation.mjs` already passes 2/3: signer `0x24135b4B…` matches on-chain, compose `8779f38c…` matches event log `docs/FIELD_NOTES.md:144`. Run `dstack-verifier:0.5.4` container for TDX quote + RTMR replay + OS hash, set field `true` with stated checks.

#### E. Community artifact
- Ship `docs/FIELD_NOTES.md` as 0G docs PR: 15 defects, 6 doc corrections (3 0G min 30× `docs/FIELD_NOTES.md:360`, `cancun` impossible at `0.8.19` `hardhat.config.js:37`, `/api`→`/open/api`, Agentic ID selectors missing `docs/AGENTIC_ID_ALIGNMENT.md`). Add 2 MIT datasets `datasets/` slice, publish `docs/CLAIMS_AUDIT.md` as tutorial.

### How It Helps & Shapes Community

| Pain today | After Wave 4 | Community shape |
|---|---|---|
| **Silent 30% forfeit** — 48h deadline, no notification, provider settles in ~6h not 48h (`README.md:192`). First run lost `0.00355584/0.0118528` exactly 30% `docs/FIELD_NOTES.md:536`. | Daemon `services/orchestrator/src/clock.ts` auto-acks at `+1h` (47h margin) + `+36h` fallback, tested via clock abstraction (21 tests). | Every solo builder keeps model + fee; support channel stops answering same loss. |
| **Windows unusable** — ELF binary + TEE `stream.on` fail `docs/FIELD_NOTES.md:399`. | Pure-JS Storage SDK, no binary, works win32/Linux/WSL. | Unlocks ~68% Windows devs in 0G Discord; copy-paste `doctor` preflight works first try. |
| **Mainnet feels expensive** — SDK guard says 3 0G, faucet 0.1/day → 30 days. | Real cost `0.010265 0G` ~1.6 cents, rehearsed `balance:0.0` halt. One-line deploy script. | Builders deploy identity primitive for cents, not 30 days; mainnet gallery grows, judges see real activity not testnet proxy. |
| **Docs vs network diverge** — 6 contradictions cost hours each. | `FIELD_NOTES.md` filed as PR, each with `eth_call`/`curl` repro. | Next wave of 200 builders onboards in hours not days; 0G docs become source of truth, reducing Discord load. |

**Metrics:** 2 mainnet passports verifiable `verifyManifest` true/false, 1 Windows end-to-end record `runs/run4-mainnet.json`, 3 external `FIELD_NOTES` PR comments.

---

## Wave 5 — 2026-09-21 → 2026-09-25 20:30 (+ Demo Day 7-8 Oct Token2049) — Make it composable

### Objective
Turn a certificate you check into a primitive other apps build on — licensing, inference, standards.

### Deliverables

#### A. OpenSSF Model Signing v1.0 interop
- `packages/core` emits DSSE envelope alongside `keccak256` — sign canonical manifest with throwaway key, verify via `model-signing` CLI. Passport stores `manifestRootHash` + `dsseEnvelope`. HF Model Card emitter (`ARCHITECTURE.md:168` already `base_model_relation: adapter`) carries both hashes. Verifier needs no 0G RPC.

#### B. Hosted inference — adapter is alive
- Deploy Wave 4 LoRA on 0G inference provider `inference.listServiceWithDetail()` `docs/FIELD_NOTES.md:62` (H200, 1 task queue `occupied`). `apps/web/src/app/inference/[passportId]/page.tsx` loads base `Qwen2.5-0.5B` + adapter via PEFT + CUDA torch, prompt→completion with passport link. Proves 93.6 MB is not dead hash. Note storage reserve `0.01 0G` for 0.5B vs `0.09` for 32B `FIELD_NOTES.md:218`.

#### C. Licensing via `authorizeUsage`
- `contracts/contracts/Passport.sol:413` `authorizeUsage(tokenId, executor, permissions)` capped `MAX_AUTHORIZED_PER_TOKEN=100`, cleared on transfer `Passport.sol:538` O(1) epoch bump. Build `/license` — owner grants `executor` with opaque `permissions` JSON `{"inference":true,"commercial":false}`, `revokeAuthorization`, `isAuthorized` view. Demo: 2 agents trade `token #2` rights without transfer — the ERC-7857 pattern without oracle re-encryption (public passport has nothing to re-encrypt).

#### D. Full ERC-7857 + ERC-8004 alignment
- Implement `iTransferFrom` + TEE oracle `docs/ERC8004.md:109` only if 0G signals canonical. Today Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` `name:AgentIdentity` live, Reputation live, Validation missing (under discussion). Keep anchored to official registry `0x2700F6A3…` token `138` tx `0x6e38a4…` `WAVE3_CHANGELOG.md:290` — `getIntelligentDatas(138)=0x0f46406e…` → `verifyManifest(2,…) true`. Document table `docs/AGENTIC_ID_ALIGNMENT.md` stays honest: `ERC-7857-style`.

#### E. Builder kit & Demo Day
- `create-crucible-app` `npx` template: `core` rules + `crucible doctor/validate/convert` `packages/cli` + verify script. Reshoot video `submission/DEMO_SCRIPT.md:1` on **mainnet** (clip `mainnet` chip exactly once to say not deployed → new clip with address). Update `submission/WAVE3_CHANGELOG.md` placeholders `PLACEHOLDER_MAINNET_CONTRACT_ADDRESS`. X thread `submission/X_POST.md` (271 chars) + gallery 5 images `submission/gallery/`.

### How It Shapes Community

- **Marketplace primitive:** 100-auth cap + transfer-clear is the licensing layer every model market re-impls. `isAuthorized(tokenId, executor)` `Passport.sol:475` is a `view` — agents check rights before paying inference, no backend. Enables autonomous agent trade.
- **Portability:** DSSE + `verifyManifest` lets HF, EAS, Conflux verifiers check lineage without 0G RPC — expands from 200 0G builders to 2M HF users. Community can fork passports to Base/Arbitrum with same hash.
- **Honest frontier:** Roadmap cites ZK PEFT circuits `README.md:254` arXiv `2510.16830` but keeps `README.md:243` caveat `Lineage, not honest training`. Builds trust vs hype — judges reward disclosed limits `CHECKLIST.md:177`.
- **Compounding docs:** Wave 4 PR + kit + `AGENTIC_ID_ALIGNMENT.md` defect #15 (mint selector empty `execution reverted`) become 0G's onboarding canon. Next builder runs `npx create-crucible-app` → `doctor` → deploys in 10 min.
- **Ecosystem flywheel:** Inference demo + licensing + mainnet gallery → Demo Day Token2049 Singapore story "two runs, one variable, fixed upstream" — others build validators, explorers, compliance checkers on `PassportData` `Passport.sol:43` typed fields.

**Metrics:** 3 external mainnet mints, 50+ `verifyManifest` calls, 1 community template PR merged, 1 inference endpoint live.

---

## Copy-Paste for AKINDO

Use sections above verbatim for `Milestone 4th Wave` and `Milestone 5th Wave` fields. Keep `Updates in this Wave` to the compressed 2,912-char version in `submission/WAVE3_CHANGELOG.md` (paste markers) — 40% rubric reads that field.
