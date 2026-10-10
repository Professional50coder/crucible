# Threat model

What a Crucible passport lets a stranger conclude, what it does not, and where the trust boundaries sit. Every statement is traceable to code in this repository or to a recorded run; where something is an inference from the code rather than an observed event, it says so.

## Assets and claims

A passport makes one claim: **"this model artifact came out of this 0G fine-tuning task, trained on this dataset root, with this config, and here is the manifest that says so."** The claim is a `keccak256` over a canonical JSON manifest, anchored by `Passport.sol` and recomputable with `crucible verify` or `tools/verify-manifest.mjs`.

## Trust boundaries

| Party | Trusted for | Not trusted for |
|---|---|---|
| 0G Chain (Galileo 16602) | Holding the anchor immutably; answering `verifyManifest` | Nothing about training honesty |
| 0G Storage | Serving manifest and adapter bytes | Nothing: bytes are re-hashed against the on-chain root before use |
| 0G Compute provider (Intel TDX / dstack) | Running the task it was paid for | Not proven: that it ran the epochs it claims (see below) |
| Storage indexer gateway | Availability only | Content. `HttpModelRetriever` re-derives the Merkle root and refuses on mismatch |
| This repository / the hosted app | Convenience | Correctness of any passport. A verifier needs only the chain and 0G Storage |
| Passport minter | Nothing | See "Permissionless mint" |

## What an attacker can and cannot do

| Attempt | Outcome | Basis |
|---|---|---|
| Edit a manifest after minting | Detected: the hash no longer matches; `verifyManifest` returns `false` and `crucible verify --expect` exits 1 | `docs/sample/verify-transcript.txt`; `Passport.test.js` |
| Change lineage fields on the token after minting, including through transfer | Not possible: lineage is immutable after `mint` | `Passport.test.js` (lineage immutability through transfer) |
| Mint a second passport for the same fine-tune | Rejected with `DuplicateLineage` on the `(dataset, config, adapter)` triple | `Passport.sol`, `lineageKey` |
| Publish a placeholder as a real adapter root | Blocked in the core: adapter hashes are typed `sentinel` or `onchain-verified` and guarded | `adapter-provenance.test.ts` |
| Serve a corrupted model from a gateway | Refused before acknowledging: re-derived 0G Storage root must equal the on-chain `modelRootHash` | `retrieval.ts`, `storage-hash.test.ts` |
| Forge a signed envelope | Fails: ed25519 over DSSE PAE, then manifest re-hash, subject digest check and optional on-chain binding | `packages/core/src/dsse.ts`, `envelope.test.ts` |
| Keep a seller's usage grants after a transfer | Not possible: all authorizations clear on transfer; at most 100 per token | `Passport.sol`, `Passport.test.js` |
| Make the daemon acknowledge a bad artifact | Not possible by design: it acknowledges only against a matching root | `retrieval.ts` |

## Known limits

1. **Permissionless mint.** `Passport.mint` can be called by anyone (the contract documents this as deliberate: a mint is a public claim and the proof lives in the manifest). An unrelated address can therefore mint a passport whose manifest points at someone else's task. The chain does not check that the task exists or that the minter owns it. A reader must verify the manifest contents (task id, provider, roots) against 0G, not merely that `verifyManifest` returns `true`. From the same code, an attacker who learns a lineage triple before the owner mints could occupy it (`DuplicateLineage`). That is an inference from the contract, not an observed event.
2. **Lineage, not honest training.** Nothing proves the provider ran the epochs it claimed. That needs proofs over the training computation, which this project does not attempt.
3. **`attestationVerified: true` means two checks, not three.** TEE signer and compose hash match on-chain. Intel TDX quote validation, RTMR event-log replay and OS image measurement via `dstack-verifier` are not run. Passports #1 and #2 carry `false`, immutably.
4. **Signatures prove authorship, not truth.** `crucible sign` shows who signed a manifest. The sample envelope in `docs/sample/` is signed by a throwaway demo key; its private half was discarded and it vouches for nothing but the demonstration.
5. **Passport #1 has no real adapter.** Its adapter field is an explicit sentinel (`keccak256("crucible:adapter-not-retrieved:<taskId>")`).
6. **One provider per network.** 0G exposes a single fine-tuning provider per network with a single-task queue; Crucible cannot route around it.
7. **ERC-7857-style, not compliant.** `authorizeUsage` is implemented; oracle re-encrypting `transfer()` and `clone()` are not.
8. **Testnet only.** Nothing is deployed on mainnet (16661). `contracts/deployments/` contains only Galileo records.
9. **The hosted job flow is fixture-backed.** Passport views read the chain; job views do not.
10. **Contract audit.** `Passport.sol` has 104 passing Hardhat tests but has not had an independent security audit. Do not anchor anything of value to it.

## Operational security

- `PRIVATE_KEY` is read from `.env` (gitignored) by the orchestrator and by deploy/mint scripts. Use a throwaway key. No test reads a key.
- Quality-scan findings (PII, secrets) cross into the job record as counts, types and line numbers only, never the matched text.
- The orchestrator binds to `127.0.0.1` by default (`CRUCIBLE_HOST`); it has no authentication, so do not expose it publicly without a reverse proxy that adds some.
- Dependency posture: lockfiles are committed for every package; CI installs with `npm ci`.
