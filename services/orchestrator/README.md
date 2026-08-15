# @crucible/orchestrator

The part of Crucible that keeps working when nobody is watching.

Fine-tuning on the 0G Compute Network has two documented ways to destroy a user's work, and
both of them only happen because a human stopped paying attention at the wrong moment. This
service exists so that neither one can happen. It is a job store, a poller, an
auto-acknowledge daemon, and a small HTTP+SSE API.

---

## The two failure modes it prevents

### 1. The 48-hour deadline

When a 0G fine-tuning task reaches `Delivered`, the user has **48 hours** to acknowledge it.
Miss the window and they lose the fine-tuned model **and** 30% of the fee is deducted. 0G
sends no warning; the documented workflow is that you sit at a CLI and poll.

Crucible schedules acknowledgement **one hour** after delivery and never later than **40
hours**, leaving at least 8 hours of margin under even the worst retry path:

```
delivered ──1h──▶ acknowledge ..........36h..........▶ fallback allowed
                                                 40h ▶ last scheduled action
                                                                48h ▶ MODEL LOST
```

Acknowledgement always goes through `acknowledgeModel`, which downloads, verifies the model
hash, and acknowledges on-chain in one call. Transient failures retry with exponential
backoff (1 min doubling, capped at 1 h). Only once **36 hours** have elapsed *and*
`acknowledgeModel` is still failing does the daemon fall back to `acknowledgeDeliverable`,
which saves the queue and avoids the 30% penalty but cannot retrieve the artifact — and when
it does that, it records `artifactAtRisk: true` with a loud error explaining exactly what was
traded away.

The schedule lives in the job record on disk, not in memory. Kill the process at any point
and the replacement picks up the same deadline.

### 2. "Bug #4" — the permanently locked deliverable queue

From a May 2026 hackathon bug report, documented in the 0G SDK's own TSDoc: a user retrieved
their model through the deprecated `downloadModelFrom0GStorage` + `decryptModel` path and
never called `acknowledgeModel`. Days later the artifact was garbage-collected from both 0G
Storage and the TEE buffer. Because `acknowledgeModel` requires a successful download, it
could no longer succeed **at all** — and every subsequent `addDeliverable` for that
`(user, provider)` pair reverted with `previous deliverable not acknowledged`. The account
could never fine-tune again.

Crucible handles this from both ends:

- **It can never cause it.** The deprecated pair is not on the `FineTuningPort` interface, so
  no code in this service can reach it. `test/no-deprecated-path.test.ts` enforces that
  structurally against `src/`.
- **It can cure it.** `POST /jobs/:id/unlock` (or `orchestrator.unlock(provider, taskId)`)
  calls `acknowledgeDeliverable`, which acknowledges on-chain without needing the artifact.
  `detectLock(provider)` finds the offending task by looking for one stuck at `Delivered`.
  The call is idempotent: an "already acknowledged" revert counts as success.

### And one that isn't a failure at all

There is exactly one fine-tuning provider per network, and tasks queue one at a time.
`occupied: true` means *busy*, which is the normal case, not an error. It surfaces as
`queued: true` on the wire and never as a failure, never as `Failed`, and never stops a
retry.

---

## Running it

```bash
npm install
npm test            # 155 tests, no wallet, no funds, no network
npm run typecheck
npm run build

PRIVATE_KEY=0x... npm start
```

| Env var | Default | Meaning |
|---|---|---|
| `PRIVATE_KEY` | *(required)* | Signer used to acknowledge deliverables |
| `CRUCIBLE_NETWORK` | `testnet` | `testnet` (16602) or `mainnet` (16661) |
| `CRUCIBLE_PORT` | `8787` | HTTP port |
| `CRUCIBLE_HOST` | `127.0.0.1` | Bind address |
| `CRUCIBLE_DATA_DIR` | `./data` | Job log, adapters, configs, passports |
| `CRUCIBLE_POLL_INTERVAL_MS` | `60000` | Tick interval |
| `CRUCIBLE_RPC_URL` | per network | RPC override |

`src/main.ts` is the only file that reads env vars or builds a wallet-backed broker. That is
why the whole suite runs offline.

---

## API

Base `http://localhost:8787`. Conforms to `docs/INTERFACES.md` §5.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | `{ ok: true, version }` |
| `POST` | `/jobs` | `Job` (201) — body `{ network, provider, model, datasetRootHash \| datasetPath, config }` |
| `GET` | `/jobs` | `Job[]`, newest first |
| `GET` | `/jobs/:id` | `Job` |
| `GET` | `/jobs/:id/logs` | `{ logs: string }` |
| `GET` | `/jobs/:id/stream` | SSE, `event: state`, `data: Job` |
| `POST` | `/jobs/:id/unlock` | `{ ok, taskId, txHash }` |
| `GET` | `/passports` | `PassportRecord[]` |
| `GET` | `/passports/:id` | `PassportRecord` |

Errors are `{ error, code? }` with a real status: 400 invalid body, 404 unknown job/passport,
405 wrong method, 502 upstream chain failure. CORS is open so the web app can call it from
another origin. The SSE stream sends the current job immediately on connect, then every
update, with a keep-alive comment every 20 s.

```ts
interface Job {
  id: string
  network: 'testnet' | 'mainnet'
  provider: string
  taskId: string | null
  state: TaskState                      // plain string union, never an enum
  createdAt: string                     // ISO 8601
  deliveredAt: string | null            // starts the 48h clock
  acknowledgedAt: string | null
  acknowledgeScheduledFor: string | null // when Crucible WILL act
  datasetRootHash: string | null
  adapterPath: string | null
  error: string | null
  queued: boolean                       // provider occupied
  artifactAtRisk: boolean               // acked without a download; model may be gone

  // Optional — the job page's Config, Fee and Dataset panels. Omitted, not
  // null, when a job carries none of them.
  model?: string
  config?: TrainingConfig               // the five 0G parameters
  fee?: { trainingNeuron, storageReserveNeuron, totalNeuron }   // STRINGS
  dataset?: { format, exampleCount, tokenCount }
}
```

`POST /jobs` returns before anything touches the chain: the record is made durable first,
then submission is retried from the tick loop. A crash between "user clicked go" and "task
exists on-chain" costs nothing.

### Where `fee` and `dataset` come from

`model` and `config` are echoed straight back from the submission. The other two are filled
in at submission time, and both degrade to an omitted key rather than a failed job:

- **`dataset`** — if the caller passes a `dataset` summary on `POST /jobs` (having already
  run core's validator) that value wins. Otherwise, when a local `datasetPath` was given,
  `src/dataset.ts` summarises the file using core's exact `detectFormat` rules, taking the
  majority format for a mixed file.
- **`fee`** — computed from the provider's live on-chain `pricePerToken`, the token count,
  and `config.num_train_epochs`, using the same formula as core's `fee.ts`. No price
  available, or a model with no known storage reserve, means no `fee` key — never an error.

Fees are **strings** the whole way. They are neuron amounts up to ~1e18, past
`Number.MAX_SAFE_INTEGER`, and `bigint` cannot be JSON-serialised at all.

> **`dataset.tokenCount` is an estimate**, a ~4-characters-per-token approximation, and so
> `fee` is too. 0G counts tokens itself with its own tokenizer and the broker computes the
> real fee after doing so. These figures exist so a user sees an approximate cost *before*
> funds move; do not treat either as authoritative.

### `PassportRecord`

`/passports` and `/passports/:id` return a wrapper, not a bare manifest — a manifest has no
id and no mint data, so a gallery built on it could neither link to a passport page nor show
a token number:

```ts
interface PassportRecord {
  id: string                  // URL segment: explicit id, else manifest.task.id, else filename
  manifest: PassportManifest  // owned by @crucible/core
  mint: { tokenId, contractAddress, txHash, owner, mintedAt }  // each may be null
  name?: string
  summary?: string
}
```

Passports are read from `$CRUCIBLE_DATA_DIR/passports/*.json`. A file may be a full
`PassportRecord` or a **bare manifest**, which gets wrapped with an all-`null` mint; any
individual `mint` field the file omits is filled in as `null`. `Passport.sol` is not deployed
yet, so `null` is the correct answer today, and the UI renders that as "not yet anchored"
rather than as an error. Lookup by id resolves against the explicit id, the manifest's task
id, or the filename stem.

---

## Design notes

**Storage: newline-delimited JSON, not SQLite.** `better-sqlite3` is a native addon needing a
matching prebuilt binary or a C++ toolchain. This service's entire job is to still be running
unattended two days from now, so a dependency that can fail to *install* is a bad trade for a
workload of tens of rows. The NDJSON log gives what actually matters: a single-`write` append
`fsync`ed before the call returns, replay on open, and a torn trailing line costing one record
instead of the database. It compacts on open, so the file tracks the number of jobs rather
than the number of updates. `test/store.test.ts` covers the crash-torn-line and compaction
cases directly.

**No real timers, anywhere testable.** `Clock` is injected and `tick()` is deterministic, so
tests drive 48 hours of behaviour in milliseconds with a `ManualClock`. The only wall-clock
timer in the codebase is `Ticker`, constructed by `Orchestrator.start()` and never in tests.

**Forward-only state.** `states.ts` is the single place that decides what a reported
`Task.progress` string may do to a job. Progress moves forward or into `Failed`, never
backwards and never out of a terminal state — a flapping provider or a stale read cannot
rewind history. `Task.progress` is typed `string` in the SDK, so unrecognised values are
ignored rather than guessed at.

**Failure is transient by default.** The only thing that marks a job `Failed` is the provider
explicitly reporting `Failed`. An RPC blip never destroys a job that is really still training.

**Duplicated formulas, pinned by test.** `src/fee.ts` and `detectFormat` in `src/dataset.ts`
mirror `@crucible/core` rather than importing it, because this service is standalone and must
not become a workspace member. `test/estimate.test.ts` pins the same worked example core pins
— 10k tokens, 3 epochs, Qwen2.5-0.5B at mainnet pricing = **0.025 0G** — so the two
implementations cannot silently drift apart.

**Layout.** `states` · `clock` · `types` · `store` · `broker` (the port) · `fee` · `dataset` ·
`submitter` · `poller` · `acknowledger` · `recovery` · `orchestrator` (wiring + `tick()`) ·
`wire` · `passports` · `api` · `main`.

---

## Known divergence from `docs/INTERFACES.md`

**`POST /jobs/:id/unlock` returns `txHash: null`.** The spec documents `{ ok, txHash }`, but
the SDK's `acknowledgeDeliverable(provider, taskId, gasPrice?)` resolves to `void` — it does
not surface a transaction hash. The key is present and always `null` rather than invented.
Getting a real hash would need either an SDK change or an out-of-band receipt lookup.

Two additions beyond the spec, both additive and safe to ignore: `artifactAtRisk` on `Job`
(since adopted into §5), and `taskId` in the unlock response.

**The SSE endpoint is currently unused.** The web app polls instead — 2 s on the job page,
3 s on the list. `GET /jobs/:id/stream` remains the better path (no polling, instant
transitions) and stays supported; switching is a one-file change on the client side.
