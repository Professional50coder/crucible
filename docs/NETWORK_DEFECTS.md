# Defects found against the live network

Fourteen findings from four days against the live network. Severity: **S1** costs money or an artifact · **S2** blocks a documented path · **S3** wrong or missing documentation · **S4** cosmetic. A fifteenth, the Agentic ID documented selectors missing from the deployed bytecode, is in [docs/AGENTIC_ID_ALIGNMENT.md §3](AGENTIC_ID_ALIGNMENT.md).

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 01 | S1 | **The SDK's `acknowledgeModel` cannot retrieve a model on Windows/Node 22: two separate defects.** The **TEE path fails on every platform**: `stream.on is not a function` at 0 bytes, every attempt, then HTTP 429. The **0G Storage path fails only on Windows**: `spawn …/binary/0g-storage-client ENOENT`, because the bundled client is `ELF 64-bit LSB executable … for GNU/Linux`. Since `'auto'` tries storage then falls back to the TEE, a Windows user on the SDK path hits both and loses the model. **Resolved 2026-09-18 (`5e089f4`)**: `HttpModelRetriever` bypasses the SDK, re-derives the 0G Storage Merkle root, refuses on mismatch; `preferHttpRetrieval()` selects it on win32. Failed runs upgrade in place via `retrieveAndUpgrade()` / `POST /jobs/:id/retrieve`, sentinel to onchain-verified, no duplicate passport. | Isolated by running identical code from WSL2: 93.6 MB downloaded, validated, `acknowledged: true`; Windows: `acknowledged: false`, 30% debited. Fix verified on win32: Passport #1 manifest downloaded over HTTP, root recomputed to `0xc757a7e6…e1140`, exact match; then Passport #3 end to end. |
| 02 | S1 | **The provider settles long before the 48-hour window closes**, six hours in my case. | Delivered 11:18:42Z, settled 17:19:27Z |
| 03 | S2 | **The SDK demands 3 0G to create a ledger on every network.** `addLedger()` applies a hardcoded client-side guard; `LedgerManager.MIN_ACCOUNT_BALANCE()` reads **0.1 0G** on testnet. A 30x overstatement. True cost of the funded ledger and sub-account: 0.15 0G. | One `eth_call` |
| 04 | S2 | **`getLockedTime()` returns 86400 (24 h) and is the *refund* lock, not the acknowledge window.** Read it as the 48-hour deadline and your daemon fires at the wrong time. | SDK source, `service.js` |
| 05 | S2 | **0G's docs ask for Solidity 0.8.19 *and* `evmVersion: cancun`, which are mutually exclusive.** solc added cancun in 0.8.24. `paris` is the highest available and verified first try. | `Invalid EVM version requested (HH600)` |
| 06 | S2 | **`hardhat verify` cannot reach the explorer at the documented path.** chainscan's Etherscan-compatible API is at **`/open/api`**, not `/api`. The wrong path returns HTML, so the error surfaces as a JSON parse failure. | `/api` → `text/html`; `/open/api` → `application/json` |
| 07 | S3 | **Storage Scan has no route keyed by root hash.** `/file/<rootHash>` returns 404. The human page is `/submission/<txSeq>`. | Verified live; fixed in `packages/core` |
| 08 | S3 | **Duplicate uploads do not revert on `0g-storage-ts-sdk@1.2.11`.** The official example warns of a `CALL_EXCEPTION`; a second submission was accepted and charged again. | Submissions 146937 and 146938, same root |
| 09 | S3 | `fine-tuning-example/.env.example` says *"Mainnet — fine-tuning not yet available."* It is available, and cheaper: 500 vs 800 neuron/token. | Provider live on both |
| 10 | S3 | The docs' config template uses `max_steps: 3`; the shipped working config uses `45`. | Both in-repo |
| 11 | S3 | `transfer-fund` without `--service fine-tuning` routes to the *inference* sub-account. The failure surfaces later as `MinimumDepositRequired`. | 0G's docs |
| 12 | S3 | Decrypting before `Finished` fails with `second arg must be public key`. | Observed |
| 13 | S4 | `checkverifystatus` returns `"Pending in queue"` for **any** GUID, including invalid ones, and `hardhat-verify` polls it uncapped, so the CLI hangs forever. | Confirm with `getabi` instead |
| 14 | S4 | The explorer reports `LicenseType: None` for standard-JSON-input verification even with an SPDX line. | Cosmetic |

Findings 03–06 and 09–10 correct 0G's own published material. Full write-ups with commands: [docs/FIELD_NOTES.md](FIELD_NOTES.md).

