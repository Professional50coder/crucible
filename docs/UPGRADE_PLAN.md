# Product upgrade plan — awaiting approval

Drafted 2026-08-16 after reviewing the live app against four reference classes. **Nothing in here
is implemented yet.** Read it, strike what you disagree with, and I will build what survives.

---

## The references, and what each is good for

| Reference | What it is | What we take |
|---|---|---|
| **EAS attestation view** (`easscan.org/attestation/view/…`) | The functional twin of a passport page — a public, hash-heavy, verifiable record | Full UID shown *untruncated* under the title · a metadata quad top-right (created / expires / revoked / revocable) · **typed field rows** where a coloured left cell reads `BYTES32 · datasetRootHash` and the right cell carries the value · from/to as full linked addresses |
| **EAS attestations list** | The gallery twin | Stat header of three large numbers · dense table · `ONCHAIN` / `OFFCHAIN` badges · relative age column |
| **Dribbble crypto dashboards** | Visual craft, not structure | Elevation and surface hierarchy · large tabular numerals as the visual subject · one accent used as a glow |
| **99designs crypto marketing sites** | Landing-page register | A deep gradient hero — for the *landing page only*, never on a certificate |

**The register does not change.** Crucible is an instrument, not a dashboard. Its credibility comes
from looking like something you would trust with a provenance claim. The EAS lineage is the one to
follow; the Dribbble work contributes craft, not layout.

---

## PHASE 1 — Before anything is recorded or submitted

Three changes. Each is visible in the first five seconds of the demo video.

### 1.1 · Make the verification the hero
The sentence *"Hashed in your browser just now — the result matches the value anchored on
chainscan-galileo.0g.ai"* is the most important claim in the project and currently renders as a thin
status strip below the fold. It becomes a dedicated panel above the lineage table: the two hashes
stacked and character-aligned so the eye confirms the match, three states (`checking` → `match` →
`mismatch`), the `true` returned by `verifyManifest` presented as a returned value, and a
copyable "verify it yourself" disclosure containing the exact `curl` and `node tools/verify-manifest.mjs`.

### 1.2 · Earn the first screen
`/gallery` opens with ~130px of dead space before the title, and the one thing proving the project
is real — token #1, minted, on a public chain — sits below the fold. Lift it up. Lead the stat row
with **`1 / 8 MINTED ON 0G`** rather than `8 PASSPORTS`, and either label `TOKENS TRAINED 3,121,508`
as a fixture sum or drop it — an impressive number that dissolves on inspection costs more than it earns.

### 1.3 · Stop shouting `WRONG NETWORK`
The red pill is the highest-contrast element on screen, shown to a visitor who has simply not
connected a wallet — and no wallet is needed to read a passport. Disconnected becomes a quiet
`0G Galileo` chip; genuinely-wrong-chain becomes amber with a switch action. `MOCK DATA` stays.

---

## PHASE 2 — The EAS patterns

### 2.1 · Typed manifest rows
Render the manifest as EAS renders decoded data: a coloured left cell carrying the type and field
name, the value on the right. `BYTES32 · datasetRootHash`, `STRING · taskId`, `ADDRESS · provider`.
This turns a hash dump into a legible schema, and it makes the passport look like a record format
rather than a page layout.

### 2.2 · Show the full hash
EAS prints the complete UID under the title. On a certificate, the full value *is* the content —
truncation is for tables. Full hashes on the passport page, truncation only in lists.

### 2.3 · Metadata quad
Minted / block / network / token, as small-label-over-value pairs in the top right, mirroring EAS's
created / expiration / revoked / revocable.

---

## PHASE 3 — System polish

- **Typographic duality.** Everything is monospace today, which flattens hierarchy. Mono keeps
  hashes, addresses, ids and numeric data; a proportional face takes headings and prose. Hashes gain
  authority when they are the only monospace on the page.
- **Depth.** Three surface levels, a hairline `rgba(255,255,255,.06)` top border on raised panels,
  one soft shadow. No glass, no blur, no gradient mesh.
- **One accent per meaning.** green = verified/on-chain (never decorative) · red = model lost,
  never acknowledged, hash mismatch · amber = a clock is running or a value is provider-reported.
  Brand carried by type and layout, not hue.
- **Numeric hierarchy.** `#1` as a large numeral is the best moment in the app. Extend it: fee, gas,
  block, token count and the 30% penalty get display sizes and tabular figures. Numbers are this
  product's photography.
- **Hash component.** One truncation rule, copy-on-click with feedback, full value on hover,
  outbound link only when the destination resolves.
- **Empty, loading and error states.** Gallery with nothing in it, a failed job, an unreachable
  orchestrator. Cheap, and the difference between a demo and a product.

---

## PHASE 4 — Distribution

- **Open Graph card per passport** — token number, model, `MINTED ON 0G GALILEO`, the anchor hash.
  The mandatory X post then unfurls into something that looks like a certificate. Highest ratio of
  impression to effort on this list, and it serves the 10% communication score directly.
- **Landing page hero.** The one place the 99designs register applies: a deep, restrained gradient
  behind the single claim. Not on any page that carries a hash.
- **Responsive to laptop width.** The lineage table and raw-document disclosure break first.

---

## PHASE 5 — Product, not presentation

These are functional gaps the audit found. They matter more than any pixel.

| # | Gap | Why it matters |
|---|---|---|
| 5.1 | **No mint path in the UI.** Passport #1 was minted by a Hardhat script | The demo should not film a button that does not exist |
| 5.2 | **`verifyService()` is never called**, so the manifest carries `attestationVerified: false` | We record the TEE signer without checking the attestation. That field should be earned |
| 5.3 | **No `transferFund` in the codebase**, though docs claimed sub-account funding | Already deleted from the changelog; either build it or keep it deleted |
| 5.4 | **The orchestrator daemon has never performed a real acknowledgement** | It is well-tested against fakes. One real run through it would make the headline feature true |
| 5.5 | **Retrieve one adapter from Linux** | Both losses were environmental. A real adapter root hash replaces passport #1's sentinel and strengthens every claim in the repo |

---

## Sequence, and what it costs

1. **Phase 1** — then screenshots, then the AKINDO product form. Nothing is recorded before this.
2. **Phase 5.5 and 5.1** — the two that change what is *true*, not what is shown.
3. **Phase 2**, then **Phase 3**.
4. **Phase 4** alongside the X post.

Mainnet deployment is not in this plan because it is not blocked on work — it is blocked on ~0.0103 0G
of gas, and the moment that lands it is one command.

## Explicitly not doing

Aurora gradients on record pages · glassmorphism · a light theme · chart chrome · 3D device mockups ·
an animated hero. Each would make this look more like the reference set and less like something you
would trust with a provenance claim.

---

## Decisions I need from you

1. **Phase 1 in full, or just 1.1?** 1.1 alone gets the demo its hero shot; all three make the first
   screen defensible.
2. **Typographic duality (Phase 3) — yes or no?** It is the single biggest visual change and it
   moves away from the pure-terminal look. Reversible, but not cheap to do twice.
3. **Phase 5.5 — do we chase a real adapter?** It needs a Linux environment. It is the difference
   between "both my runs lost their models" and "here is the adapter, and here is what it took".
4. **Anything here you want struck.**
