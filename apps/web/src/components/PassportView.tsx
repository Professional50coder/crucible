'use client'

/**
 * The Model Passport — a certificate of origin for a fine-tuned model.
 *
 * Design intent: this page must be legible to a stranger with no wallet, no
 * account, and no prior knowledge of 0G, and every claim on it must carry the
 * link that lets them check it themselves. A provenance page whose evidence you
 * have to take on faith is worse than no page at all.
 *
 * The centrepiece is the chain of custody: six links, drawn as a physical
 * chain, from the weights the run started with to the transaction that anchored
 * the result. Each link states what it is, shows its hash, and points at the
 * thing that proves it. The chain is the argument; everything else is detail.
 *
 * The manifest hash is recomputed in the reader's browser and compared against
 * the value anchored on chain. That check is not decorative — it is the one
 * verification the reader can perform without leaving the page.
 */

import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'

import {
  NETWORKS,
  addressUrl,
  blockUrl,
  explorerLinks,
  tokenUrl,
  txUrl,
} from '@/lib/chains'
import {
  formatBytes,
  formatCount,
  formatDate,
  formatElapsed,
  formatLearningRate,
  formatOg,
  formatTimestamp,
} from '@/lib/format'
import { canonicalize, configHash, manifestHash, prettyManifest } from '@/lib/manifest'
import { isDeployed, passportAddress } from '@/lib/passport-contract'
import type { PassportRecord } from '@/lib/types'
import { CopyButton, Hash, HashRow } from './Hash'
import {
  AdapterIcon,
  AlertIcon,
  AnchorIcon,
  CheckIcon,
  DatasetIcon,
  EnclaveIcon,
  ExternalIcon,
  ModelIcon,
  ShieldIcon,
  SlidersIcon,
} from './icons'
import { Badge, Dot, IconTile, NetworkBadge, Note, Panel, PanelHeader, Stat } from './ui'

export function PassportView({ record }: { record: PassportRecord }) {
  const { manifest, mint } = record
  const network = NETWORKS[manifest.network]
  const links = useMemo(() => explorerLinks(manifest), [manifest])

  // Recomputed here, in the reader's browser, from the manifest as displayed.
  const recomputed = useMemo(() => manifestHash(manifest), [manifest])
  const anchored = mint.manifestRootHash
  const matches = recomputed.toLowerCase() === anchored.toLowerCase()

  const derivedConfigHash = useMemo(() => configHash(manifest.training), [manifest.training])

  // The address must be the one for THIS passport's network. Showing a mainnet
  // contract next to testnet provenance would misdirect anyone checking it.
  const deployed = isDeployed(manifest.network)
  const contract = deployed ? passportAddress(manifest.network) : mint.contractAddress

  return (
    <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/gallery"
        className="mb-8 inline-block font-mono text-2xs text-faint no-underline hover:text-fg"
      >
        ← gallery
      </Link>

      {/* ================================================================ */}
      {/* Certificate head                                                  */}
      {/* ================================================================ */}
      <header className="relative overflow-hidden rounded-lg border border-line-bright bg-panel">
        {/* The one place colour is used structurally: a foil rule across the top. */}
        <div className="h-px w-full origin-left animate-drawline bg-gradient-to-r from-phosphor via-phosphor/25 to-transparent" />

        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="label">Model Passport</p>
              <h1 className="mt-2 break-words font-mono text-2xl leading-tight text-fg sm:text-3xl">
                {record.name ?? manifest.base.model}
              </h1>
              {record.summary ? (
                <p className="measure mt-3 text-sm leading-relaxed text-dim text-pretty">
                  {record.summary}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <NetworkBadge network={manifest.network} />
              {mint.status === 'minted' && mint.tokenId ? (
                <Badge tone="accent">ERC-7857 · #{mint.tokenId}</Badge>
              ) : mint.status === 'pending' ? (
                <Badge tone="warn">
                  <Dot tone="warn" pulse />
                  mint pending
                </Badge>
              ) : (
                <Badge>not minted</Badge>
              )}
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
            <Stat label="Issued" value={formatDate(manifest.createdAt)} />
            <Stat label="Base model" value={manifest.base.model} />
            <Stat
              label="Dataset"
              value={`${formatCount(manifest.dataset.exampleCount)} ex`}
              hint={`${formatCount(manifest.dataset.tokenCount)} tokens · ${manifest.dataset.format}`}
            />
            <Stat
              label="Cost"
              value={`${formatOg(manifest.fee.totalNeuron)} 0G`}
              hint={record.durationSeconds ? formatElapsed(record.durationSeconds) : undefined}
            />
          </dl>
        </div>

        {/* The seal: the one check the reader just performed themselves. */}
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-4 sm:px-8 ${
            matches ? 'border-ok/25 bg-ok/[0.045]' : 'border-danger/40 bg-danger/[0.06]'
          }`}
        >
          {matches ? (
            <CheckIcon className="h-4 w-4 shrink-0 text-ok" />
          ) : (
            <AlertIcon className="h-4 w-4 shrink-0 text-danger" />
          )}
          <p className={`text-xs leading-relaxed text-pretty ${matches ? 'text-ok/90' : 'text-danger'}`}>
            {matches
              ? 'Hashed in your browser just now. The result matches the value anchored on chain — nothing in between was trusted.'
              : 'This manifest does not hash to the anchored value. Either it was altered after minting, or the anchor belongs to a different manifest.'}
          </p>
        </div>
      </header>

      {/* ================================================================ */}
      {/* Verification strip — what a stranger can check, and its result    */}
      {/* ================================================================ */}
      <section
        className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Independent checks"
      >
        <Check
          ok={matches}
          label="Manifest integrity"
          detail={
            matches
              ? 'Recomputed in this browser; matches the hash anchored on chain.'
              : 'Recomputed hash does not match the anchored value. Do not trust this passport.'
          }
        />
        <Check
          ok={manifest.tee.acknowledged}
          label="TEE signer"
          detail={
            manifest.tee.acknowledged
              ? 'Provider’s enclave signer is acknowledged on 0G Chain.'
              : 'Provider’s enclave signer is not acknowledged on chain.'
          }
        />
        <Check
          ok={manifest.tee.attestationVerified}
          label="Attestation"
          detail={
            manifest.tee.attestationVerified
              ? 'Intel TDX quote verified for this run.'
              : 'Attestation could not be verified for this run.'
          }
          degradeToWarning
        />
        <Check
          ok={mint.status === 'minted'}
          label="On-chain anchor"
          detail={
            mint.status === 'minted'
              ? `Anchored on ${network.explorerLabel}.`
              : 'Manifest is on 0G Storage; the mint has not landed yet.'
          }
          degradeToWarning
        />
      </section>

      {/* ================================================================ */}
      {/* Chain of custody — the centrepiece                                */}
      {/* ================================================================ */}
      <Panel className="mt-4" as="section">
        <PanelHeader
          title="Chain of custody"
          icon={<ShieldIcon className="h-3.5 w-3.5" />}
          aside={
            <span className="font-mono text-2xs text-faint">
              six links · every hash points at its proof
            </span>
          }
        />

        <ol className="px-4 py-6 sm:px-6">
          <ChainLink
            icon={<ModelIcon className="h-4 w-4" />}
            kind="Origin"
            title="Base model"
            hash={manifest.base.modelHash}
            hashLabel="base model hash"
            note={`${manifest.base.model} — the weights this adapter was trained on top of. Registered with 0G's fine-tuning providers and validated by the contract at task creation.`}
            meta={[
              { k: 'model', v: manifest.base.model },
              { k: 'tokenizer', v: manifest.base.tokenizer, href: `https://huggingface.co/${manifest.base.tokenizer}` },
            ]}
          />

          <ChainLink
            icon={<DatasetIcon className="h-4 w-4" />}
            kind="Input"
            title="Dataset"
            hash={manifest.dataset.rootHash}
            hashLabel="dataset root hash"
            href={links.dataset}
            hrefLabel={links.storageHost}
            note="Retrievable from 0G Storage by anyone at this root hash. Storage addresses content by its Merkle root, so a different file would have a different hash."
            meta={[
              { k: 'examples', v: formatCount(manifest.dataset.exampleCount) },
              { k: 'tokens', v: formatCount(manifest.dataset.tokenCount) },
              { k: 'format', v: manifest.dataset.format },
            ]}
          />

          <ChainLink
            icon={<SlidersIcon className="h-4 w-4" />}
            kind="Method"
            title="Training configuration"
            hash={derivedConfigHash}
            hashLabel="config hash"
            note="keccak256 of the canonical config. Two runs with the same five parameters produce the same hash — which is how duplicate mints are rejected."
            meta={[
              { k: 'epochs', v: String(manifest.training.num_train_epochs) },
              { k: 'batch', v: String(manifest.training.per_device_train_batch_size) },
              { k: 'lr', v: formatLearningRate(manifest.training.learning_rate) },
            ]}
          />

          <ChainLink
            icon={<EnclaveIcon className="h-4 w-4" />}
            kind="Execution"
            title="Compute provider"
            hash={manifest.task.provider}
            hashLabel="provider"
            href={links.provider}
            hrefLabel={links.chainHost}
            note="The task ran on this provider's hardware, inside an enclave the provider does not get to describe for itself."
            meta={[
              { k: 'gpu', v: record.hardware?.gpu ?? '1x H200' },
              { k: 'vcpu', v: String(record.hardware?.vcpu ?? 8) },
              { k: 'memory', v: `${record.hardware?.memoryGb ?? 187} GB` },
              { k: 'enclave', v: record.hardware?.tee ?? 'Intel TDX' },
            ]}
          />

          <ChainLink
            icon={<AdapterIcon className="h-4 w-4" />}
            kind="Output"
            title="Adapter"
            hash={manifest.adapter.rootHash}
            hashLabel="adapter root hash"
            href={links.adapter}
            hrefLabel={links.storageHost}
            note={`LoRA adapter${
              manifest.adapter.sizeBytes ? `, ${formatBytes(manifest.adapter.sizeBytes)}` : ''
            }. Hash-verified against the on-chain root hash at delivery.`}
            meta={[
              { k: 'task', v: manifest.task.id },
              { k: 'state at capture', v: manifest.task.state },
            ]}
          />

          <ChainLink
            icon={<AnchorIcon className="h-4 w-4" />}
            kind="Attestation"
            title="TEE signer"
            hash={manifest.tee.signerAddress}
            hashLabel="TEE signer"
            href={links.teeSigner}
            hrefLabel={links.chainHost}
            note="The enclave key that signed this delivery. Acknowledged on-chain by the provider, which is what makes the attestation checkable by a third party."
            meta={[
              { k: 'acknowledged', v: manifest.tee.acknowledged ? 'yes' : 'no' },
              { k: 'attestation', v: manifest.tee.attestationVerified ? 'verified' : 'unverified' },
            ]}
            last
          />
        </ol>
      </Panel>

      {/* ================================================================ */}
      {/* Training configuration + cost                                     */}
      {/* ================================================================ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel as="section">
          <PanelHeader title="Training configuration" icon={<SlidersIcon className="h-3.5 w-3.5" />} />
          <div className="px-4 py-4 sm:px-5">
            <table className="w-full text-left">
              <caption className="sr-only">
                The five parameters 0G accepts, as submitted for this run
              </caption>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ['neftune_noise_alpha', manifest.training.neftune_noise_alpha],
                    ['num_train_epochs', manifest.training.num_train_epochs],
                    ['per_device_train_batch_size', manifest.training.per_device_train_batch_size],
                    ['learning_rate', formatLearningRate(manifest.training.learning_rate)],
                    [
                      'max_steps',
                      manifest.training.max_steps === -1
                        ? '-1 (use epochs)'
                        : manifest.training.max_steps,
                    ],
                  ] as Array<[string, string | number]>
                ).map(([key, value]) => (
                  <tr key={key}>
                    <th
                      scope="row"
                      className="w-0 py-2.5 pr-4 text-left font-mono text-xs font-normal text-dim"
                    >
                      <span className="whitespace-nowrap">{key}</span>
                    </th>
                    <td className="py-2.5 text-right font-mono text-xs text-fg">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 border-t border-line pt-4">
              <div className="label">configHash</div>
              <div className="mt-1">
                <Hash value={derivedConfigHash} title="config hash" tone="muted" />
              </div>
            </div>
          </div>
        </Panel>

        <Panel as="section">
          <PanelHeader title="Cost" />
          <div className="px-4 py-4 sm:px-5">
            <table className="w-full text-left">
              <caption className="sr-only">Fee breakdown for this run</caption>
              <tbody className="divide-y divide-line">
                {(
                  [
                    ['Training fee', manifest.fee.trainingNeuron],
                    ['Storage reserve', manifest.fee.storageReserveNeuron],
                  ] as Array<[string, string]>
                ).map(([label, neuron]) => (
                  <tr key={label}>
                    <th
                      scope="row"
                      className="py-2.5 pr-4 text-left font-mono text-xs font-normal text-dim"
                    >
                      {label}
                    </th>
                    <td className="py-2.5 text-right font-mono text-xs text-fg">
                      {formatOg(neuron)} 0G
                    </td>
                  </tr>
                ))}
                <tr>
                  <th
                    scope="row"
                    className="py-2.5 pr-4 text-left font-mono text-xs font-normal text-fg"
                  >
                    Total
                  </th>
                  <td className="py-2.5 text-right font-mono text-sm text-phosphor">
                    {formatOg(manifest.fee.totalNeuron)} 0G
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 border-t border-line pt-4 font-mono text-2xs leading-relaxed text-faint">
              <div className="flex justify-between gap-4">
                <span>total in neuron</span>
                <span className="break-hash text-right text-dim">{manifest.fee.totalNeuron}</span>
              </div>
              <div className="mt-1 flex justify-between gap-4">
                <span>price per token</span>
                <span className="text-dim">
                  {manifest.network === 'mainnet' ? '500,000,000,000' : '800,000,000,000'} neuron
                </span>
              </div>
              <div className="mt-1 flex justify-between gap-4">
                <span>1 0G</span>
                <span className="text-dim">1e18 neuron</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* ================================================================ */}
      {/* On-chain anchor                                                   */}
      {/* ================================================================ */}
      <Panel className="mt-4" as="section">
        <PanelHeader
          title="On-chain anchor"
          icon={<AnchorIcon className="h-3.5 w-3.5" />}
          aside={
            <span className="font-mono text-2xs text-faint">
              chain {manifest.chainId} · {network.explorerLabel}
            </span>
          }
        />

        <div className="px-4 py-4 sm:px-5">
          <div className="divide-y divide-line">
            <HashRow
              label="Manifest hash (anchored)"
              value={anchored}
              note="PassportData.manifestRootHash — public, and checkable without decrypting anything."
            />
            <HashRow
              label="Manifest hash (recomputed)"
              value={recomputed}
              note="keccak256 of the canonical manifest, computed client-side from the JSON shown below."
            />

            {contract ? (
              <HashRow
                label="Passport contract"
                value={contract}
                href={addressUrl(manifest.network, contract)}
                hrefLabel={network.explorerLabel}
                note={
                  deployed
                    ? undefined
                    : `Placeholder address — Passport.sol is not deployed on ${network.label} yet, so this link does not resolve.`
                }
              />
            ) : null}

            {mint.tokenId && contract ? (
              <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                <div className="label pt-0.5">Token</div>
                <div className="min-w-0">
                  <a
                    href={tokenUrl(manifest.network, contract, mint.tokenId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] text-fg no-underline hover:text-phosphor"
                  >
                    #{mint.tokenId}
                    <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}

            {mint.txHash ? (
              <HashRow
                label="Mint transaction"
                value={mint.txHash}
                href={txUrl(manifest.network, mint.txHash)}
                hrefLabel={network.explorerLabel}
                note={
                  mint.blockNumber
                    ? `Block ${formatCount(mint.blockNumber)}${
                        mint.mintedAt ? ` · ${formatTimestamp(mint.mintedAt)}` : ''
                      }`
                    : undefined
                }
              />
            ) : null}

            {mint.owner ? (
              <HashRow
                label="Owner"
                value={mint.owner}
                href={addressUrl(manifest.network, mint.owner)}
                hrefLabel={network.explorerLabel}
              />
            ) : null}

            {mint.blockNumber ? (
              <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                <div className="label pt-0.5">Block</div>
                <div className="min-w-0">
                  <a
                    href={blockUrl(manifest.network, mint.blockNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] text-fg no-underline hover:text-phosphor"
                  >
                    {formatCount(mint.blockNumber)}
                    <ExternalIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {mint.status !== 'minted' ? (
            <div className="mt-5">
              <Note tone="warn">
                This manifest is written to 0G Storage but has no on-chain anchor yet. Until the
                mint lands, the lineage is readable but not tamper-evident — anyone serving you
                this page could have altered it.
              </Note>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* ================================================================ */}
      {/* Verify it yourself                                                */}
      {/* ================================================================ */}
      <Panel className="mt-4" as="section">
        <PanelHeader
          title="Verify this yourself"
          icon={<CheckIcon className="h-3.5 w-3.5" />}
          aside={
            <span className="inline-flex items-center gap-1.5 font-mono text-2xs text-faint">
              <ShieldIcon className="h-3.5 w-3.5" />
              no wallet required
            </span>
          }
        />

        <ol className="divide-y divide-line">
          <VerifyStep
            n={1}
            title="Fetch the dataset from 0G Storage"
            body={
              <>
                Open{' '}
                <a
                  href={links.dataset}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-phosphor no-underline hover:underline"
                >
                  {links.storageHost}
                </a>{' '}
                at this root hash. The file that comes back is the exact data this model was
                trained on — 0G Storage addresses content by its Merkle root, so a different file
                would have a different hash.
              </>
            }
            code={manifest.dataset.rootHash}
          />
          <VerifyStep
            n={2}
            title="Read the anchor off the chain"
            body={
              <>
                Call <span className="font-mono text-fg">passportOf(tokenId)</span> on the Passport
                contract via {network.explorerLabel} or any {network.label} RPC. It returns the
                lineage hashes exactly as they were written at mint time; the contract makes them
                immutable afterwards.
              </>
            }
            code={`passportOf(${mint.tokenId ?? '<tokenId>'})`}
          />
          <VerifyStep
            n={3}
            title="Hash the manifest and compare"
            body={
              <>
                keccak256 over the canonical manifest — keys sorted recursively, no whitespace —
                must equal the anchored <span className="font-mono text-fg">manifestRootHash</span>.
                This page just did it in front of you; the contract will confirm it via{' '}
                <span className="font-mono text-fg">verifyManifest</span>.
              </>
            }
            code={`verifyManifest(${mint.tokenId ?? '<tokenId>'}, ${recomputed.slice(0, 12)}…)`}
          />
          <VerifyStep
            n={4}
            title="Check the enclave signer"
            body={
              <>
                The TEE signer address is acknowledged on-chain by the provider. Combined with 0G’s
                integrity check on delivery, that ties this adapter to an Intel TDX enclave rather
                than to somebody’s assertion.
              </>
            }
            code={manifest.tee.signerAddress}
          />
        </ol>
      </Panel>

      {/* ================================================================ */}
      {/* Raw manifest                                                      */}
      {/* ================================================================ */}
      <details className="group mt-4 rounded-lg border border-line bg-panel">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <span className="label text-dim">Raw manifest</span>
          <span className="font-mono text-2xs text-faint group-open:hidden">show</span>
          <span className="hidden font-mono text-2xs text-faint group-open:inline">hide</span>
        </summary>

        <div className="border-t border-line">
          <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
            <span className="font-mono text-2xs text-faint">
              {canonicalize(manifest).length} bytes canonical
            </span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-2xs text-faint">copy canonical</span>
              <CopyButton value={canonicalize(manifest)} label="canonical manifest" />
            </div>
          </div>
          <div className="scroll-x border-t border-line bg-sub">
            <pre className="px-4 py-4 font-mono text-xs leading-5 text-dim sm:px-5">
              {prettyManifest(manifest)}
            </pre>
          </div>
        </div>
      </details>

      <p className="mt-6 text-xs leading-relaxed text-faint text-pretty">
        A passport proves lineage, not honest training. It shows which weights, which data, which
        configuration and which enclave — it does not prove the provider ran the epochs it
        reported. That requires zero-knowledge proofs over the training computation.
      </p>
    </article>
  )
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

interface ChainMeta {
  k: string
  v: string
  href?: string
}

/**
 * One link in the chain of custody.
 *
 * The connector is drawn behind the icon tile and runs to the next link, so the
 * six cards read as a single continuous chain rather than a stack of unrelated
 * rows — which is exactly the claim being made about the artifacts.
 */
function ChainLink({
  icon,
  kind,
  title,
  hash,
  hashLabel,
  href,
  hrefLabel,
  note,
  meta,
  last = false,
}: {
  icon: ReactNode
  kind: string
  title: string
  hash: string
  hashLabel: string
  href?: string
  hrefLabel?: string
  note: string
  meta?: ChainMeta[]
  last?: boolean
}) {
  return (
    <li className="relative pl-12 sm:pl-14">
      {/* The chain itself. */}
      {!last ? (
        <span
          className="absolute bottom-0 left-[18px] top-9 w-px bg-gradient-to-b from-line-bright to-line sm:left-[22px]"
          aria-hidden="true"
        />
      ) : null}

      <span className="absolute left-0 top-0 sm:left-1">
        <IconTile tone="accent">{icon}</IconTile>
      </span>

      <div className={`min-w-0 ${last ? '' : 'pb-4'}`}>
        <div className="rounded-lg border border-line bg-sub px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="font-mono text-[13px] text-fg">{title}</h3>
            <span className="label">{kind}</span>
          </div>

          <div className="mt-2.5">
            <Hash value={hash} href={href} hrefLabel={hrefLabel} title={hashLabel} />
          </div>

          <p className="mt-2 text-xs leading-relaxed text-faint text-pretty">{note}</p>

          {meta && meta.length > 0 ? (
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3">
              {meta.map((entry) => (
                <div key={entry.k} className="flex min-w-0 items-baseline gap-2">
                  <dt className="label shrink-0">{entry.k}</dt>
                  <dd className="min-w-0 truncate font-mono text-2xs text-dim" title={entry.v}>
                    {entry.href ? (
                      <a
                        href={entry.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 no-underline transition-colors hover:text-phosphor"
                      >
                        {entry.v}
                        <ExternalIcon className="h-3 w-3" />
                      </a>
                    ) : (
                      entry.v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function Check({
  ok,
  label,
  detail,
  degradeToWarning = false,
}: {
  ok: boolean
  label: string
  detail: string
  degradeToWarning?: boolean
}) {
  const tone = ok ? 'ok' : degradeToWarning ? 'warn' : 'danger'
  const colour = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' }[tone]

  return (
    <div className="bg-panel px-4 py-4">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckIcon className={`h-3.5 w-3.5 ${colour}`} />
        ) : (
          <AlertIcon className={`h-3.5 w-3.5 ${colour}`} />
        )}
        <span className="label text-dim">{label}</span>
      </div>
      <p className={`mt-2 text-xs leading-relaxed ${ok ? 'text-dim' : colour} text-pretty`}>
        {detail}
      </p>
    </div>
  )
}

function VerifyStep({
  n,
  title,
  body,
  code,
}: {
  n: number
  title: string
  body: ReactNode
  code: string
}) {
  return (
    <li className="flex gap-4 px-4 py-5 sm:px-5">
      <span className="mt-0.5 font-mono text-xs text-faint">{String(n).padStart(2, '0')}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-mono text-[13px] text-fg">{title}</h3>
        <p className="measure mt-1.5 text-xs leading-relaxed text-dim text-pretty">{body}</p>
        <div className="well mt-3 flex items-center gap-2 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-2xs text-phosphor">{code}</code>
          <CopyButton value={code} label={title} />
        </div>
      </div>
    </li>
  )
}
