# Crucible demo datasets

Training data for the live 0G fine-tuning demo, plus the validator and the
deliberately-broken fixture corpus that proves the validator works.

Everything here is regenerable from the build scripts in this directory. Every
factual claim in `0g-expert/` traces to a source listed under
[Sources](#sources-actually-fetched) — nothing was written from memory. That
matters more here than in a normal dataset: Crucible is a *provenance* product,
so a demo trained on invented facts would refute its own thesis.

---

## At a glance

> **Which token estimate this is, and why the numbers changed — 2026-08-16.** Every figure below
> now comes from `approximateTokenCount` in `@crucible/core`, because that is the number the
> orchestrator quotes a user and the number a funded run was actually priced against: run 3 was
> quoted 2,893 tokens for `sentiment/train.jsonl` and charged on that basis.
>
> They changed because this repository had **three estimators that disagree**, and this table was
> publishing a mixture of two of them. Measured on the same files:
>
> | file | `@crucible/core` | `datasets/validate.mjs` | `tools/verify-datasets.mjs` |
> |---|---|---|---|
> | `sentiment/train.jsonl` | **2,893** | 1,792 | 1,732 |
> | `0g-expert/train.jsonl` | **19,095** | 15,055 | 14,854 |
> | `dolly-slice/train.jsonl` | **69,422** | 67,006 | 67,006 |
>
> The gap is the JSON envelope. Core counts the serialised record; the other two count only the
> natural-language payload. On short chat records the envelope is most of the bytes, which is why
> `sentiment` diverges by 1.6x while `dolly-slice`, whose records are long prose, barely moves.
>
> The two smaller estimators are **not** being changed to match. `tools/verify-datasets.mjs` is
> deliberately a second, independent implementation of 0G's dataset rules — two implementations
> agreeing is evidence, and collapsing them into one would destroy the only thing that check
> exists for. They stay independent, and the disagreement is now documented rather than silent.
>
> **All three overstate.** The authoritative count is the broker's `calculateToken()`, and this
> repository's own changelog records the local estimator running ~2.3x high on short chat records.
> Treat every number here as a ceiling for budgeting, never as a bill.

| Dataset | Format | Train | Test | Train tokens | Est. mainnet cost @3 epochs | Provenance |
|---|---|---|---|---|---|---|
| `0g-expert/` | chat | 249 | 44 | ~19,095 | **0.0386 0G** | Authored here from 0G docs + `docs/FIELD_NOTES.md` |
| `sentiment/` | chat | 61 | 20 | ~2,893 | **0.0143 0G** | Authored here, synthetic |
| `dolly-slice/` | instruction | 200 | 40 | ~69,422 | **0.1141 0G** | `databricks/databricks-dolly-15k`, **CC BY-SA 3.0** |
| `edge-cases/invalid/` | (broken on purpose) | — | 11 files | — | — | Authored here as test fixtures |

All six valid files pass both `datasets/validate.mjs` and the repo's own
`packages/core/src/dataset.ts` validator. See
[Cross-check](#cross-check-against-packagescore).

---

## Cost model

```
cost (0G) = tokens ÷ 1,000,000 × price-per-million × epochs + storage reserve
```

| Input | Value | Source |
|---|---|---|
| Testnet price | 0.8 0G / million tokens (800000000000 neuron/token) | `docs/FIELD_NOTES.md`, live-probed 2026-08-14 |
| Mainnet price | 0.5 0G / million tokens (500000000000 neuron/token) | `docs/FIELD_NOTES.md` — 37.5% cheaper than testnet |
| Storage reserve | 0.01 0G for `Qwen2.5-0.5B-Instruct` | `docs/FIELD_NOTES.md` (0.09 0G for `Qwen3-32B`) |
| Epochs | 3 | `fine-tuning-example/config/training_config.json` |

Worked example, `0g-expert/train.jsonl` on mainnet:
`14,944 ÷ 1e6 × 0.5 × 3 = 0.02242`, plus `0.01` reserve = **0.0324 0G**.

> **Token counts here are estimates**, computed as natural-language characters ÷ 4.
> They are for budgeting only. The authoritative number comes from the real Qwen
> tokenizer via `broker.fineTuning.calculateToken(datasetPath, model, usePython, provider?)`.
> Expect the real count to differ, and do not quote these figures as measured.

Running all three train splits on mainnet costs roughly **0.156 0G** in compute
plus one 0.01 0G storage reserve per task.

---

## `0g-expert/` — the hero dataset

**Purpose.** Fine-tune `Qwen2.5-0.5B-Instruct` on 0G's own documentation to
produce a "0G expert". The demo asks the base model a 0G question (vague or
wrong), asks the fine-tuned model the same question (correct), then shows the
Crucible passport proving exactly how the model was made.

**Format.** chat — 0G's recommended format for instruct models, and the only one
of the three that supports multi-turn and a `system` role.

**Counts.** 293 examples total: **249 train / 44 test** (15.0% test). Zero exact
duplicates. Within 0G's recommended 200–1,000 range for real behaviour change on
Qwen2.5-0.5B.

**Estimated tokens.** 14,944 (train) + 2,462 (test).

**Estimated cost @ 3 epochs.** Testnet 0.0459 0G · Mainnet 0.0324 0G.

### Topic coverage

What 0G is and the four components · chain IDs 16602 / 16661 · RPC, explorer,
faucet and indexer URLs · CometBFT consensus, 11K TPS/shard, sub-second finality,
cancun / Solidity 0.8.19 · DASigners and Wrapped0GBase precompiles, BLS signer
registration, the mainnet staking contract · 0G Storage's Log vs Key-Value layers,
PoRA, the 8 TB mining cap, erasure coding · 0G DA quorums, VRF selection,
sampling, 50 Gbps, inherited Ethereum security · 0G Compute inference and
fine-tuning, TEEML/OPML/ZKML, ZK-proof settlement · the two documented inference
access paths (OpenAI-compatible `/v1/proxy` with an `app-sk-` key, vs. the broker
SDK with wallet signing) · fine-tuning providers, H200 quotas, Phala dstack /
Intel TDX attestation · the full task lifecycle and the **48-hour acknowledge
deadline** (miss it: lose the model *and* 30% of the fee) · the permanently-locked
deliverable-queue footgun and its `acknowledgeDeliverable` escape hatch ·
ERC-7857 / Agentic ID, `iTransferFrom` re-encryption, ERC-8004 compatibility ·
SDK package names and versions · units (1 0G = 1e18 neuron) · dataset format and
training-config rules.

### Edge cases deliberately included

| Property | Count (293 records) |
|---|---|
| `system` role present | 9 |
| Multi-turn (4+ non-system turns) | 14 (longest: 6 turns) |
| Non-ASCII content | 116 |
| Emoji | 1 |
| CJK characters | 1 |
| Embedded double quotes | 24 |
| Embedded backslashes | 1 |
| Embedded newlines (`\n` in a string) | 15 |
| Literal `{` / `}` in content | 13 |
| Shortest user turn | 2 characters (`0G`) |
| Longest record | 1,054 characters |

Question style is varied on purpose — terse (`what chain id`), misspelled,
lowercase, conversational, true/false, multiple-choice, arithmetic ("work out
the cost of…"), and one deliberately over-long instruction — so the model
generalises rather than memorising a phrasing.

### Where the docs and reality disagree

`docs/FIELD_NOTES.md` was executed against the live 0G network on 2026-08-14 and
**wins over the public docs wherever they conflict**. The dataset teaches the
field-verified version and, where useful, teaches the discrepancy itself:

- **Mainnet fine-tuning is live.** The official `fine-tuning-example` repo's
  `.env.example` says *"Mainnet — fine-tuning not yet available"*. That comment
  is stale: mainnet has a live, unoccupied fine-tuning provider at
  `0x940b4a101CaBa9be04b16A7363cafa29C1660B0d`. Several records teach this
  correction explicitly.
- **Mainnet is cheaper than testnet** (0.5 vs 0.8 0G per million tokens).
- **Training config**: the docs template shows `num_train_epochs: 1` /
  `max_steps: 3`; the shipped example uses `3` / `45`. The dataset teaches both
  and says which one is known to produce a real run.

### Deliberate omissions

Two topics in the original brief were **dropped rather than guessed**:

1. **"Router vs Direct"** compute modes. No page I fetched uses that terminology.
   The dataset instead teaches the two access paths that *are* documented on
   `build.0g.ai/compute`: the OpenAI-compatible `${ZG_SERVICE_URL}/v1/proxy`
   endpoint with an `app-sk-…` key, and `createZGComputeNetworkBroker(wallet)`
   with `getServiceMetadata()` / `getRequestHeaders()`.
2. **`Wrapped0GBase`'s full 20-byte address.** The docs table renders precompiles
   abbreviated as `0x…1000` (DASigners) and `0x…1002` (Wrapped0GBase). The
   DASigners full address `0x0000000000000000000000000000000000001000` is
   confirmed by a second source, so the dataset states it. Wrapped0GBase is
   taught only in the abbreviated form the docs actually publish.

### Licence and provenance

Content is **authored for this repo** — original prose stating facts drawn from
0G's public documentation and from `docs/FIELD_NOTES.md`. No third-party dataset
was copied. Facts are not copyrightable; no substantial verbatim passages from
docs.0g.ai are reproduced. Regenerate with `node datasets/0g-expert/build.mjs` —
the script is organised into commented sections naming the source for each block.

---

## `sentiment/` — the fast smoke test

**Purpose.** The cheap dataset that proves the *pipeline* works before spending
on the real run. Every target output is exactly one word — `positive`,
`negative` or `mixed` — so the behaviour change is unmissable on camera: the base
`Qwen2.5-0.5B-Instruct` writes a paragraph of hedged analysis, the fine-tuned
model emits a single word.

**Format.** chat.

**Counts.** 81 total: **61 train / 20 test**, stratified so every label appears
in both splits.

| Label | Train | Test |
|---|---|---|
| positive | 22 | 7 |
| negative | 26 | 9 |
| mixed | 13 | 4 |

**Estimated tokens.** 1,792 (train) + 669 (test).
**Estimated cost @ 3 epochs.** Testnet 0.0143 0G · Mainnet 0.0127 0G — the cost is
almost entirely the fixed 0.01 0G storage reserve.

**Edge cases.** 40 of 81 records carry a `system` prompt and 41 do not, so the
model learns the task rather than depending on the system message. Includes:

- **Sarcasm where the surface words invert the sentiment** — *"Great, another
  crash."* → `negative`; *"I hate that I love it."* → `positive`.
- **Genuinely ambiguous** — *"It arrived."*, *"Fine."*, *"I have no strong
  feelings either way."* → `mixed`.
- **Mixed sentiment in one review** — *"Beautiful hardware, dreadful software."*
- **Non-English**: Chinese, German, French; 4 records with emoji, 2 with CJK.
- **Awkward strings**: embedded double quotes, a Windows path with backslashes
  (`C:\Users\me\Documents`), embedded newlines, and literal `{}` / `{"mode":"fast"}`
  — the characters that break naive JSONL writers.
- **Length range**: shortest user text 5 characters, longest record 239.

**Licence and provenance.** Fully synthetic, written for this repo. No scraped
reviews, no third-party corpus, no personal data. Regenerate with
`node datasets/sentiment/build.mjs`.

---

## `dolly-slice/` — real public data

**Purpose.** Show Crucible handling a genuine third-party dataset, not only
curated in-house examples — and demonstrate the `instruction` format alongside
the chat format used elsewhere.

**Source.** [`databricks/databricks-dolly-15k`](https://huggingface.co/datasets/databricks/databricks-dolly-15k)
— **CC BY-SA 3.0**, 15,011 records, human-authored by Databricks employees.

Chosen deliberately: a provenance product must be able to state its own training
data's provenance, and Dolly's is unambiguous — human-written, explicitly
licensed, commercially clean. **Alpaca / alpaca-cleaned was avoided on purpose**:
it is GPT-3.5-generated and its commercial provenance is murky, which is exactly
the wrong look for this project.

**Format.** instruction.

**Counts.** 240 selected: **200 train / 40 test**. 216 have a non-empty `input`;
24 have `input: ""` (valid, and a real code path worth exercising).

**Estimated tokens.** 67,006 (train) + 13,118 (test).
**Estimated cost @ 3 epochs.** Testnet 0.1708 0G · Mainnet 0.1105 0G.

### Field mapping — Dolly → 0G instruction format

| Dolly field | 0G field | Note |
|---|---|---|
| `instruction` | `instruction` | unchanged |
| `context` | **`input`** | renamed; may be `""` |
| `response` | **`output`** | renamed |
| `category` | *(dropped)* | not a 0G field |

The emitted JSONL contains **only** `instruction`, `input`, `output` — verified:

```
$ node -e "…collect key union…"
datasets/dolly-slice/train.jsonl -> input,instruction,output
datasets/dolly-slice/test.jsonl  -> input,instruction,output
```

### Reproducing the exact slice

Selection is fully deterministic — no randomness, no sampling seed. Walking the
source file in original line order, a record is a candidate if:

- **Group A** — `category` is `closed_qa` or `summarization` **and** `context` is
  non-empty (exercises the non-empty `input` path); take the first **216**; or
- **Group B** — `category` is `open_qa` or `general_qa` **and** `context` is empty
  (exercises the empty-`input` path); take the first **24**;

in both cases with non-empty `instruction` and `response`, and
`len(instruction)+len(context)+len(response) <= 6000` characters (long records
inflate the token bill; 5,752 is the longest that survived). The two groups are
merged back into source-line order; the first 200 become `train.jsonl` and the
remaining 40 become `test.jsonl`.

`dolly-slice/slice-manifest.json` records the source SHA-256 and **the exact
source line numbers** of every selected record — the selection is auditable, not
just described. That is itself a provenance claim.

```
source sha256   2df9083338b4abd6bceb5635764dab5d833b393b55759dffb0959b6fcbf794ec
source records  15011
selected        240  (train 200, test 40)
empty input     24
```

Rebuild:

```bash
curl -sL -o databricks-dolly-15k.jsonl \
  https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl
node datasets/build-dolly-slice.mjs --source databricks-dolly-15k.jsonl
```

The 13 MB source file is **not** committed.

**Licence and attribution — corrected 2026-08-16.** This slice was recorded here as Apache 2.0.
It is not. The dataset card states **Creative Commons Attribution-ShareAlike 3.0 Unported**
(CC BY-SA 3.0), and says commercial use is permitted *under those terms*.

© Databricks, Inc. — `databricks-dolly-15k`, retrieved 2026-08-14 from the dataset card at
https://huggingface.co/datasets/databricks/databricks-dolly-15k.

The difference is not cosmetic. **Share-alike is an obligation**: this derived slice inherits
CC BY-SA 3.0 and is redistributed under it, not under the repository's MIT licence. The MIT
`LICENSE` at the repository root covers Crucible's own code and datasets; it does not and
cannot cover `datasets/dolly-slice/`. Attribution is carried in `slice-manifest.json`, in
`datasets/dolly-slice/LICENSE`, and here.

---

## `edge-cases/invalid/` — the failure corpus

Eleven files, one per failure mode, each named for what it breaks. This is the
fixture set that proves the validator actually catches things rather than
rubber-stamping. Regenerate with `node datasets/edge-cases/build-invalid.mjs`.

| File | What it breaks | Expected error |
|---|---|---|
| `mixed-formats.jsonl` | 11 chat records with one instruction record spliced in at line 7 | mixing formats — 0G requires one format throughout |
| `too-few.jsonl` | 9 valid records, one short of the minimum | below the 10-example minimum |
| `blank-lines.jsonl` | an empty line between records at line 6 | blank line between records |
| `trailing-comma.jsonl` | comma before `}` on line 5 | line is not valid JSON |
| `not-jsonl.jsonl` | a single JSON array instead of one object per line | line 1 is an array, not an object |
| `missing-output.jsonl` | instruction records with no `output` key | instruction record has no `"output"` |
| `bad-role.jsonl` | `"role": 1` on line 4 | `role` must be a string |
| `empty-messages.jsonl` | `{"messages": []}` on line 8 | chat records need at least one message |
| `null-content.jsonl` | `"content": null` on line 3 | `content` must be a string |
| `bom.jsonl` | UTF-8 BOM (`EF BB BF`) prefixing an otherwise-valid file | BOM breaks `JSON.parse` on line 1 |
| `crlf.jsonl` | Windows CRLF line endings throughout | CRLF carries a stray `\r` into every record |

---

## `validate.mjs`

Zero dependencies, no install step.

```bash
node datasets/validate.mjs <file.jsonl> [more.jsonl ...]
node datasets/validate.mjs --expect-fail datasets/edge-cases/invalid/*.jsonl
```

Exit code 0 when every file matches expectations, 1 otherwise — so it drops
straight into CI. `--expect-fail` inverts the assertion, which is how the invalid
corpus is asserted.

It enforces the full 0G rule set: UTF-8 with no BOM · LF line endings · one JSON
object per line, each parseable in isolation · no blank lines · no trailing
commas · every record matching exactly one of the three 0G formats · one format
throughout the file · at least 10 examples. It also reports the record count, an
estimated token count and an estimated cost on both networks.

### Cross-check against `packages/core`

`validate.mjs` is deliberately not an independent opinion — its `detectFormat` is
a line-for-line port of `packages/core/src/dataset.ts`. Both were run over all 17
files and compared record by record:

```
detectFormat: validate.mjs and packages/core AGREE on every record of every file.
All 6 valid datasets PASS packages/core validateDataset().
Rejected by validate.mjs but NOT by packages/core (file-level rules core cannot see): datasets/edge-cases/invalid/crlf.jsonl
```

**Worth knowing:** `packages/core`'s `validateDataset(records: unknown[])` takes
already-parsed records, so it can only enforce *record-level* rules. It never
sees the file's bytes. Ten of the eleven invalid fixtures still fail under it,
but `crlf.jsonl` passes — `JSON.parse` tolerates a trailing `\r`, so every record
parses cleanly and the file looks fine at the record level. BOM and blank-line
faults only fail there because they happen to corrupt a line into unparseability.

That is not a bug in `packages/core`; it is the boundary of what a record-level
validator can check. `validate.mjs` reads bytes, so it closes the gap. **If you
only run the core validator, a CRLF dataset will reach 0G unflagged.**

### Observed output — valid datasets

```
$ node datasets/validate.mjs datasets/0g-expert/train.jsonl datasets/0g-expert/test.jsonl \
    datasets/sentiment/train.jsonl datasets/sentiment/test.jsonl \
    datasets/dolly-slice/train.jsonl datasets/dolly-slice/test.jsonl

========================================================================
PASS  datasets/0g-expert/train.jsonl
========================================================================
  format            chat
  valid records     249
  estimated tokens  14,839  (~4 chars/token)
  est. cost @3ep    testnet 0.0456 0G  |  mainnet 0.0323 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

========================================================================
PASS  datasets/0g-expert/test.jsonl
========================================================================
  format            chat
  valid records     44
  estimated tokens  2,481  (~4 chars/token)
  est. cost @3ep    testnet 0.0160 0G  |  mainnet 0.0137 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

========================================================================
PASS  datasets/sentiment/train.jsonl
========================================================================
  format            chat
  valid records     61
  estimated tokens  1,792  (~4 chars/token)
  est. cost @3ep    testnet 0.0143 0G  |  mainnet 0.0127 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

========================================================================
PASS  datasets/sentiment/test.jsonl
========================================================================
  format            chat
  valid records     20
  estimated tokens  669  (~4 chars/token)
  est. cost @3ep    testnet 0.0116 0G  |  mainnet 0.0110 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

========================================================================
PASS  datasets/dolly-slice/train.jsonl
========================================================================
  format            instruction
  valid records     200
  estimated tokens  67,006  (~4 chars/token)
  est. cost @3ep    testnet 0.1708 0G  |  mainnet 0.1105 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

========================================================================
PASS  datasets/dolly-slice/test.jsonl
========================================================================
  format            instruction
  valid records     40
  estimated tokens  13,118  (~4 chars/token)
  est. cost @3ep    testnet 0.0415 0G  |  mainnet 0.0297 0G  (incl. 0.01 0G storage reserve)
  OK  no errors. Dataset satisfies every 0G requirement checked here.

ALL 6 FILES PASS.
```

### Observed output — invalid corpus

Trimmed to the verdict and reason lines; each file also prints its stats block.

```
$ node datasets/validate.mjs --expect-fail datasets/edge-cases/invalid/*.jsonl

FAIL  datasets/edge-cases/invalid/bad-role.jsonl
   x Line 4: matches none of 0G's three formats — messages[0].role is number, must be a string.
FAIL  datasets/edge-cases/invalid/blank-lines.jsonl
   x Line 6: blank line. 0G rejects blank lines between records.
FAIL  datasets/edge-cases/invalid/bom.jsonl
   x file starts with a UTF-8 byte-order mark (EF BB BF). 0G expects plain UTF-8; the BOM becomes part of the first line and breaks JSON.parse on line 1.
FAIL  datasets/edge-cases/invalid/crlf.jsonl
   x file uses CRLF line endings (12 occurrences). 0G expects LF-delimited JSONL; a trailing \r is carried into every record.
FAIL  datasets/edge-cases/invalid/empty-messages.jsonl
   x Line 8: matches none of 0G's three formats — "messages" is an empty array — chat records need at least one message.
FAIL  datasets/edge-cases/invalid/missing-output.jsonl
   x Line 1: matches none of 0G's three formats — instruction record has no "output" key.
   x Line 2: matches none of 0G's three formats — instruction record has no "output" key.
   x Line 3: matches none of 0G's three formats — instruction record has no "output" key.
   x Line 4: matches none of 0G's three formats — instruction record has no "output" key.
   x Line 5: matches none of 0G's three formats — instruction record has no "output" key.
   x ...and 7 more unrecognised line(s).
FAIL  datasets/edge-cases/invalid/mixed-formats.jsonl
   x Dataset mixes formats: chat (11 records), instruction (1 record). 0G requires one format throughout — line 7 is the first "instruction" record.
FAIL  datasets/edge-cases/invalid/not-jsonl.jsonl
   x Line 1: matches none of 0G's three formats — line is a JSON array, not a JSON object — JSONL requires one object per line.
   x Dataset has 1 examples. 0G requires at least 10.
FAIL  datasets/edge-cases/invalid/null-content.jsonl
   x Line 3: matches none of 0G's three formats — messages[1].content is null, must be a string.
FAIL  datasets/edge-cases/invalid/too-few.jsonl
   x Dataset has 9 examples. 0G requires at least 10.
FAIL  datasets/edge-cases/invalid/trailing-comma.jsonl
   x Line 5: not valid JSON — Expected double-quoted property name in JSON at position 111 (line 1 column 112) (looks like a trailing comma)

ALL 11 FILE(S) CORRECTLY REJECTED.
```

---

## Sources actually fetched

Retrieved 2026-08-14. Nothing in `0g-expert/` comes from any other source.

**Fetched successfully**

| Source | What it supplied |
|---|---|
| `docs/FIELD_NOTES.md` (this repo) | **Highest authority.** Provider addresses, prices in neuron, quotas, TEE signer, task lifecycle, 48-hour deadline, the locked-queue footgun, SDK API surface, package versions, endpoints, model table, training-config rules |
| https://docs.0g.ai/ | Stack overview, component names, explorer names |
| https://docs.0g.ai/concepts/chain | CometBFT, 11K TPS/shard, sub-second finality, consensus/execution split, VRF validator selection, PoS |
| https://docs.0g.ai/concepts/storage | Log vs Key-Value layers, PoRA, 8 TB mining cap, erasure coding / 30% node failure, 200 MBPS, two-lane system |
| https://docs.0g.ai/concepts/compute | GPU marketplace, 90% cheaper claim, escrow, ZK-proof settlement, TEEML/OPML/ZKML, no data retention |
| https://docs.0g.ai/concepts/da | VRF node selection, quorums, honest majority, sampling, 50 Gbps on Galileo, inherited Ethereum security |
| https://docs.0g.ai/concepts/agentic-id | ERC-7857, former INFT name, encrypted metadata, oracle verification, ERC-8004 compatibility |
| https://build.0g.ai/ | Four-component framing, 173 showcase projects |
| https://build.0g.ai/chain | Chain IDs 16602 / 16661, RPCs, explorers, faucet, 18 decimals, cancun, Solidity 0.8.19, Hardhat/Foundry |
| https://build.0g.ai/compute | `@0gfoundation/0g-compute-ts-sdk`, CLI commands, Node 20+, 3 OG minimum deposit, `/v1/proxy` + `app-sk-` keys, broker methods, example provider address |
| https://build.0g.ai/storage | `@0gfoundation/0g-storage-ts-sdk`, Go and Rust clients, `Indexer.upload/download`, `MemData` / `ZgFile` |
| https://build.0g.ai/agentic-id | Testnet contract `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F`, `mint` / `authorizeUsage` / `iTransferFrom` / `revokeAuthorization`, 100-authorized-user cap, example stack |
| https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts | Precompiles DASigners `0x…1000` and Wrapped0GBase `0x…1002`, verification API endpoints |
| https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/staking-interfaces | Mainnet staking contract `0xea224dBB52F57752044c0C86aD50930091F561B9` |
| Web search over `docs.0g.ai` | DASigners full address, `TokensPerVote` = 30 tokens on testnet, `registerSigner`, BLS key registration |
| https://huggingface.co/datasets/databricks/databricks-dolly-15k | The Dolly source file (13 MB, SHA-256 above) |

**Failed to fetch — topics dropped, not filled from memory**

| URL | Result | Consequence |
|---|---|---|
| `docs.0g.ai/developer-hub/building-on-0g/precompiles/precompiles-overview` | HTTP 404 | Full precompile inventory unavailable; only the two documented on the deploy-contracts page are taught |
| `docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/precompiles-dasigners` | HTTP 404 | DASigners method-level interface not taught beyond `registerSigner` |
| `docs.0g.ai/developer-hub/building-on-0g/compute-network/inference/inference-sdk` | HTTP 404 | No source for "Router vs Direct" terminology; the two documented access paths are taught instead |

---

## Rebuilding everything

```bash
node datasets/0g-expert/build.mjs
node datasets/sentiment/build.mjs
node datasets/edge-cases/build-invalid.mjs
node datasets/build-dolly-slice.mjs --source databricks-dolly-15k.jsonl   # needs the download

node datasets/validate.mjs datasets/*/train.jsonl datasets/*/test.jsonl
node datasets/validate.mjs --expect-fail datasets/edge-cases/invalid/*.jsonl
```

All build scripts write LF line endings and plain UTF-8 explicitly, on Windows
included — which is what stops a `crlf.jsonl`-shaped bug from reaching 0G.
