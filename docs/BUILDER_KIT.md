# Builder kit

A walkthrough of the `crucible` CLI (`packages/cli`). Every command and flag below is taken from `crucible help` (`USAGE` in `packages/cli/src/cli.ts`). Status lines go to stderr; where a command prints a payload (a hash, a converted dataset, a card) it goes to stdout so it can be piped.

Run from the monorepo with `npx tsx packages/cli/src/index.ts <command>` (the package `bin` is `src/index.ts`).

## 1. Start a project

```
crucible init my-finetune
```

Writes `dataset.jsonl` (12 chat-format examples that pass `validate`), `config.json` (0G's standard template), `.env.example` (placeholders only), `.gitignore` (ignores `.env` and `*.key`) and a `README.md`. It refuses to write into a non-empty directory. The starter examples exist to show the shape; 0G's minimum is 10 and a visible behaviour change usually needs hundreds, so replace them.

## 2. Check your inputs (offline)

```
crucible validate dataset.jsonl
crucible config config.json
```

- `validate` checks encoding, line endings, blank lines, record shape, format consistency and the 10-example minimum. Exit 0 if clean, 1 otherwise.
- `config` checks the five-parameter 0G template (no extra parameters, values in range). Exit 0 or 1.

If your data is in another of 0G's three formats:

```
crucible convert data.jsonl --to chat --out dataset.jsonl
```

`--to` is `chat`, `instruction` or `text`. Without `--out` the result goes to stdout. Records that cannot convert without losing a field are skipped and reported by line; converting to `text` is lossy and says so.

## 3. Preflight against the network

```
crucible doctor testnet --dataset dataset.jsonl
```

Checks providers, prices a run and checks your wallet (`PRIVATE_KEY` from `.env`; network defaults to `ZG_NETWORK` or testnet). With `--dataset` the cost is estimated from that file's tokens; without it the figure is 0G's 10,000-token reference example, not your data. Token counts are ~4-characters-per-token estimates; the broker's figure is what you are billed.

## 4. Run the fine-tune

Training itself is not a `crucible` CLI command. Run it through the orchestrator/0G tooling in this repo, which yields a Model Passport manifest (`manifest.json`).

## 5. Verify, card, sign

```
crucible verify manifest.json --expect 0x<anchored-hash>
crucible card manifest.json --license apache-2.0 > README.md
crucible keygen keys
crucible sign manifest.json --key keys/passport-signing.key --pub keys/passport-signing.pub --out envelope.json
crucible verify-envelope envelope.json --pub keys/passport-signing.pub --expect 0x<anchored-hash>
```

- `verify` recomputes the keccak256 of the canonical manifest (keys sorted, no whitespace) and prints it to stdout. With `--expect` it exits 1 if it differs from the on-chain hash. No network.
- `card` prints a Hugging Face model card. `--license` takes an SPDX id; omit it and the Hub shows "unknown" rather than a guess.
- `keygen <out-dir>` writes an ed25519 pair, `passport-signing.key` and `passport-signing.pub`, and refuses to overwrite an existing key. Keep the `.key` out of version control.
- `sign` wraps the manifest in a signed DSSE envelope. Without `--out` it prints to stdout.
- `verify-envelope` checks the signature offline; with `--expect` the manifest inside must also hash to the anchored value. Exit 1 on any failure.

## What this proves

A matching hash shows the manifest you hold is the one anchored on chain. A signature shows who signed that manifest. Neither proves the training was honest.
