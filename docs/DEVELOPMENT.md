# Development guide

## Running locally

Prefer clicking? **[crucible-orpin.vercel.app](https://crucible-orpin.vercel.app/)**. The passport and gallery views read real on-chain values and need no wallet.

> [!NOTE]
> The hosted build runs with `NEXT_PUBLIC_CRUCIBLE_API_URL` unset, so **the job-launch flow serves an in-memory fixture store, not a live orchestrator.** The passport views are real; the job views are not. Point that variable at a running orchestrator to switch.

Requires **Node.js ≥ 22**. No GPU and no wallet are needed for discovery and validation.

```bash
git clone https://github.com/Professional50coder/crucible.git
cd crucible
npm ci && npm run build && npm test
npm run doctor -w @crucible/cli              # live network preflight, no key required
```

The root install covers `packages/core`, `packages/cli` and `packages/ml` (the `packages/*` workspace glob). `services/orchestrator`, `apps/web` and `contracts` each keep their own lockfile so their dependency trees cannot collide. Install from inside each:

```bash
cd services/orchestrator && npm ci
cd apps/web              && npm ci
cd contracts             && npm ci
```

Run the stack:

```bash
cd services/orchestrator && npm start     # :8787
cd apps/web && npm run dev                # :3000
```

Environment:

| File | Variables |
|---|---|
| `.env` (from `.env.example`) | `CRUCIBLE_NETWORK` (`testnet` \| `mainnet`), `PRIVATE_KEY`, `CRUCIBLE_API_URL` |
| orchestrator (read in `src/main.ts`) | also `CRUCIBLE_PORT`, `CRUCIBLE_HOST`, `CRUCIBLE_DATA_DIR`, `CRUCIBLE_POLL_INTERVAL_MS`, `CRUCIBLE_RPC_URL` |
| `apps/web/.env` (all optional) | `NEXT_PUBLIC_CRUCIBLE_API_URL`, `NEXT_PUBLIC_PASSPORT_ADDRESS_TESTNET`, `NEXT_PUBLIC_PASSPORT_ADDRESS_MAINNET`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| `contracts/.env` | `PRIVATE_KEY`, only to deploy or verify |

**Use a throwaway key.** `.env` is gitignored; keep it that way.


## Testing

No test needs a private key, funds or a live network. CI runs all of this on every push ([.github/workflows/ci.yml](../.github/workflows/ci.yml)).

```bash
npm ci && npm run build && npm test          # packages/core, packages/cli, packages/ml
cd services/orchestrator && npm ci && npm test
cd apps/web              && npm ci && npm test && npx next build
cd contracts             && npm ci && npx hardhat test
```

Counts from a clean clone, 2026-10-10 (Node 22.14, Windows 11):

| Package | Test files | Tests |
|---|---|---|
| `packages/core` | 11 | 180 |
| `packages/cli` | 5 | 94 |
| `packages/ml` | 15 | 320 |
| `services/orchestrator` | 15 | 245 |
| `apps/web` | 32 | 384 |
| `contracts` (Hardhat/Mocha) | n/a | 104 |
| **Total** | | **1,327** |

All passing; `next build` succeeds (9 routes). Notable suites: `storage-hash.test.ts` pins the Merkle root against known answers from the storage SDK; `no-deprecated-path.test.ts` guards against the legacy download flow; `adapter-provenance.test.ts` ensures a sentinel cannot publish as a real root; `Passport.test.js` covers lineage immutability through transfer. `datasets/edge-cases/invalid/` holds 11 malformed fixtures (BOM, CRLF, trailing commas, mixed formats and more).

## Deploying

**Contract.** From `contracts/`, with `PRIVATE_KEY` in `contracts/.env`:

```bash
npm run deploy:galileo                               # testnet, chain 16602
npm run deploy:mainnet                               # mainnet, chain 16661
npx hardhat verify --network galileo <DEPLOYED_ADDRESS>
```

Solidity is pinned to 0.8.19 with `evmVersion: paris`, and the explorer API is `/open/api`, not `/api`. Mainnet cost, measured 2026-08-26 at 4 gwei with Galileo-measured gas for identical bytecode: **0.008954 0G to deploy, 0.001311 0G to mint, 0.010265 0G total**. Manual verification fallback and the compiler-pin rationale: [contracts/README.md](../contracts/README.md).

**Web app (Vercel).** Root Directory must be `apps/web` (the root workspace glob `packages/*` does not reach the app), Framework Preset must be Next.js rather than `Other`, and Vercel Authentication must be off or every URL bounces to a login page. Set `NEXT_PUBLIC_PASSPORT_ADDRESS_TESTNET` to show the contract address, and `NEXT_PUBLIC_CRUCIBLE_API_URL` to leave fixture mode.

**Orchestrator.** `npm start` in `services/orchestrator` (runs `tsx src/main.ts`) with `PRIVATE_KEY` and `CRUCIBLE_NETWORK` set.
