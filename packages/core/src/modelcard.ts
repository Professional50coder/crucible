/**
 * Turn a passport into a Hugging Face model card.
 *
 * A Crucible run already knows every fact a Hub model card wants: the base model, the
 * dataset it was trained on, the config, the cost, and the hash that ties them together.
 * Until now that information stopped at Crucible's own UI. The Hub's model-card YAML
 * front matter accepts `base_model` together with `base_model_relation`
 * (adapter | merge | quantized | finetune) and uses the pair to render fine-tune lineage
 * and to filter derived models — see https://huggingface.co/docs/hub/en/model-cards. So a
 * passport can print a paste-ready card and carry its 0G anchor onto the largest model
 * registry there is.
 *
 * Two decisions in here are not cosmetic.
 *
 * **`base_model_relation: adapter`, never `finetune`.** A LoRA adapter is a small set of
 * low-rank deltas loaded *on top of* frozen base weights; it is not a full set of updated
 * weights. `finetune` would tell the Hub — and every human reading the card — that this repo
 * contains a whole model. It does not, and it will not load like one.
 *
 * **The card repeats the passport's disclaimers rather than dropping them.** A passport is
 * an evidence record, and an evidence record that gets more confident when it is copied
 * somewhere else is worthless. So the unverified attestation, the sentinel adapter hash,
 * and the fact that Crucible proves *lineage* and not honest training all travel with the
 * card. Publishing is exactly where the temptation to round up lives, which is exactly why
 * these are unconditional here.
 */

import { keccak256, toUtf8Bytes } from 'ethers'

import { formatOg } from './fee.js'
import { NETWORKS } from './networks.js'
import { type PassportManifest, manifestHash, storageLookupUrl } from './passport.js'

/** Where a minted passport lives on chain. Everything here is needed to build a link. */
export interface ModelCardMint {
  /** The Passport ERC-721 contract on `manifest.network`. */
  contract: string
  tokenId: number | string
  /** The mint transaction, when the caller kept it. */
  txHash?: string
}

export interface ModelCardOptions {
  /**
   * SPDX identifier for the *adapter*, e.g. `apache-2.0`. Omitted when unknown — the Hub
   * shows "unknown" for a missing licence, which is honest; a guessed one is not.
   */
  license?: string
  /** Extra Hub tags, appended after the defaults and de-duplicated. */
  tags?: string[]
  /** H1 for the card. Defaults to naming the base model it adapts. */
  title?: string
  /**
   * Overrides the Hub repo id written to `base_model`. Supply it when the base model's Hub
   * id differs from anything the manifest records.
   */
  baseModel?: string
  /** Present once the passport is on chain; the card then links to it. */
  mint?: ModelCardMint
}

/** Tags every Crucible card carries, so the whole corpus is findable as one set. */
export const MODEL_CARD_TAGS = ['crucible', '0g', 'lora', 'peft', 'provenance'] as const

/**
 * The marker a passport carries when the run finished but the adapter was never pulled out
 * of 0G Storage. `mint()` rejects a zero adapter hash, so a labelled sentinel is the only
 * honest way to record "there is nothing here" — and it is deliberately not a plausible
 * root hash, so anyone who recomputes it learns that immediately.
 *
 * Kept byte-identical to contracts/scripts/mint.js:152 and tools/verify-manifest.mjs:149.
 */
export function sentinelAdapterHash(taskId: string): string {
  return keccak256(toUtf8Bytes(`crucible:adapter-not-retrieved:${taskId}`))
}

/**
 * True when the manifest's adapter hash stands for nothing. Accepts the literal string the
 * mint script also allows, so a card built from either representation says the same thing.
 */
export function hasSentinelAdapter(manifest: PassportManifest): boolean {
  const declared = manifest.adapter.rootHash.trim().toLowerCase()
  return declared === 'sentinel' || declared === sentinelAdapterHash(manifest.task.id).toLowerCase()
}

/**
 * Plain YAML scalars may not begin with an indicator character or contain `: ` or ` #`, and
 * a bare `yes` / `1.0` / `null` would be read back as a boolean, a float or a null rather
 * than as the string it is. Anything outside this set gets quoted.
 */
const PLAIN_SAFE = /^[A-Za-z0-9][A-Za-z0-9 ._\-/+]*$/
const YAML_KEYWORD = /^(y|n|yes|no|true|false|on|off|null|~)$/i
const NUMERIC_LOOKING = /^[-+]?(\d[\d_]*)(\.\d*)?([eE][-+]?\d+)?$/
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/

/**
 * Emit a string as a YAML scalar that reads back as the same string.
 *
 * Model names and licence strings are free text the caller does not always control — a
 * colon, a quote or a `#` in one of them would otherwise split the front matter and
 * silently change every key below it, which is a broken card the author only finds out
 * about once it is on the Hub.
 */
export function yamlScalar(value: string): string {
  // Control characters cannot appear inside single quotes at all. JSON's escapes (\n, \t,
  // \", \\, \uXXXX) are a strict subset of YAML's double-quoted escapes, so this is exact.
  if (CONTROL_CHAR.test(value)) return JSON.stringify(value)

  if (value.length > 0 && PLAIN_SAFE.test(value) && !YAML_KEYWORD.test(value)) {
    if (!NUMERIC_LOOKING.test(value)) return value
  }

  // Single quotes: no escape processing inside, so a lone `'` is the only thing to handle
  // and backslashes stay literal. Safer than double quotes for paths and hashes.
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * The Hub resolves `base_model` as a repo id (`owner/name`); a bare name links to nothing,
 * so the lineage graph the field exists to draw never gets drawn. The manifest records both
 * forms — `base.model` is 0G's own identifier and carries no `Qwen/` prefix, while
 * `base.tokenizer` is the Hub repo id for the same weights (docs/INTERFACES.md) — so prefer
 * the one the Hub can actually resolve, and let the caller override it.
 */
function resolveBaseModel(manifest: PassportManifest, options: ModelCardOptions): string {
  if (options.baseModel) return options.baseModel
  if (manifest.base.tokenizer.includes('/')) return manifest.base.tokenizer
  return manifest.base.model
}

/** `testnet` is named outright; nothing in a card may read as a production claim. */
function networkLabel(manifest: PassportManifest): string {
  const label = manifest.network === 'testnet' ? '0G Galileo testnet' : `0G ${manifest.network}`
  return `${label} (chain ID ${manifest.chainId})`
}

function frontMatter(manifest: PassportManifest, options: ModelCardOptions): string[] {
  const tags = [...MODEL_CARD_TAGS, ...(options.tags ?? [])].filter(
    (tag, i, all) => all.indexOf(tag) === i,
  )

  const lines = [
    '---',
    `base_model: ${yamlScalar(resolveBaseModel(manifest, options))}`,
    // Not `finetune`: this repo holds low-rank deltas, not a full set of weights.
    'base_model_relation: adapter',
  ]

  if (options.license) lines.push(`license: ${yamlScalar(options.license)}`)

  lines.push('tags:')
  for (const tag of tags) lines.push(`  - ${yamlScalar(tag)}`)
  lines.push('---')

  return lines
}

/**
 * Renders a paste-ready Hugging Face model card: YAML front matter carrying the Hub's
 * lineage fields, then a body stating what the run was and how a stranger checks it.
 */
export function buildModelCard(manifest: PassportManifest, options: ModelCardOptions = {}): string {
  const { explorerUrl } = NETWORKS[manifest.network]
  const baseModel = resolveBaseModel(manifest, options)
  const hash = manifestHash(manifest)
  const training = manifest.training

  const lines: string[] = [
    ...frontMatter(manifest, options),
    '',
    `# ${options.title ?? `LoRA adapter for ${baseModel}`}`,
    '',
    'A LoRA adapter produced by a 0G Compute fine-tuning task and recorded by a Crucible',
    'Model Passport. Every figure below comes from that passport, and every one of them can',
    'be checked against the chain and 0G Storage without asking Crucible for anything.',
    '',
    '## The run',
    '',
    `- **Network:** ${networkLabel(manifest)}`,
    `- **Task:** \`${manifest.task.id}\` — state \`${manifest.task.state}\``,
    `- **Provider:** [\`${manifest.task.provider}\`](${explorerUrl}/address/${manifest.task.provider})`,
    `- **Base model:** \`${manifest.base.model}\` (tokenizer \`${manifest.base.tokenizer}\`)`,
    `- **Base model hash:** \`${manifest.base.modelHash}\``,
    `- **Recorded:** ${manifest.createdAt}`,
    '',
    '## Dataset',
    '',
    `- **0G Storage root hash:** \`${manifest.dataset.rootHash}\``,
    `- **Format:** \`${manifest.dataset.format}\` — ${manifest.dataset.exampleCount} examples, ` +
      `${manifest.dataset.tokenCount} tokens`,
    `- **Look it up:** ${storageLookupUrl(manifest.network, manifest.dataset.rootHash)}`,
    '',
    '## Training config',
    '',
    'The five parameters 0G accepts, exactly as the task was funded with:',
    '',
    '| Parameter | Value |',
    '| --- | --- |',
    `| \`neftune_noise_alpha\` | ${training.neftune_noise_alpha} |`,
    `| \`num_train_epochs\` | ${training.num_train_epochs} |`,
    `| \`per_device_train_batch_size\` | ${training.per_device_train_batch_size} |`,
    `| \`learning_rate\` | ${training.learning_rate} |`,
    `| \`max_steps\` | ${training.max_steps} |`,
    '',
    '## Cost',
    '',
    `Paid on ${networkLabel(manifest)} — training ` +
      `${formatOg(BigInt(manifest.fee.trainingNeuron))} 0G, storage reserve ` +
      `${formatOg(BigInt(manifest.fee.storageReserveNeuron))} 0G, ` +
      `**total ${formatOg(BigInt(manifest.fee.totalNeuron))} 0G** ` +
      `(${manifest.fee.totalNeuron} neuron).`,
    '',
    '## Adapter',
    '',
  ]

  if (hasSentinelAdapter(manifest)) {
    // The value is a label, not a locator. Printing it without this paragraph would let a
    // reader take it for a stored artifact they could go and fetch.
    lines.push(
      '**No adapter file was ever retrieved.** The passport records',
      `\`${manifest.adapter.rootHash}\`, which is a labelled sentinel and not a 0G Storage root`,
      'hash. Its on-chain form is `keccak256("crucible:adapter-not-retrieved:<taskId>")`, which',
      'anyone can recompute from the task ID above. Nothing is stored under it and Storage Scan',
      'will find nothing: it stands for an absence, not for a file.',
    )
  } else {
    lines.push(
      `- **0G Storage root hash:** \`${manifest.adapter.rootHash}\``,
      manifest.adapter.sizeBytes !== undefined
        ? `- **Size:** ${manifest.adapter.sizeBytes} bytes`
        : '- **Size:** not recorded',
      `- **Look it up:** ${storageLookupUrl(manifest.network, manifest.adapter.rootHash)}`,
    )
  }

  lines.push('', '## Execution environment', '')

  if (manifest.tee.attestationVerified) {
    lines.push(
      "The provider's TEE attestation **was verified**: the quote from signer",
      `\`${manifest.tee.signerAddress}\` was checked before this passport was written.`,
    )
  } else {
    // The single most tempting thing to round up when publishing. It stays blunt.
    lines.push(
      "The TEE attestation was **NOT verified.** Crucible recorded the provider's declared",
      `TEE signer address \`${manifest.tee.signerAddress}\` as the broker reported it, and did`,
      'not call `verifyService()` to check the quote behind it. Nothing here shows that this',
      'run happened inside a genuine trusted execution environment. Read the signer address as',
      'a claim made by the provider, not as evidence.',
    )
  }

  lines.push(
    '',
    `The task acknowledgement ${manifest.tee.acknowledged ? 'was' : 'was **not**'} recorded.`,
    '',
    '## What this proves, and what it does not',
    '',
    '**Crucible proves lineage, not honest training.** The passport shows which dataset, which',
    'base model and which config were named for this task, and that those names have not',
    'changed since. It cannot show that the provider actually trained on that dataset, or',
    'trained at all. A provider that ignored the data and returned arbitrary weights would',
    'produce a passport that verifies exactly like this one.',
    '',
    '## Verify it yourself',
    '',
    `- **Manifest hash:** \`${hash}\``,
    '',
    '1. Take the passport manifest JSON. Sort its object keys recursively in code-unit order,',
    '   emit it with no whitespace, and `keccak256` the UTF-8 bytes. You get the hash above —',
    '   any edit to any field gives a different one.',
    `2. Compare that hash with the one anchored on ${networkLabel(manifest)}. If they differ,`,
    '   the manifest in front of you is not the one that was anchored.',
    '3. Resolve the dataset root hash on Storage Scan using the link above, and read the',
    '   provider address on the chain explorer. Both are third-party sources; neither needs',
    '   Crucible to be online, or honest.',
  )

  if (options.mint) {
    const { contract, tokenId, txHash } = options.mint
    lines.push('', '## On chain', '')
    lines.push(`- **Passport token:** ${explorerUrl}/token/${contract}?a=${tokenId}`)
    if (txHash) lines.push(`- **Mint transaction:** ${explorerUrl}/tx/${txHash}`)
  }

  return `${lines.join('\n')}\n`
}
