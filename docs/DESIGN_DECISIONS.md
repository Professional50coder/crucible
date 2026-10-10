# Design decisions

| Decision | Why | Trade-off |
|---|---|---|
| Anchor a hash on-chain; keep the manifest body on 0G Storage | Cheap, public, checkable with one `view` call | The manifest must be fetchable. Manifests #1 and #3 are on 0G Storage. |
| Canonical JSON (recursive key sort, no whitespace) before hashing | A verifier must reproduce the anchor byte for byte | Any change in serialisation rules breaks every existing anchor. |
| Acknowledge at +1 h after `Delivered`, not near the deadline | The provider settled run 1 after six hours, not 48 | Leaves less time for manual inspection before acknowledging. |
| Only ever `acknowledgeModel`; expose `acknowledgeDeliverable` as unlock | The legacy flow causes the Bug #4 locked queue | The unlock path has not been exercised against a real locked queue. |
| HTTP retrieval on win32 (`preferHttpRetrieval()`); SDK path kept elsewhere | The SDK bundles a Linux ELF binary and its TEE path is broken everywhere | Two retrieval paths to maintain. The transport streams and resumes dropped downloads (unit-tested; not yet run live against the indexer with a large file). |
| Refuse to acknowledge unless the re-derived root matches on-chain `modelRootHash` | Acknowledging an unverified artifact would forfeit the right to complain | A failed download blocks acknowledgement until retried. |
| Sentinel adapter hash, typed `sentinel` vs `onchain-verified` | `mint()` rejects zero; a sentinel says "no adapter" without looking like a real root | Passport #1 carries a hash that resolves to nothing, by design. |
| ERC-7857-*style*, not compliant | Passport lineage is public; there is no encrypted payload to re-encrypt | No oracle `transfer()` or `clone()`. |
| Solidity 0.8.19, `evmVersion: paris` | 0.8.19 is required for explorer verification and cannot emit `cancun` | Misses post-paris opcodes. |
| Web app runs on fixtures unless `NEXT_PUBLIC_CRUCIBLE_API_URL` is set | The demo must never depend on another service being up | The hosted job flow is not live. Disclosed in the UI and below. |
| `packages/ml`, orchestrator, web and contracts keep their own lockfiles | Dependency trees cannot collide | Root `npm test` covers only `packages/*` workspaces. |

