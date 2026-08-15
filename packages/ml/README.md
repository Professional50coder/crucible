# `@crucible/ml` — evaluation and dataset intelligence

Two jobs, both in service of one idea: **a Crucible passport should only contain claims
its reader can check.**

| Half | Runs | Answers |
|---|---|---|
| `src/eval/` | after a fine-tune completes | Did this actually get better, and how sure are we? |
| `src/analyze/` | before any money is spent | Is this dataset worth training on? |
| `src/passport-ext.ts` | at manifest assembly | Turns either result into an optional manifest section |

> **Standalone package.** This is deliberately *not* an npm workspace member of the repo
> root, so installs here cannot collide with work in `packages/core`, `apps/web` or
> `services/*`. Install from inside this directory with `npm install --no-workspaces`.

```
npm install --no-workspaces
npm test          # 316 tests, no network, no key, no funds
npm run typecheck
npm run build
```

---

## Part 1 — Auto-evaluation

### Running a model over a test set

Inference goes through 0G Compute, which is OpenAI-API-compatible, so the real client is
the `openai` package with a swapped `baseURL`. Nothing in the eval engine knows that: it
depends on an `InferenceClient` port, which is what makes the entire suite runnable
offline.

```ts
import { createInferenceClient, runEval, compareRuns, evalSummary } from '@crucible/ml'

const client = await createInferenceClient({
  mode: 'router',           // or 'direct' with a broker endpoint + signed headers
  network: 'mainnet',
  apiKey: process.env.ZG_ROUTER_API_KEY!,
})

const baseRun  = await runEval({ client, model: 'Qwen2.5-0.5B-Instruct', examples, concurrency: 4 })
const tunedRun = await runEval({ client, model: tunedAdapterId,          examples, concurrency: 4 })

const comparison = compareRuns(baseRun, tunedRun, { metric: 'exactMatch', seed: 12345 })
console.log(evalSummary(comparison))
```

Both inference paths from `docs/FIELD_NOTES.md` are supported and config-driven:

| Mode | Base URL | Auth |
|---|---|---|
| `router` (testnet) | `https://router-api-testnet.integratenetwork.work/v1` | API key |
| `router` (mainnet) | `https://router-api.0g.ai/v1` | API key |
| `direct` | per-provider endpoint from the broker | broker-signed headers |

`runEval` bounds concurrency (one provider serves the whole network — an unbounded
fan-out is antisocial and gets rate-limited), retries with exponential backoff on
retryable failures only, and applies a per-request timeout that aborts the signal it
handed the client.

**Partial failure is reported, never swallowed.** Every run returns one result per
example, successes and failures alike, plus `completed`, `failed`, `completionRate` and
a `failures` list. Scoring the 28 requests that survived out of 40 and publishing that
as the model's accuracy is precisely the quiet fiction this package exists to prevent.

### What each metric means

| Scorer | Measures | Use it when |
|---|---|---|
| `exactMatch` | Normalised strings identical (trim, lowercase, collapse whitespace) | Short canonical answers — a label, a name, a number |
| `containsMatch` | Expected answer appears somewhere in the output | The model is chatty but the fact must be present |
| `tokenF1` | Multiset token-overlap F1 | Free-text answers where wording varies but content shouldn't |
| `levenshteinSimilarity` | `1 - editDistance / longerLength` | Near-miss spelling, formatting or transcription tasks |
| `classificationAccuracy` | Accuracy + per-class precision/recall/F1 + confusion matrix | Label tasks |

Two deliberate strictness choices:

- **`containsMatch` scores 0 for an empty expected string.** Every string contains `""`,
  and a metric that returns 1 for missing ground truth is how fake numbers get made.
- **`classificationAccuracy` does not coerce chatter onto the nearest label.** An output
  of `"I think it is positive because…"` becomes its own class and is counted in
  `unknownPredictions`. A model that cannot emit a bare label has not learned the task,
  and fuzzy-matching it flatters the fine-tune.

### Statistical honesty — and when it will say "not significant"

`compareRuns` attaches a **paired percentile bootstrap** confidence interval on the delta,
and `significant` is true **only when the whole interval sits on one side of zero**.

- *Paired*, because both models are scored on the same examples. Each resample draws
  example indices once and reads both runs at that index, removing example difficulty
  from the variance. The honest version of the test is also the more sensitive one.
- *Percentile* rather than BCa, for auditability: no bias-correction constants to get
  subtly wrong, and anyone can re-derive the interval from the published seed and scores.
- *Seeded* (default 1000 iterations, seed `20260814`). Same scores plus same seed produce
  byte-identical numbers on any machine — which matters, because these numbers get hashed
  into a manifest.

**It will say "not significant" more often than you would like. That is the feature.**

| Situation | Verdict |
|---|---|
| 5-point gain on 40 examples | **not significant** — the interval straddles zero |
| The same 5-point gain on 4,000 examples | significant |
| Fewer than 5 comparable examples | **never significant** — reported as `underpowered` |
| Interval entirely below zero | significant **regression** |

The 40-example case is worth sitting with, because it is the default shape of a 0G
demo run (the shipped example dataset is 30 train / 10 test). With 40 test examples,
a 50% → 55% difference is roughly a coin flip. The bootstrap says so, and
`evalSummary` is forbidden by test from using the word "improved" when it does.

```
Fine-tuned model scored 0.55 vs 0.50 for the base on exactMatch across 40 examples:
a +5.0-point difference that is not statistically significant at 95% confidence —
95% CI [-0.105, 0.205] includes zero, so this test set cannot distinguish the two models.
```

#### Why this matters for a provenance product

Crucible's entire pitch is that a passport is a claim you can check. The moment it
publishes an unqualified "+12% better" derived from 40 examples, it has published a number
nobody — including its author — can defend, and the first competent reviewer who asks
"over how many examples, with what interval?" collapses the whole thesis. A provenance
product that launders noise into a public claim is not a weaker provenance product; it is
an anti-provenance product. Surfacing uncertainty is cheaper than losing the argument.

### Divide-by-zero and the `baselineZero` flag

`relativeImprovement` is `(tuned - base) / base`. When the base model scores 0 that ratio
is undefined, not infinite, so the field is set to `0` and **`baselineZero: true`** is
raised. Read that flag before quoting the ratio; quote `absoluteDelta` instead.

---

## Part 2 — Pre-flight dataset intelligence

```ts
import { analyzeDataset } from '@crucible/ml'

const report = analyzeDataset({ train: trainRecords, test: testRecords })

if (report.severity === 'fail') {
  console.error(report.recommendations.join('\n'))
  process.exit(1)
}
```

Input is parsed JSONL records in any of 0G's three formats (chat / instruction / text).
Every check is pure TypeScript — no model download, no network, no embeddings.

| Check | What it catches |
|---|---|
| `exactDuplicates` | Hash-grouped identical records, with line numbers |
| `nearDuplicates` | Copy-paste variants, via character n-gram shingling + Jaccard |
| **`trainTestLeakage`** | **Test examples the model was trained on** |
| `lengthDistribution` | Truncated records, accidental pastes, outliers |
| `classBalance` | Imbalance, and the majority-class baseline your fine-tune must beat |
| `detectPII` | Emails, phones, Luhn-valid cards, IPs, API keys, private keys |

### Leakage is the one that matters

If a held-out test example also appears in training, the model has memorised it and every
eval number downstream is fiction. It is invisible unless something looks for it, and a
provenance product publishing fictional numbers destroys its own thesis — so this check
gets the strictest treatment in the package:

- Leakage is compared on the **prompt side**, not the whole record. A test question the
  model was trained on is contaminated whether or not the two rows happen to share an
  answer, and the differing-answer case is exactly what a naive whole-record diff misses.
- Every leaked pair is reported with **both** line numbers, plus `identicalRecord`.
- Any leakage at all makes the report `severity: 'fail'`.
- The default near-leak threshold is **0.75, tuned for recall**. Character n-gram Jaccard
  is punctuation-sensitive on short text: measured here, adding a comma and an exclamation
  mark to a 46-character sentence drops similarity to 0.796, so a 0.85 threshold misses an
  obvious leak. A false alarm costs one glance at two line numbers; a missed leak silently
  inflates every number that follows.

`contaminatedTestCount` counts **test examples**, not leaked pairs — one test example
leaking from three training rows is one unusable test example.

### Near-duplicate detection is classical, by design

Character 5-gram shingling with Jaccard similarity, accelerated by seeded MinHash + LSH
banding above 800 records. Small datasets take the exact all-pairs path, which is complete
by construction; large ones use LSH only to *generate candidates*, and every candidate is
then verified with a real Jaccard computation. So a reported similarity is always exact,
and dataset size never changes the meaning of the answer.

This is a constraint (no embeddings allowed) that happens to be the right tool: real
fine-tuning duplicates are copy-paste variants, which shingling catches precisely, whereas
an embedding model would blur them into "semantically related".

### PII: two rules

1. **Never echo a full match.** Everything is redacted at the point of detection, not at
   the point of display. A report that helpfully quotes the API key it found has copied
   that key into a new file — one that may be rendered in a UI or pinned to public storage.
2. **Luhn-check anything card-shaped.** Order IDs, timestamps and reference numbers are all
   16-digit strings. Without the checksum, every one of them is reported as a leaked card
   and the whole PII report becomes noise the user learns to ignore.

Detected: emails, phone numbers (separator-requiring, so bare years don't match),
Luhn-valid credit cards, IPv4 (range-checked, so version numbers don't match), OpenAI /
GitHub / AWS / Slack key formats, PEM private-key headers, and 64-hex-character values —
the shape of an EVM private key, which is exactly what a 0G user must never paste into a
training file.

### Token counts are estimates

`estimateTokens` is ~4 characters per token. It is **not** the Qwen tokenizer and does not
pretend to be — a real one would mean a model download. Good enough to spot a record two
orders of magnitude out of line; **not a billing figure**. Use the broker's
`calculateToken` for anything involving money.

### Severity rules

| Severity | Raised by |
|---|---|
| `fail` | Any train/test leakage · fewer than 10 examples · mixed or unrecognised formats · ≥20% exact duplicates · a high-severity secret · a single-class dataset |
| `warn` | 10–199 examples · some duplicates · near-duplicates · length outliers · class imbalance · under-represented classes · lower-severity PII |
| `ok` | Nothing found |

`fail` means *do not spend money on this yet*: either 0G will reject it, or the results
will be meaningless, or something is in there that must not be uploaded.

---

## Part 3 — Passport extension

`EvalSection` and `QualitySection` are designed to be merged into `PassportManifest`
(`docs/INTERFACES.md` §1) as optional `evaluation?` / `quality?` fields.

```ts
import { attachEvaluation, attachQuality } from '@crucible/ml'

const withBoth = attachQuality(attachEvaluation(manifest, comparison), report)
```

Both are pure functions returning a **new** manifest; neither mutates its input.

**This package does not import `packages/core`.** Core owns the manifest shape and another
agent owns core, so these functions are generic over `T extends object` and typed
structurally. Adding the two optional fields to core's interface is the whole integration.

Three constraints shaped the section types, all downstream of the manifest being
canonicalised and keccak-hashed as an on-chain anchor:

1. **No `undefined` values, and every float rounded to 6 decimal places.** Carrying 17
   significant digits into a hash is a portability risk for no benefit.
2. **The manifest is public.** No PII sample, no secret fragment, no raw dataset text —
   only counts and verdicts. `QualitySection` carries issue *codes*, never the free-text
   recommendations.
3. **Bulk detail stays out.** The per-example eval table is represented by
   `perExampleDigest`, a sha256 over its canonical JSON, so the full table can be published
   alongside and verified against the passport without bloating what gets hashed.

`EvalSection.summary` is the one-line sentence, and it inherits the guarantee: it will not
claim improvement when `significant` is false.

---

## Testing

316 tests, all offline. **No test requires network access, an API key, a private key or
funds** — the inference client is injected and tests use a fake.

What is actually pinned down:

- every scorer against hand-computed values (`tokenF1` of `"a a a b"` vs `"a b"` is 2/3,
  and the test says why)
- the bootstrap is byte-identical under a fixed seed, and seed choice cannot flip a verdict
- `significant` is false for a 5-point delta on 40 examples and true for the same delta on
  4,000
- `evalSummary` does not contain "improved" when the result is not significant
- leakage detection finds exact matches, differing-answer matches and punctuation
  paraphrases, and agrees with itself at 1,200 records where the indexed path kicks in
- Luhn rejects `1234567890123456` and accepts the published test-card numbers
- concurrency limiting actually limits (peak in-flight is measured, not assumed)
- partial failure is reported: 9 examples, 3 failing, `completed: 6` and 3 named failures
- no raw secret survives into a report or a manifest section

### Things worth knowing that the tests taught us

- **Filler records that differ only by an index digit are genuine near-duplicates.**
  `"question number 7 about geography"` and `"question number 8 about geography"` share
  nearly all their 5-grams. Two test fixtures had to be rewritten with real vocabulary
  variety; the detector was right both times.
- **Tukey fences alone are too eager on small samples.** On 12 tightly-clustered records
  the IQR rule flags a record only mildly longer than its peers. Length outliers now
  require *both* a Tukey breach *and* being 3x from the median — statistical outlyingness
  and practical significance. Conversely, when the IQR is zero (most records the same
  length), Tukey collapses and the median-ratio rule carries the decision alone, which is
  what catches the uniform-dataset-plus-one-100x-record case.
- **Binary scores on 40 examples make a coarse bootstrap.** Every resampled delta is a
  multiple of 1/40, so two different seeds routinely produce the identical interval. That
  is stability, not a bug — but it makes binary data a poor probe for "did the seed change
  anything", so that test uses continuous scores.
