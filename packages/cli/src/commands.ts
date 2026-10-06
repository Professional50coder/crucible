/**
 * The file-inspection commands: validate, convert, config.
 *
 * Each one is a thin wrapper over `@crucible/core`. None of them reimplements a
 * rule — the rules live in core, where they are tested against a corpus, and
 * duplicating one here would create a second source of truth that drifts.
 *
 * Every function in this module is pure: content in, `{ code, lines }` out. The
 * caller does the file I/O and the printing. That is what lets the tests assert
 * on exact output without a filesystem, and it keeps the standing rule in
 * docs/INTERFACES.md:270 (no test needs a key, funds, or a network) trivially
 * satisfied for this whole surface.
 */
import {
  buildModelCard,
  canonicalize,
  generateSigningKey,
  signManifest,
  STANDARD_TEMPLATE,
  verifyEnvelope,
  type DsseEnvelope,
  convertDataset,
  manifestHash,
  recordsToJsonl,
  validateDatasetFile,
  validateTrainingConfig,
  verifyManifest,
  type DatasetFormat,
  type PassportManifest,
} from '@crucible/core'
import { c, bad, ok, warn } from './format.js'

export interface CommandResult {
  /** Process exit code. 0 clean, 1 any error — the convention the repo scripts expect. */
  code: number
  /** Lines for stderr/stdout status output, already coloured. */
  lines: string[]
  /** Payload for `--out` or stdout, when the command produces a file. */
  output?: string
}

export const DATASET_FORMATS: readonly DatasetFormat[] = ['chat', 'instruction', 'text']

export function isDatasetFormat(v: string): v is DatasetFormat {
  return (DATASET_FORMATS as readonly string[]).includes(v)
}

/**
 * `crucible validate` — byte-level and record-level dataset checks.
 *
 * Uses `validateDatasetFile` rather than `validateDataset` deliberately: the
 * file-level entry point is the only one that can see a BOM, CRLF endings or a
 * blank line, and CRLF is the failure that survives record-level validation and
 * gets rejected only after upload (packages/core/src/dataset.ts:112).
 */
export function validateCommand(content: string, label: string): CommandResult {
  const errors = validateDatasetFile(content)

  if (errors.length === 0) {
    return { code: 0, lines: [`  ${ok} ${label} is a valid 0G dataset`] }
  }

  return {
    code: 1,
    lines: [
      `  ${bad} ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${label}`,
      ...errors.map((e) => `     ${e}`),
    ],
  }
}

/**
 * `crucible config` — training-config validation.
 *
 * A config with an extra parameter is accepted by the CLI and rejected by the
 * broker *after* the task is created and funded, so this check is worth running
 * before money moves (packages/core/src/training-config.ts:1).
 */
export function configCommand(content: string, label: string): CommandResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return {
      code: 1,
      lines: [`  ${bad} ${label} is not valid JSON`, `     ${e instanceof Error ? e.message : String(e)}`],
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { code: 1, lines: [`  ${bad} ${label} must be a JSON object of the five 0G parameters`] }
  }

  const errors = validateTrainingConfig(parsed as Record<string, unknown>)

  if (errors.length === 0) {
    return { code: 0, lines: [`  ${ok} ${label} is a valid 0G training config`] }
  }

  return {
    code: 1,
    lines: [
      `  ${bad} ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${label}`,
      ...errors.map((e) => `     ${e}`),
    ],
  }
}

/**
 * Read a manifest file into an object, or say why it is not one.
 *
 * Shared by verify and card so the two report a broken file identically.
 */
function readManifest(
  content: string,
  label: string,
): { manifest?: Record<string, unknown>; result?: CommandResult } {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return {
      result: {
        code: 1,
        lines: [
          `  ${bad} ${label} is not valid JSON`,
          `     ${e instanceof Error ? e.message : String(e)}`,
        ],
      },
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { result: { code: 1, lines: [`  ${bad} ${label} must be a JSON object`] } }
  }

  return { manifest: parsed as Record<string, unknown> }
}

/**
 * `crucible verify` — recompute a manifest's keccak256 from the file itself.
 *
 * This is the project's central claim reduced to one command: anyone holding the
 * manifest can recompute the anchored hash without trusting Crucible, a server,
 * or an indexer.
 *
 * It deliberately does **not** require the current `PassportManifest` shape.
 * `canonicalize` is structural — sort keys recursively, emit no whitespace — and
 * the only manifest actually anchored on chain (runs/manifest-1.json) is the
 * earlier flat shape from before the passport gained its sections. A verifier
 * that rejected the one manifest a user can check against the chain today would
 * be verifying nothing. The cast is the honest expression of that: the hash is a
 * function of the bytes, not of the type.
 */
export function verifyCommand(content: string, label: string, expected?: string): CommandResult {
  const { manifest, result } = readManifest(content, label)
  if (result) return result

  const typed = manifest as unknown as PassportManifest

  let hash: string
  let canonical: string
  try {
    canonical = canonicalize(typed)
    hash = manifestHash(typed)
  } catch (e) {
    // canonicalize throws by design on NaN/Infinity/bigint — values JSON would
    // silently turn into something else, producing a wrong hash quietly.
    return {
      code: 1,
      lines: [
        `  ${bad} ${label} cannot be canonicalized`,
        `     ${e instanceof Error ? e.message : String(e)}`,
      ],
    }
  }

  const lines = [
    `  ${c.bold(label)}` + c.dim(`  ·  ${canonical.length} canonical bytes`),
    `  keccak256  ${c.cyan(hash)}`,
  ]

  if (expected === undefined) {
    // No --expect is not a pass or a failure: it is a computation. Say what the
    // user still has to do for it to mean anything.
    lines.push(c.dim('     compare it against the anchored hash with --expect <0x…>'))
    return { code: 0, lines, output: `${hash}\n` }
  }

  if (verifyManifest(typed, expected)) {
    return {
      code: 0,
      lines: [...lines, `  ${ok} matches the expected hash`],
      output: `${hash}\n`,
    }
  }

  return {
    code: 1,
    lines: [
      ...lines,
      `  ${bad} does not match the expected hash`,
      `     expected  ${expected.trim()}`,
      `     computed  ${hash}`,
      `     ${c.dim('one byte of the manifest differs from the one that was anchored')}`,
    ],
    output: `${hash}\n`,
  }
}

/**
 * `crucible card` — the Hugging Face model card for a passport.
 *
 * Unlike verify, this one needs the full manifest shape: `buildModelCard` reads
 * the task, base, dataset, training, fee and tee sections by name and there is
 * nothing sensible to print without them. It throws on a manifest missing them,
 * so the throw is caught and reported as a file problem rather than a stack
 * trace — the likely file a user points at is an older flat manifest.
 */
export function cardCommand(content: string, label: string, license?: string): CommandResult {
  const { manifest, result } = readManifest(content, label)
  if (result) return result

  const typed = manifest as unknown as PassportManifest

  try {
    const card = buildModelCard(typed, license === undefined ? {} : { license })
    return {
      code: 0,
      lines: [
        `  ${ok} model card for ${c.bold(label)}` +
          c.dim(license === undefined ? '  ·  no licence declared' : `  ·  licence ${license}`),
      ],
      output: card,
    }
  } catch (e) {
    return {
      code: 1,
      lines: [
        `  ${bad} cannot build a model card from ${label}`,
        `     ${e instanceof Error ? e.message : String(e)}`,
        `     ${c.dim('card needs a full passport manifest — the sections buildManifest writes')}`,
      ],
    }
  }
}

/**
 * `crucible convert` — move a dataset between 0G's three formats.
 *
 * Reports every skipped record individually. `convertDataset`'s contract is that
 * it never silently loses a field (packages/core/src/convert.ts:12), and that
 * promise is only kept if the CLI actually prints what was skipped rather than
 * summarising it away.
 *
 * Skipped records do not fail the command. One unconvertible line out of a
 * thousand should still produce the other 999, which is why core reports rather
 * than throws. The exit code is 1 only when nothing came out at all.
 */
export function convertCommand(
  content: string,
  target: DatasetFormat,
  label: string,
): CommandResult {
  const errors: string[] = []
  const records: unknown[] = []
  // core reports skips by *record* index; blank and unparseable lines are not
  // records, so record index and file line diverge. Keep the map so the user is
  // told the line they can actually go and open.
  const sourceLine: number[] = []

  for (const [index, line] of content.replace(/^\ufeff/, '').split('\n').entries()) {
    if (line.trim() === '') continue
    try {
      records.push(JSON.parse(line))
      sourceLine.push(index + 1)
    } catch {
      errors.push(`Line ${index + 1} is not valid JSON and was not read.`)
    }
  }

  if (records.length === 0) {
    return {
      code: 1,
      lines: [`  ${bad} no readable JSON records in ${label}`, ...errors.map((e) => `     ${e}`)],
    }
  }

  const result = convertDataset(records, target)
  const lines: string[] = []

  lines.push(
    `  ${c.bold(`${label} → ${target}`)}` +
      c.dim(`  ·  ${result.converted} converted, ${result.unchanged} already ${target}`),
  )

  for (const e of errors) lines.push(`  ${warn} ${e}`)

  for (const s of result.skipped) {
    const line = sourceLine[s.line - 1] ?? s.line
    lines.push(`  ${warn} line ${line} skipped (${s.from ?? 'unrecognised format'}): ${s.reason}`)
  }

  if (result.lossy) {
    // Stated outright rather than as a footnote: converting to `text` destroys
    // the role boundaries permanently and there is no inverse conversion.
    lines.push(
      `  ${warn} ${c.yellow('LOSSY')} — converting to text discards role/field structure. ` +
        `It cannot be converted back; keep the original.`,
    )
  }

  if (result.records.length === 0) {
    lines.push(`  ${bad} nothing converted`)
    return { code: 1, lines }
  }

  return { code: 0, lines, output: recordsToJsonl(result.records) }
}

/**
 * `crucible keygen` — a fresh ed25519 key pair for signing passports.
 *
 * Returns both PEMs and writes nothing: the caller decides where the private key
 * lives, because a command that silently drops a private key on disk is a
 * command that gets one committed.
 */
export function keygenCommand(): {
  code: number
  lines: string[]
  privateKeyPem: string
  publicKeyPem: string
} {
  const { privateKeyPem, publicKeyPem } = generateSigningKey()
  return {
    code: 0,
    lines: [
      `  ${ok} generated an ed25519 key pair`,
      c.dim('     keep the private key out of version control'),
    ],
    privateKeyPem,
    publicKeyPem,
  }
}

/**
 * `crucible sign` — wrap a manifest in a DSSE envelope.
 *
 * The signature proves the holder of the key signed this manifest. It does not
 * say the training was honest; Crucible proves lineage, not honest training.
 */
export function signCommand(
  manifestContent: string,
  label: string,
  privateKeyPem: string,
  publicKeyPem: string,
): CommandResult {
  const { manifest, result } = readManifest(manifestContent, label)
  if (result) return result

  const typed = manifest as unknown as PassportManifest
  try {
    const envelope = signManifest(typed, privateKeyPem, publicKeyPem)
    return {
      code: 0,
      lines: [`  ${ok} signed ${c.bold(label)}`, `  keccak256  ${c.cyan(manifestHash(typed))}`],
      output: JSON.stringify(envelope, null, 2) + '\n',
    }
  } catch (e) {
    return {
      code: 1,
      lines: [`  ${bad} could not sign ${label}`, `     ${e instanceof Error ? e.message : String(e)}`],
    }
  }
}

/**
 * `crucible verify-envelope` — check a signed envelope offline.
 *
 * Needs the envelope and a public key and nothing else: no network, no 0G RPC.
 * With `--expect` the manifest inside must also re-hash to the anchored value.
 */
export function verifyEnvelopeCommand(
  envelopeContent: string,
  label: string,
  publicKeyPem: string,
  expected?: string,
): CommandResult {
  let envelope: DsseEnvelope
  try {
    envelope = JSON.parse(envelopeContent) as DsseEnvelope
  } catch {
    return { code: 1, lines: [`  ${bad} ${label} is not valid JSON`] }
  }

  const verdict = verifyEnvelope(envelope, publicKeyPem, expected)
  if (!verdict.ok) {
    return {
      code: 1,
      lines: [`  ${bad} ${label} FAILED verification`, `     ${verdict.reason ?? 'unknown reason'}`],
    }
  }

  const lines = [
    `  ${ok} signature verifies for ${c.bold(label)}`,
    `  keccak256  ${c.cyan(verdict.statement!.predicate.manifestKeccak256)}`,
  ]
  lines.push(
    expected === undefined
      ? c.dim('     compare against the anchored hash with --expect <0x…>')
      : `  ${ok} matches the expected on-chain hash`,
  )
  return { code: 0, lines }
}

/** A file `crucible init` wants written, relative to the target directory. */
export interface ScaffoldFile {
  path: string
  content: string
}

/**
 * Chat-format examples for the starter dataset. They are about small,
 * checkable things (this tool's own vocabulary) so a reader can see what a
 * record is for. Ten is 0G's minimum; real behaviour change needs hundreds,
 * which the generated README says.
 */
const STARTER_EXAMPLES: ReadonlyArray<readonly [string, string]> = [
  ['What does keccak256 produce?', 'A 32-byte hash, usually written as a 0x-prefixed string of 64 hex characters.'],
  ['Why sort the keys before hashing a JSON manifest?', 'JSON objects have no guaranteed key order, so two equal manifests could serialise differently. Sorting the keys and removing whitespace gives one canonical byte string to hash.'],
  ['What is a training epoch?', 'One full pass over the training dataset.'],
  ['What does the learning rate control?', 'How large a step the optimiser takes when it updates the model weights. Too high can make training unstable; too low makes it slow.'],
  ['What is a LoRA adapter?', 'A small set of extra weights trained on top of a frozen base model, so fine-tuning changes only a tiny fraction of the parameters.'],
  ['Why keep a private signing key out of version control?', 'Anyone who can read the key can sign as you. Once it is committed it stays in the history, so treat it as leaked and replace it.'],
  ['What does a signature on a manifest prove?', 'That the holder of the key signed exactly this manifest. It does not prove the training itself was honest.'],
  ['What is the difference between validating a dataset and training on it?', 'Validation only checks the file against the format rules. Training is the paid step that actually updates the model.'],
  ['Why check a config before submitting a task?', 'The broker can reject a config with an extra or out-of-range parameter after the task is created and funded, so a local check saves money.'],
  ['What is a record in the chat dataset format?', 'One JSON object per line with a messages array, where each message has a role such as user or assistant and a content string.'],
  ['How many examples does a useful fine-tune need?', 'The platform minimum is 10, but visibly changing the behaviour of a small model usually takes hundreds to a thousand well-chosen examples.'],
  ['Can I trust a model just because it has a passport?', 'A passport proves lineage: which dataset hash and config produced which adapter. It does not prove the adapter is good or safe.'],
]

const SCAFFOLD_ENV = `# Copy to .env and fill in. Never commit .env.
# Wallet that pays for training on 0G. Fund it only as much as you need.
PRIVATE_KEY=<your-wallet-private-key>

# testnet or mainnet
ZG_NETWORK=testnet
`

const SCAFFOLD_GITIGNORE = `.env
*.key
node_modules/
`

function scaffoldReadme(name: string): string {
  return `# ${name}

A starter project for a verifiable 0G fine-tune, created by \`crucible init\`.

- \`dataset.jsonl\`: ${STARTER_EXAMPLES.length} chat-format examples. Replace them with your own. 0G's minimum is 10; a visible behaviour change usually needs hundreds.
- \`config.json\`: 0G's standard five-parameter training config.
- \`.env.example\`: copy to \`.env\` and fill in. \`.env\` and \`*.key\` are git-ignored.

## Flow

\`\`\`
crucible validate dataset.jsonl
crucible config config.json
crucible doctor testnet --dataset dataset.jsonl
# run the fine-tune, then keep the Model Passport manifest it produces
crucible verify manifest.json --expect <0xhash>
crucible keygen keys
crucible sign manifest.json --key keys/passport-signing.key --pub keys/passport-signing.pub --out envelope.json
crucible verify-envelope envelope.json --pub keys/passport-signing.pub --expect <0xhash>
\`\`\`

A signature proves who signed the manifest, not that training was honest.
`
}

/**
 * `crucible init` — the files for a starter project, as data.
 *
 * Pure: no filesystem. The caller checks the target with
 * `scaffoldTargetProblem` and writes the files. Nothing here is a real key;
 * `.env.example` holds placeholders only.
 */
export function initCommand(name: string): { code: number; lines: string[]; files: ScaffoldFile[] } {
  const dataset =
    STARTER_EXAMPLES.map(([user, assistant]) =>
      JSON.stringify({
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: assistant },
        ],
      }),
    ).join('\n') + '\n'

  const files: ScaffoldFile[] = [
    { path: 'dataset.jsonl', content: dataset },
    { path: 'config.json', content: JSON.stringify(STANDARD_TEMPLATE, null, 2) + '\n' },
    { path: '.env.example', content: SCAFFOLD_ENV },
    { path: '.gitignore', content: SCAFFOLD_GITIGNORE },
    { path: 'README.md', content: scaffoldReadme(name) },
  ]

  return {
    code: 0,
    lines: [
      `  ${ok} scaffolded ${files.length} files`,
      c.dim('     next: crucible validate dataset.jsonl && crucible config config.json'),
    ],
    files,
  }
}

/**
 * Why a directory cannot be scaffolded into, or undefined if it can.
 * `entries` is the directory listing, or undefined when it does not exist.
 */
export function scaffoldTargetProblem(dir: string, entries: string[] | undefined): string | undefined {
  if (entries === undefined || entries.length === 0) return undefined
  return `${dir} is not empty; refusing to overwrite it`
}
