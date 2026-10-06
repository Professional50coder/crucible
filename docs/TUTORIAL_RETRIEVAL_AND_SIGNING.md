# Retrieving a model on Windows, and signing its passport

A self-contained walkthrough of two things Crucible does that you can reuse:

1. Getting a delivered fine-tuned model out of 0G Storage on Windows, and refusing it unless it matches the on-chain root.
2. Signing a Model Passport manifest so someone with no 0G access can check who signed it.

Every file and command named here exists in this repository. Where something was not run, the text says so.

## 1. The problem

After a 0G fine-tuning task reaches `Delivered`, the SDK's `acknowledgeModel` is supposed to download the model and acknowledge it on chain. 0G's documentation says this must happen within 48 hours, and that missing it costs 30% of the task fee (quoted in the README, in the section on the 48-hour window).

With `@0gfoundation/0g-compute-ts-sdk@0.9.0` there are two download paths, and on Windows neither works (docs/FIELD_NOTES.md; README finding 01):

| Path | Failure | Where |
|---|---|---|
| `tee` | `stream.on is not a function` at 0 bytes, then HTTP 429. Same on Windows and on WSL2 Linux. | every platform |
| `0g-storage` | `spawn .../binary/0g-storage-client ENOENT`. The bundled client is `ELF 64-bit LSB executable ... for GNU/Linux`, so it cannot run on win32. | Windows only |

`downloadMethod: 'auto'` tries 0G Storage first and falls back to the TEE path, so a Windows user hits both failures. That is how task `10551604` was lost: the artifact was never acknowledged (see CHANGELOG.md, and token 1 in `contracts/deployments/galileo-mints.json`, whose manifest note reads "adapter not retrieved; acknowledgeModel failed on Windows (ENOENT) then HTTP 429").

The documented workaround was to run the acknowledgement from Linux or WSL2 with `downloadMethod: '0g-storage'` (docs/FIELD_NOTES.md). Passport #2 was produced that way (`retrievalPlatform: wsl2-linux` in the same JSON file).

## 2. The fix: download over HTTP, re-derive the root, compare to the chain

`services/orchestrator/src/retrieval.ts` defines `HttpModelRetriever`. It does not use the SDK's download at all:

1. `retrieve({ network, rootHash, destPath })` rejects any `rootHash` that is not `0x` plus hex.
2. It downloads `GET {indexer}/file?root=<rootHash>` from the indexer URL in `NETWORKS[network].indexerUrl` (overridable through `indexerUrls`). No binary is spawned.
3. It rejects an empty body.
4. It computes the 0G Storage Merkle root of the bytes with `zgStorageRoot` from `services/orchestrator/src/storage-hash.ts` and compares it, case-insensitively, with the `rootHash` you asked for. A mismatch throws `Downloaded artifact FAILED validation ... refusing to acknowledge.`
5. Only after that does it create the directory and write `destPath`.

The `ModelRetriever` interface states the contract: implementations must throw rather than return unvalidated bytes.

### Why the gateway is convenient but untrusted

The indexer gateway is a third-party HTTP server; whatever it returns is just bytes. The root hash that the provider committed on 0G Chain is the authority. The Merkle root is a function of the content, so bytes that reproduce it are the committed artifact, and bytes that do not are not, whoever served them. The gateway can be slow, down or wrong, and the worst outcome is a refusal.

`storage-hash.ts` documents that its root derivation follows the 0G Storage SDK's `AbstractFile.merkleTree()` (v1.2.11); its tests are in `services/orchestrator/test/storage-hash.test.ts`.

### Platform selection

`preferHttpRetrieval(platform, downloadMethod)` returns true only on `win32`, and false when the caller explicitly asked for `tee`. On other platforms the SDK path is left in place and HTTP remains available as a fallback.

### Recorded evidence

- Passport #3 (task `d06d00e2-965b-430c-bf46-4d6444ee1c47`) was retrieved, acknowledged and minted on native Windows: a 93,642,471-byte adapter, root re-derived and matched. Records: `runs/run4-e2e.json`, `runs/run4/retrieval.json`; narrative in CHANGELOG.md and `submission/WAVE4_CHANGELOG.md`.
- That run was driven by the `tools/run4-*` scripts calling the real retriever and validation. Carrying the same flow through `POST /jobs` and the daemon on Windows has not been run (`submission/WAVE4_CHANGELOG.md`).

## 3. Resilience: streaming and Range resume

On Windows the 93 MB download in run 4 died on its first attempt at 61,351,230 bytes (schannel "server closed abruptly"). In run 4 the resume came from a curl `fetchImpl` handed to the retriever. Older entries in docs/FIELD_NOTES.md, the 0.5.0 CHANGELOG entry and the Wave 4 changelog still say the in-code retriever does not stream or resume; that was true on their dates, and the 0.6.0 CHANGELOG entry records that it now does. Behaviour (private method `#download`):

- The body is read as a stream, and chunks are kept as they arrive, so a dropped connection keeps its progress.
- On failure the next attempt sends `Range: bytes=<received>-`.
- A `206` response continues from the offset. A `200` means the server ignored the range, so the buffer is discarded and the download restarts from zero rather than splicing.
- A `416` when bytes are already held is treated as "already have everything".
- HTTP 5xx and 429 are retried. Other non-2xx statuses (404, for example) fail immediately.
- Defaults: 8 attempts (`maxAttempts`), backoff `min(500 * 2^(n-1), 8000)` ms. Both are injectable, as are `fetchImpl` and `sleep`.
- After the final attempt it throws, reporting the byte count reached.
- Whatever was assembled still goes through the root check from section 2. Resume only affects how bytes arrive. Bytes are held in memory until validated, then written once, so an unvalidated file is never written to `destPath`.

Tests: `services/orchestrator/test/retrieval-resume.test.ts` covers resume with a Range request after a mid-stream drop, restart when the server answers 200 to a Range request, a resumed download whose bytes miss the on-chain root still being refused, giving up after `maxAttempts` with progress reported, no retry on 404, and retry on 503. They use injected fetch and hasher functions. A live run of the in-code resume against the real indexer is not recorded in this repo, and README rows that list streaming and resume as open appear to predate the change.

## 4. Portable signing

The on-chain anchor is `keccak256` of the canonical manifest. Checking it needs a way to read 0G Chain. `packages/core/src/dsse.ts` adds a second, offline check: a signature over the same manifest.

### What the file implements

- Envelope: DSSE v1. `pae()` builds the pre-authentication encoding `DSSEv1 <len(type)> <type> <len(body)> <body>`. Payload type `application/vnd.in-toto+json`.
- Payload: an in-toto Statement v1 (`https://in-toto.io/Statement/v1`) with predicate type `https://crucible.0g/passport-lineage/v1`. The subject digest is the sha256 of the canonical manifest. The predicate carries the manifest, its `keccak256` anchor, and the canonicalization name `crucible-sorted-json-v1`.
- Signature: ed25519 over the PAE. `keyid` is the sha256 of the DER-encoded public key.
- `verifyEnvelope()` checks the payload type, finds the signature for the supplied key, verifies it, checks the statement types, re-hashes the manifest against its own keccak256 and against the subject sha256, and, if given an expected hash, against that. It never throws; failures return `{ ok: false, reason }`.

### Commands

Syntax is from the `USAGE` text in `packages/cli/src/cli.ts`. Run from the repository root after `npm install`. The CLI entry point is `packages/cli/src/index.ts` (a `tsx` script, the `crucible` bin in `packages/cli/package.json`); the examples use `npx tsx packages/cli/src/index.ts`, so substitute `crucible` if it is on your PATH. Steps 0–3 were run as real processes on 2026-10-06 against `runs/manifest-1.json`: the manifest hash matched the anchor, the signed envelope verified, `--expect` passed against the anchor, and a wrong anchor exited 1.

```bash
CRUCIBLE="npx tsx packages/cli/src/index.ts"

# 0. Recompute the manifest hash and compare it with the anchor recorded in
#    contracts/deployments/galileo-mints.json (token 1, manifestRootHash).
$CRUCIBLE verify runs/manifest-1.json \
  --expect 0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f

# 1. Generate an ed25519 key pair. Writes passport-signing.key and
#    passport-signing.pub into the directory; refuses to overwrite an existing key.
$CRUCIBLE keygen ./keys

# 2. Sign the manifest into a DSSE envelope.
$CRUCIBLE sign runs/manifest-1.json \
  --key ./keys/passport-signing.key --pub ./keys/passport-signing.pub \
  --out ./manifest-1.envelope.json

# 3. Verify offline: no network, no 0G RPC. With --expect, the manifest inside
#    must also hash to the anchored value. Exit code 1 on any failure.
$CRUCIBLE verify-envelope ./manifest-1.envelope.json \
  --pub ./keys/passport-signing.pub \
  --expect 0x4f64bfe6db470029d79ede7d83b184b003ed88ea380f5f4cce81502c6059890f
```

Notes:

- `runs/manifest-1.json` is the manifest anchored for token 1 on Galileo (chain 16602, block 49597171). `runs/manifest-1.storage.json` records `anchorMatches: true` for the same hash.
- `./keys` holds a private key. Keep it out of version control. The CLI writes it with mode `0600`.
- The key pair is yours, generated in step 1. No signing key is published in this repo, so anyone verifying your envelope needs your public key from you.

### In the browser

`apps/web/src/app/verify/page.tsx` is the `/verify` page of the web app. Paste the envelope JSON and the signer's public key PEM, and optionally the hash anchored on chain. It runs the check locally with WebCrypto (`apps/web/src/lib/envelope-verify.ts`); the page text states that nothing pasted leaves the page. Its tests are `apps/web/src/lib/envelope-verify.test.ts` and `apps/web/src/app/verify/verify.test.tsx`; docs/ROADMAP_MILESTONES.md (M5b) records that a run in a real browser has not been checked.

### What a valid result proves

- The holder of the private key matching the public key you supplied signed this exact manifest.
- The manifest has not changed since it was signed.
- With the anchor supplied, that manifest is the one whose keccak256 was recorded on chain.

## What is not verified

- **Honest training.** A signature says who signed and that nothing changed. It says nothing about whether training was done as the manifest claims. Crucible proves lineage, not honest training (stated in the `dsse.ts` header).
- **Who the key belongs to.** The signature checks against the public key you pass in. Nothing here binds that key to a person or organisation; obtain it from the signer over a channel you trust.
- **Sigstore and OpenSSF interop.** The envelope is not a Sigstore bundle: no certificate chain, no transparency log. It has not been run through the OpenSSF `model-signing` CLI, and interop with it is untested.
- **Model file contents.** Signing covers the manifest. The retriever's root check (section 2) is what ties downloaded bytes to the on-chain root.
- **Live-network resume.** Section 3 is covered by unit tests with injected fetch functions; no recorded live run of the in-code resume exists in this repo.
- **Browser runs.** The `/verify` page has tests; a real-browser run is recorded in the roadmap as not yet checked.
- **Other machines.** The commands were run on one Windows machine; a fresh-clone walkthrough on another has not been done.
