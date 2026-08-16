/**
 * Argument parsing and usage text.
 *
 * Hand-rolled rather than pulled from a parser library: the whole surface is
 * four commands and three flags, and the package's dependency list is currently
 * short enough to audit at a glance, which is worth keeping.
 *
 * `parseArgs` is pure and total — it never exits and never prints. Errors come
 * back as a value so the tests can assert on them without capturing a process.
 */
import { DATASET_FORMATS, isDatasetFormat } from './commands.js'
import type { DatasetFormat } from '@crucible/core'

export const USAGE = `crucible — preflight and dataset tooling for 0G fine-tuning

USAGE
  crucible doctor [testnet|mainnet] [--dataset <file.jsonl>]
      Check providers, price a run, and check your wallet.
      With --dataset the cost is estimated from that file's tokens; without it,
      the cost shown is 0G's documented 10,000-token example, not your data.

  crucible validate <file.jsonl>
      Validate a dataset against 0G's rules — encoding, line endings, blank
      lines, record shape, format consistency, minimum example count.
      Exit 0 if clean, 1 if anything is wrong.

  crucible convert <file.jsonl> --to <chat|instruction|text> [--out <file.jsonl>]
      Convert between 0G's three dataset formats. Writes to --out, or stdout.
      Records that cannot convert without losing a field are skipped and
      reported by line. Converting to text is lossy and says so.

  crucible config <file.json>
      Validate a training config against 0G's five-parameter template.
      Exit 0 if clean, 1 if anything is wrong.

  crucible verify <manifest.json> [--expect <0xhash>]
      Recompute a Model Passport's keccak256 from the file: canonical JSON
      (keys sorted, no whitespace), then keccak256. Prints the hash to stdout.
      With --expect, compares it against the hash anchored on chain and exits
      1 if they differ. This is the whole provenance claim, checkable by anyone
      holding the manifest, with no network and no trust in Crucible.

  crucible card <manifest.json> [--license <id>]
      Print the Hugging Face model card for a passport, to stdout. --license
      takes an SPDX id for the adapter; without it the Hub shows "unknown",
      which is honest, and a guessed licence is not.

  crucible help
      This text.

NOTES
  Token counts printed by this CLI are ~4-chars-per-token estimates, not
  tokenizer output. The broker's calculateToken is the figure you are billed on.
`

export type Command =
  | { kind: 'doctor'; network: string; dataset?: string }
  | { kind: 'validate'; file: string }
  | { kind: 'convert'; file: string; to: DatasetFormat; out?: string }
  | { kind: 'config'; file: string }
  | { kind: 'verify'; file: string; expect?: string }
  | { kind: 'card'; file: string; license?: string }
  | { kind: 'help' }
  | { kind: 'error'; message: string }

/** Read `--name value`, returning the value and removing both from `rest`. */
function takeFlag(rest: string[], name: string): { value?: string; error?: string } {
  const at = rest.indexOf(`--${name}`)
  if (at === -1) return {}
  const value = rest[at + 1]
  if (value === undefined || value.startsWith('--')) {
    return { error: `--${name} needs a value.` }
  }
  rest.splice(at, 2)
  return { value }
}

/**
 * @param argv argv without node and script — i.e. `process.argv.slice(2)`
 * @param defaultNetwork ZG_NETWORK if set, else testnet. Injected so tests do
 *        not depend on the caller's environment.
 */
export function parseArgs(argv: string[], defaultNetwork = 'testnet'): Command {
  const rest = [...argv]
  const command = rest.shift() ?? 'doctor'

  if (command === 'help' || command === '--help' || command === '-h') return { kind: 'help' }

  if (command === 'doctor') {
    const dataset = takeFlag(rest, 'dataset')
    if (dataset.error) return { kind: 'error', message: dataset.error }

    const network = rest.shift() ?? defaultNetwork
    const cmd: Command = { kind: 'doctor', network }
    if (dataset.value !== undefined) cmd.dataset = dataset.value
    return cmd
  }

  if (command === 'validate' || command === 'config') {
    const file = rest.shift()
    if (file === undefined) return { kind: 'error', message: `${command} needs a file path.` }
    return command === 'validate' ? { kind: 'validate', file } : { kind: 'config', file }
  }

  if (command === 'verify') {
    const expect = takeFlag(rest, 'expect')
    if (expect.error) return { kind: 'error', message: expect.error }

    const file = rest.shift()
    if (file === undefined) return { kind: 'error', message: 'verify needs a manifest path.' }

    const cmd: Command = { kind: 'verify', file }
    if (expect.value !== undefined) cmd.expect = expect.value
    return cmd
  }

  if (command === 'card') {
    const license = takeFlag(rest, 'license')
    if (license.error) return { kind: 'error', message: license.error }

    const file = rest.shift()
    if (file === undefined) return { kind: 'error', message: 'card needs a manifest path.' }

    const cmd: Command = { kind: 'card', file }
    if (license.value !== undefined) cmd.license = license.value
    return cmd
  }

  if (command === 'convert') {
    const to = takeFlag(rest, 'to')
    if (to.error) return { kind: 'error', message: to.error }
    const out = takeFlag(rest, 'out')
    if (out.error) return { kind: 'error', message: out.error }

    const file = rest.shift()
    if (file === undefined) return { kind: 'error', message: 'convert needs a file path.' }
    if (to.value === undefined) {
      return { kind: 'error', message: `convert needs --to <${DATASET_FORMATS.join('|')}>.` }
    }
    if (!isDatasetFormat(to.value)) {
      return {
        kind: 'error',
        message: `Unknown format "${to.value}". 0G has three: ${DATASET_FORMATS.join(', ')}.`,
      }
    }

    const cmd: Command = { kind: 'convert', file, to: to.value }
    if (out.value !== undefined) cmd.out = out.value
    return cmd
  }

  return {
    kind: 'error',
    message:
      `Unknown command "${command}". ` +
      `Available: doctor, validate, convert, config, verify, card, help.`,
  }
}
