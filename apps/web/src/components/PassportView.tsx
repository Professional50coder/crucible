'use client'

/**
 * The Model Passport — a certificate of origin for a fine-tuned model.
 *
 * Design intent: this page must be legible to a stranger with no wallet, no
 * account, and no prior knowledge of 0G, and every claim on it must carry the
 * link that lets them check it themselves. A provenance page whose evidence you
 * have to take on faith is worse than no page at all.
 *
 * Three rules the page holds itself to, in priority order:
 *
 * 1. **Never link a hash that cannot be checked.** A demo record's invented
 *    dataset root next to a live explorer link teaches the reader that the links
 *    are decorative, and the whole argument collapses. Demo values render as
 *    values, with a line saying so.
 * 2. **Never overstate the run.** A task that reached `Delivered` and no further
 *    has no adapter, and the field that would hold one carries a published
 *    sentinel. The page recomputes the sentinel in front of the reader rather
 *    than dressing it up as an artifact hash.
 * 3. **Do the one check locally.** The anchored hash is recomputed in the
 *    reader's browser from the exact document that was hashed at mint. A
 *    verification you watch happen is worth more than one a server asserts.
 *
 * The page reads top to bottom as an argument:
 *
 *   head          what this is, its full identifier, and the record quad
 *   caveat        anything that must be read before the evidence it qualifies
 *   VERIFICATION  the one check, performed here, both hashes stacked
 *   settlement    what the chain says happened to the deliverable
 *   custody       six links from the base weights to the anchoring transaction
 *   decoded       the manifest as a typed record rather than a hash dump
 *   anchor        the on-chain half, in full
 *
 * Two structural patterns are reimplemented from the Ethereum Attestation
 * Service's single-attestation view (easscan.org) — the full untruncated
 * identifier under the title, and typed field rows. Both are ideas, not code;
 * nothing was copied. See docs/PRIOR_ART.md.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  NETWORKS,
  addressUrl,
  blockUrl,
  explorerLinks,
  storageLookupUrl,
  storageSubmissionUrl,
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
import {
  canonicalHash,
  canonicalize,
  configHash,
  hashUtf8,
  prettyManifest,
} from '@/lib/manifest'
import { DEPLOYMENT_BLOCKS, isDeployed, passportAddress } from '@/lib/passport-contract'
import type { PassportRecord } from '@/lib/types'
import { CopyButton, Hash, TypedRow, TypedRows } from './Hash'
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
  TerminalIcon,
} from './icons'
import { Badge, Dot, IconTile, NetworkBadge, Note, Panel, PanelHeader, Stat } from './ui'

/** The result of the one check the reader performs without leaving the page. */
type Integrity = 'verified' | 'mismatch' | 'demo'

export function PassportView({ record }: { record: PassportRecord }) {
  const { manifest, mint } = record
  const network = NETWORKS[manifest.network]
  const links = useMemo(() => explorerLinks(manifest), [manifest])

  /**
   * Whether this record's values exist on chain. Absent means demo: a record has
   * to earn the claim, because the cost of getting this backwards is a reader who
   * clicks a link, lands on a 404, and stops believing the rest of the page.
   */
  const onChain = record.provenance === 'chain'

  /** A link target, but only where following it proves something. */
  const proof = (url: string): string | undefined => (onChain ? url : undefined)

  /**
   * The document the anchored hash actually commits to. For token #1 that is a
   * smaller record than this app's v1 manifest, carried verbatim so the
   * recomputation below reproduces the on-chain value byte-for-byte instead of
   * asserting a match it cannot demonstrate.
   */
  const hashedDocument = record.anchoredManifest ?? manifest
  const canonicalDocument = useMemo(() => canonicalize(hashedDocument), [hashedDocument])
  const recomputed = useMemo(() => canonicalHash(hashedDocument), [hashedDocument])
  const anchored = mint.manifestRootHash
  const matches = recomputed.toLowerCase() === anchored.toLowerCase()

  const integrity: Integrity = !onChain ? 'demo' : matches ? 'verified' : 'mismatch'

  const derivedConfigHash = useMemo(() => configHash(manifest.training), [manifest.training])
  const configMatches =
    mint.configHash === undefined ||
    mint.configHash.toLowerCase() === derivedConfigHash.toLowerCase()

  /** The adapter field, and whether it holds an artifact or an admission. */
  const adapter = record.adapterOrigin ?? { kind: 'retrieved' as const }
  const sentinel = adapter.kind === 'sentinel'

  /**
   * The deliverable was never acknowledged, so 0G destroyed the artifact and
   * took its 30%. This is the fact the page must not let a provider-reported
   * `Finished` paper over.
   */
  const lost = record.settlement?.acknowledged === false
  const sentinelReproduces =
    adapter.sentinelPreimage !== undefined &&
    hashUtf8(adapter.sentinelPreimage).toLowerCase() === manifest.adapter.rootHash.toLowerCase()

  // The address must be the one for THIS passport's network. Showing a mainnet
  // contract next to testnet provenance would misdirect anyone checking it.
  const deployed = isDeployed(manifest.network)
  const contract = onChain
    ? (mint.contractAddress ?? passportAddress(manifest.network))
    : mint.contractAddress

  const serial = mint.tokenId ? `#${mint.tokenId}` : '—'

  return (
    <article className="passport mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/gallery"
        className="no-print mb-8 inline-block font-mono text-2xs text-faint no-underline hover:text-fg"
      >
        ← gallery
      </Link>

      {/* ================================================================ */}
      {/* Certificate head                                                  */}
      {/* ================================================================ */}
      <header className="relative overflow-hidden rounded-lg border border-line-bright bg-panel shadow-panel">
        {/* The one place colour is used structurally: a foil rule across the top. */}
        <div className="h-px w-full origin-left animate-drawline bg-gradient-to-r from-phosphor via-phosphor/25 to-transparent" />

        {/* The provenance ribbon. First thing read, because it governs how much
            weight every hash below it carries. */}
        <ProvenanceRibbon onChain={onChain} network={manifest.network} tokenId={mint.tokenId} />

        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
            <div className="min-w-0 flex-1">
              <p className="label">Model Passport</p>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {/* The serial. A certificate has a number on it, set large. */}
                <span
                  className="font-mono text-readout leading-none text-phosphor"
                  aria-label={mint.tokenId ? `Token number ${mint.tokenId}` : 'Not minted'}
                >
                  {serial}
                </span>
                <h1 className="min-w-0 break-words font-mono text-2xl leading-tight text-fg sm:text-3xl">
                  {record.name ?? manifest.base.model}
                </h1>
              </div>

              <p className="mt-2 font-mono text-2xs text-faint">
                issued by Crucible · ERC-7857-style Agentic ID · anchored on {network.label}
              </p>

              {/*
                The full identifier, untruncated. On a certificate the complete
                hash *is* the content — truncation is for tables. This is the
                value the whole page exists to let you check.
              */}
              <div className="mt-5 border-t border-line pt-4">
                <div className="label">
                  {onChain
                    ? 'Anchored manifest hash · PassportData.manifestRootHash'
                    : 'Manifest hash on this demo record'}
                </div>
                <div className="mt-1.5">
                  <Hash value={anchored} title="anchored manifest hash" full />
                </div>
              </div>

              {record.summary ? (
                <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
                  {record.summary}
                </p>
              ) : null}
            </div>

            {/* The record quad, mirroring how an attestation states its metadata:
                four small label-over-value pairs, no prose. */}
            <div className="flex shrink-0 flex-col items-start gap-4 sm:items-end">
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <NetworkBadge network={manifest.network} />
                {mint.status === 'minted' ? (
                  <Badge tone="ok">
                    <CheckIcon className="h-3 w-3" />
                    minted
                  </Badge>
                ) : mint.status === 'pending' ? (
                  <Badge tone="warn">
                    <Dot tone="warn" pulse />
                    mint pending
                  </Badge>
                ) : (
                  <Badge>not minted</Badge>
                )}
              </div>

              <dl className="grid w-full grid-cols-2 gap-x-8 gap-y-4 sm:w-auto">
                <QuadCell
                  label="Minted"
                  value={mint.mintedAt ? formatDate(mint.mintedAt) : '—'}
                  hint={mint.mintedAt ? formatTimestamp(mint.mintedAt).slice(11) : undefined}
                />
                <QuadCell
                  label="Block"
                  value={mint.blockNumber ? formatCount(mint.blockNumber) : '—'}
                  href={
                    mint.blockNumber ? proof(blockUrl(manifest.network, mint.blockNumber)) : undefined
                  }
                />
                <QuadCell
                  label="Network"
                  value={network.label}
                  hint={`chain ${manifest.chainId}`}
                />
                <QuadCell
                  label="Token"
                  value={serial}
                  href={
                    mint.tokenId && contract && deployed
                      ? proof(tokenUrl(manifest.network, contract, mint.tokenId))
                      : undefined
                  }
                />
              </dl>
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
            {/* 0G's task state is the provider's view of its own work. Whether
                anyone ever collected the artifact is a separate fact, and the
                hint is where the two are kept apart. */}
            <Stat
              label="Task state on 0G"
              value={manifest.task.state}
              tone={
                manifest.task.state === 'Failed' || lost
                  ? 'danger'
                  : sentinel || manifest.task.state !== 'Finished'
                    ? 'warn'
                    : 'ok'
              }
              hint={
                lost
                  ? 'provider-reported · deliverable never acknowledged'
                  : sentinel
                    ? 'adapter never retrieved'
                    : manifest.task.state === 'Finished'
                      ? (record.durationSeconds
                          ? formatElapsed(record.durationSeconds)
                          : 'model retrieved')
                      : 'did not reach Finished'
              }
            />
          </dl>
        </div>
      </header>

      {/* ================================================================ */}
      {/* The caveat, before anything it qualifies.                         */}
      {/* ================================================================ */}
      {record.caveat ? (
        <section
          className="mt-4 rounded-lg border border-warn/35 bg-warn/[0.05] px-5 py-5 sm:px-6"
          aria-labelledby="passport-caveat"
        >
          <div className="flex items-start gap-3">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="min-w-0">
              <h2 id="passport-caveat" className="font-mono text-sm leading-snug text-warn">
                {record.caveat.title}
              </h2>
              <p className="measure mt-2 text-sm leading-relaxed text-dim text-pretty">
                {record.caveat.body}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ================================================================ */}
      {/* THE VERIFICATION. The one check, performed here, in front of you.  */}
      {/* ================================================================ */}
      <VerificationHero
        integrity={integrity}
        anchored={anchored}
        recomputed={recomputed}
        canonicalBytes={canonicalDocument.length}
        anchoredIsFullManifest={record.anchoredManifest === undefined}
        tokenId={mint.tokenId}
        explorerLabel={network.explorerLabel}
        indexerUrl={network.indexerUrl}
        manifestRootHash={onChain ? record.manifestStorage?.rootHash : undefined}
      />

      {/* ================================================================ */}
      {/* What a stranger can check, and its result                         */}
      {/* ================================================================ */}
      <section
        className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3"
        aria-label="Independent checks"
      >
        <Check
          state={manifest.tee.acknowledged ? 'ok' : 'warn'}
          label="TEE signer"
          detail={
            manifest.tee.acknowledged
              ? 'Provider’s enclave signer is acknowledged on 0G Chain — checkable with no credentials.'
              : 'Provider’s enclave signer is not acknowledged on chain.'
          }
        />
        <Check
          state={manifest.tee.attestationVerified ? 'ok' : 'warn'}
          label="Attestation"
          detail={
            manifest.tee.attestationVerified
              ? 'Intel TDX quote verified for this run.'
              : sentinel
                ? 'Not verified. verifyService() was never called on this run, and the attestation is checked on delivery acknowledgement — the step that never completed. The manifest records attestationVerified: false.'
                : 'Attestation could not be verified for this run.'
          }
        />
        <Check
          state={sentinel || lost ? 'bad' : manifest.adapter.rootHash ? 'ok' : 'warn'}
          label="Adapter"
          detail={
            lost
              ? 'Lost. The deliverable was never acknowledged, so 0G destroyed the artifact and deducted 30% of the fee.'
              : sentinel
                ? 'No adapter exists. The hash on this passport is a published sentinel, not an artifact.'
                : `LoRA adapter${
                    manifest.adapter.sizeBytes ? `, ${formatBytes(manifest.adapter.sizeBytes)}` : ''
                  }, hash-verified against the on-chain root hash at delivery.`
          }
        />
      </section>

      {/* ================================================================ */}
      {/* How the deliverable settled — the fact `Finished` does not carry.  */}
      {/* ================================================================ */}
      {record.settlement ? (
        <section
          className={`mt-4 overflow-hidden rounded-lg border ${
            lost ? 'border-danger/35 bg-danger/[0.05]' : 'border-ok/25 bg-ok/[0.04]'
          }`}
          aria-labelledby="settlement"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-inherit px-5 py-3 sm:px-6">
            {lost ? (
              <AlertIcon className="h-4 w-4 shrink-0 text-danger" />
            ) : (
              <CheckIcon className="h-4 w-4 shrink-0 text-ok" />
            )}
            <h2
              id="settlement"
              className={`font-mono text-xs uppercase tracking-widest2 ${
                lost ? 'text-danger' : 'text-ok'
              }`}
            >
              {lost ? 'Deliverable never acknowledged — model destroyed' : 'Deliverable acknowledged'}
            </h2>
            <span className="font-mono text-2xs text-faint">
              read from 0G’s FineTuningServing contract, not from the provider
            </span>
          </div>

          <div className="grid gap-6 px-5 py-5 sm:grid-cols-4 sm:px-6">
            <Stat
              label="getDeliverables.acknowledged"
              value={record.settlement.acknowledged ? 'true' : 'false'}
              tone={record.settlement.acknowledged ? 'ok' : 'danger'}
              hint="on-chain, and authoritative"
            />
            {lost ? (
              <Stat
                label="encryptedSecret"
                value="0x"
                tone="danger"
                hint="empty — no decryption key was ever shared"
              />
            ) : null}
            <Stat
              label="Fee paid"
              value={`${formatOg(manifest.fee.totalNeuron)} 0G`}
              hint="charged in full"
            />
            {record.settlement.penaltyNeuron ? (
              <Stat
                label="Penalty deducted"
                value={`${formatOg(record.settlement.penaltyNeuron)} 0G`}
                tone="danger"
                hint={`${penaltyPercent(
                  record.settlement.penaltyNeuron,
                  manifest.fee.totalNeuron,
                )} of the fee — 0G’s missed-acknowledgement deduction`}
              />
            ) : null}
          </div>

          {record.settlement.note ? (
            <p className="measure border-t border-inherit px-5 py-4 text-xs leading-relaxed text-dim text-pretty sm:px-6">
              {record.settlement.note}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ================================================================ */}
      {/* Chain of custody — the narrative                                  */}
      {/* ================================================================ */}
      <Panel className="mt-4" as="section">
        <PanelHeader
          title="Chain of custody"
          icon={<ShieldIcon className="h-3.5 w-3.5" />}
          aside={
            <span className="font-mono text-2xs text-faint">
              six links · every hash beside the thing that proves it
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
            note={`${manifest.base.model} — the weights this adapter was trained on top of. Registered with 0G’s fine-tuning providers and validated by the contract at task creation.`}
            meta={[
              { k: 'model', v: manifest.base.model },
              {
                k: 'tokenizer',
                v: manifest.base.tokenizer,
                href: `https://huggingface.co/${manifest.base.tokenizer}`,
              },
            ]}
          />

          <ChainLink
            icon={<DatasetIcon className="h-4 w-4" />}
            kind="Input"
            title="Dataset"
            hash={manifest.dataset.rootHash}
            hashLabel="dataset root hash"
            href={proof(links.dataset)}
            hrefLabel={links.storageHost}
            unverifiable={!onChain}
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
            note="keccak256 of the canonical config, recomputed here from the five parameters below. Two runs with the same five parameters produce the same hash — which is how duplicate mints are rejected."
            meta={[
              { k: 'epochs', v: String(manifest.training.num_train_epochs) },
              { k: 'batch', v: String(manifest.training.per_device_train_batch_size) },
              { k: 'lr', v: formatLearningRate(manifest.training.learning_rate) },
              { k: 'max steps', v: String(manifest.training.max_steps) },
            ]}
            footer={
              mint.configHash ? (
                <VerdictLine
                  ok={configMatches}
                  okText="Matches PassportData.configHash on chain."
                  badText="Does not match the configHash anchored on chain."
                />
              ) : null
            }
          />

          <ChainLink
            icon={<EnclaveIcon className="h-4 w-4" />}
            kind="Execution"
            title="Compute provider"
            hash={manifest.task.provider}
            hashLabel="provider"
            // The provider address is genuine on every record in this app, so it
            // is linkable even on a demo one.
            href={links.provider}
            hrefLabel={links.chainHost}
            note="The task ran on this provider’s hardware, inside an enclave the provider does not get to describe for itself."
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
            hashLabel={sentinel ? 'adapter sentinel' : 'adapter root hash'}
            href={sentinel ? undefined : proof(links.adapter)}
            hrefLabel={links.storageHost}
            unverifiable={!sentinel && !onChain}
            tone={sentinel ? 'danger' : 'default'}
            note={
              sentinel
                ? 'This is not an adapter root hash. No adapter was ever retrieved for this run, and the contract rejects a zero hash, so the mint anchored an explicit sentinel instead of a plausible-looking one.'
                : `LoRA adapter${
                    manifest.adapter.sizeBytes
                      ? `, ${formatBytes(manifest.adapter.sizeBytes)}`
                      : ''
                  }. Hash-verified against the on-chain root hash at delivery.`
            }
            meta={[
              { k: 'task', v: manifest.task.id },
              { k: 'state at capture', v: manifest.task.state },
            ]}
            footer={
              sentinel ? (
                <SentinelProof
                  preimage={adapter.sentinelPreimage}
                  reproduces={sentinelReproduces}
                  reason={adapter.reason}
                />
              ) : null
            }
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
      {/* Decoded manifest — the record format, not a hash dump             */}
      {/* ================================================================ */}
      <Panel className="mt-4" as="section">
        <PanelHeader
          title="Decoded manifest"
          icon={<TerminalIcon className="h-3.5 w-3.5" />}
          aside={
            <span className="font-mono text-2xs text-faint">
              v{manifest.version} schema · {canonicalDocument.length} bytes canonical
            </span>
          }
        />

        <TypedRows>
          <TypedRow type="string" name="task.id" value={manifest.task.id} />
          <TypedRow
            type="address"
            name="task.provider"
            value={manifest.task.provider}
            href={links.provider}
            hrefLabel={links.chainHost}
            hash
          />
          <TypedRow
            type="string"
            name="task.state"
            value={manifest.task.state}
            tone={lost ? 'warn' : 'default'}
            note={
              lost
                ? 'Provider-reported and off-chain. It describes the provider’s own work, not whether anyone collected the deliverable — see the settlement panel above.'
                : undefined
            }
          />
          <TypedRow type="string" name="base.model" value={manifest.base.model} />
          <TypedRow type="bytes32" name="base.modelHash" value={manifest.base.modelHash} hash />
          <TypedRow
            type="string"
            name="base.tokenizer"
            value={manifest.base.tokenizer}
            href={`https://huggingface.co/${manifest.base.tokenizer}`}
          />
          <TypedRow
            type="bytes32"
            name="dataset.rootHash"
            value={manifest.dataset.rootHash}
            href={proof(links.dataset)}
            hrefLabel={links.storageHost}
            unverifiable={!onChain}
            hash
          />
          <TypedRow type="string" name="dataset.format" value={manifest.dataset.format} />
          <TypedRow
            type="uint256"
            name="dataset.exampleCount"
            value={formatCount(manifest.dataset.exampleCount)}
          />
          <TypedRow
            type="uint256"
            name="dataset.tokenCount"
            value={formatCount(manifest.dataset.tokenCount)}
          />
          <TypedRow
            type="bytes32"
            name="training.configHash"
            value={derivedConfigHash}
            note="Derived here from the five accepted keys, not read from the record."
            hash
          />
          <TypedRow
            type="bytes32"
            name={sentinel ? 'adapter.rootHash — SENTINEL' : 'adapter.rootHash'}
            value={manifest.adapter.rootHash}
            href={sentinel ? undefined : proof(links.adapter)}
            hrefLabel={links.storageHost}
            unverifiable={!sentinel && !onChain}
            tone={sentinel ? 'danger' : 'default'}
            note={
              sentinel
                ? 'keccak256 of a published string, not the Merkle root of a file. There is no artifact behind this value and the preimage below proves it.'
                : undefined
            }
            hash
          />
          <TypedRow
            type="uint256"
            name="fee.totalNeuron"
            value={`${manifest.fee.totalNeuron} (${formatOg(manifest.fee.totalNeuron)} 0G)`}
          />
          <TypedRow
            type="address"
            name="tee.signerAddress"
            value={manifest.tee.signerAddress}
            href={links.teeSigner}
            hrefLabel={links.chainHost}
            hash
          />
          <TypedRow
            type="bool"
            name="tee.acknowledged"
            value={manifest.tee.acknowledged ? 'true' : 'false'}
            tone={manifest.tee.acknowledged ? 'ok' : 'warn'}
          />
          <TypedRow
            type="bool"
            name="tee.attestationVerified"
            value={manifest.tee.attestationVerified ? 'true' : 'false'}
            tone={manifest.tee.attestationVerified ? 'ok' : 'warn'}
            note={
              manifest.tee.attestationVerified
                ? undefined
                : 'False, and shown as false. verifyService() is not called anywhere in this codebase, so the attestation has not been checked on this end — recording the TEE signer is not the same as verifying its quote.'
            }
          />
        </TypedRows>
      </Panel>

      {/* ================================================================ */}
      {/* Training configuration + cost                                     */}
      {/* ================================================================ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel as="section">
          <PanelHeader
            title="Training configuration"
            icon={<SlidersIcon className="h-3.5 w-3.5" />}
            aside={<span className="font-mono text-2xs text-faint">5 of 5 accepted keys</span>}
          />
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
                <Hash value={derivedConfigHash} title="config hash" tone="muted" full />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-faint text-pretty">
                keccak256 of those five keys, sorted and serialised with no whitespace.
                Recomputed here rather than read from the record.
              </p>
            </div>
          </div>
        </Panel>

        <Panel as="section">
          <PanelHeader
            title="Cost"
            aside={
              <span className="font-mono text-2xs text-faint">
                charged by 0G, not estimated
              </span>
            }
          />
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

        {!onChain ? (
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <Note>
              <strong className="font-normal text-fg">Demo record.</strong> The values below show
              what a passport anchors and in what shape. They were never minted, so none of them
              links to an explorer — a link that 404s is worse than no link.
            </Note>
          </div>
        ) : null}

        <TypedRows>
          <TypedRow
            type="bytes32"
            name="manifestRootHash (anchored)"
            value={anchored}
            note="Public, and checkable without decrypting anything."
            hash
          />
          <TypedRow
            type="bytes32"
            name="manifestRootHash (recomputed here)"
            value={recomputed}
            tone={integrity === 'mismatch' ? 'danger' : 'default'}
            note={
              record.anchoredManifest
                ? 'keccak256 of the canonical document this token committed to, computed client-side from the JSON at the bottom of this page.'
                : 'keccak256 of the canonical manifest, computed client-side from the JSON at the bottom of this page.'
            }
            hash
          />

          {contract ? (
            <TypedRow
              type="address"
              name="passportContract"
              value={contract}
              href={onChain && deployed ? addressUrl(manifest.network, contract) : undefined}
              hrefLabel={network.explorerLabel}
              note={
                !onChain
                  ? 'Demo address. The deployed contract lives elsewhere.'
                  : deployed
                    ? `Passport.sol on ${network.label}${
                        DEPLOYMENT_BLOCKS[manifest.network]
                          ? `, deployed in block ${formatCount(DEPLOYMENT_BLOCKS[manifest.network]!)}`
                          : ''
                      }. Source is verified on the explorer, so the code behind these hashes is readable too.`
                    : `Passport.sol is not deployed on ${network.label} yet — nothing has been deployed to mainnet — so this link does not resolve.`
              }
              hash
            />
          ) : null}

          {mint.tokenId ? (
            <TypedRow
              type="uint256"
              name="tokenId"
              value={mint.tokenId}
              href={
                contract && onChain && deployed
                  ? tokenUrl(manifest.network, contract, mint.tokenId)
                  : undefined
              }
            />
          ) : null}

          {mint.txHash ? (
            <TypedRow
              type="bytes32"
              name="mintTransaction"
              value={mint.txHash}
              href={proof(txUrl(manifest.network, mint.txHash))}
              hrefLabel={network.explorerLabel}
              note={
                mint.blockNumber
                  ? `Block ${formatCount(mint.blockNumber)}${
                      mint.mintedAt ? ` · ${formatTimestamp(mint.mintedAt)}` : ''
                    }`
                  : undefined
              }
              hash
            />
          ) : null}

          {mint.owner ? (
            <TypedRow
              type="address"
              name="owner"
              value={mint.owner}
              href={proof(addressUrl(manifest.network, mint.owner))}
              hrefLabel={network.explorerLabel}
              hash
            />
          ) : null}

          {mint.blockNumber ? (
            <TypedRow
              type="uint256"
              name="blockNumber"
              value={formatCount(mint.blockNumber)}
              href={proof(blockUrl(manifest.network, mint.blockNumber))}
            />
          ) : null}

          {/* The document itself, so the loop actually closes: download, hash,
              compare. A hash you were handed proves nothing on its own. */}
          {record.manifestStorage ? (
            <TypedRow
              type="bytes32"
              name="manifestStorage.rootHash"
              value={record.manifestStorage.rootHash}
              href={
                onChain
                  ? storageLookupUrl(manifest.network, record.manifestStorage.rootHash)
                  : undefined
              }
              hrefLabel={links.storageHost}
              note={`The canonical document above, stored on 0G Storage${
                record.manifestStorage.sizeBytes
                  ? ` — ${record.manifestStorage.sizeBytes} bytes`
                  : ''
              }. Storage Scan has no page keyed by a root hash, so this link is its JSON lookup; the human page is the submission below.`}
              hash
            />
          ) : null}

          {record.manifestStorage?.txSeq !== undefined ? (
            <TypedRow
              type="uint256"
              name="manifestStorage.txSeq"
              value={`#${record.manifestStorage.txSeq}`}
              href={
                onChain
                  ? storageSubmissionUrl(manifest.network, record.manifestStorage.txSeq)
                  : undefined
              }
              note="Storage Scan’s human-readable page for this upload."
            />
          ) : null}

          {record.deliveredAt ? (
            <TypedRow
              type="string"
              name="deliveredAt"
              value={formatTimestamp(record.deliveredAt)}
              note="0G reports Delivered here; the 48-hour acknowledgement window opened at this instant."
            />
          ) : null}
        </TypedRows>

        {mint.status !== 'minted' ? (
          <div className="border-t border-line px-4 py-4 sm:px-5">
            <Note tone="warn">
              This manifest is written to 0G Storage but has no on-chain anchor yet. Until the
              mint lands, the lineage is readable but not tamper-evident — anyone serving you
              this page could have altered it.
            </Note>
          </div>
        ) : null}
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
                Look this root hash up on{' '}
                <ProofLink href={proof(links.dataset)} label={links.storageHost} />. Storage Scan
                has no page keyed by a root hash, so the link is its API route; the JSON names the
                submission carrying the file. What comes back is the exact data this model was
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
                Call <span className="font-mono text-fg">passportOf({mint.tokenId ?? '<tokenId>'})</span>{' '}
                on the Passport contract via{' '}
                <ProofLink
                  href={onChain && contract && deployed ? addressUrl(manifest.network, contract) : undefined}
                  label={network.explorerLabel}
                />{' '}
                or any {network.label} RPC. It returns the lineage hashes exactly as they were
                written at mint time; the contract makes them immutable afterwards.
              </>
            }
            code={`passportOf(${mint.tokenId ?? '<tokenId>'})`}
          />
          <VerifyStep
            n={3}
            title="Hash the document and compare"
            body={
              <>
                keccak256 over the canonical document — keys sorted recursively, no whitespace —
                must equal the anchored{' '}
                <span className="font-mono text-fg">manifestRootHash</span>. This page just did it
                in front of you{integrity === 'verified' ? ' and it matched' : ''}; the contract
                will confirm it via <span className="font-mono text-fg">verifyManifest</span>,
                which returns <span className="font-mono text-ok">true</span> for this hash and{' '}
                <span className="font-mono text-danger">false</span> for any other.
              </>
            }
            code={`verifyManifest(${mint.tokenId ?? '<tokenId>'}, ${anchored})`}
          />
          <VerifyStep
            n={4}
            title={sentinel ? 'Recompute the adapter sentinel' : 'Check the enclave signer'}
            body={
              sentinel ? (
                <>
                  The adapter field on this passport is{' '}
                  <span className="font-mono text-fg">
                    keccak256(&quot;{adapter.sentinelPreimage}&quot;)
                  </span>
                  . Hash that string yourself and you get the value anchored on chain — which is
                  how you know no adapter was ever produced, rather than having to take our word
                  for it.
                </>
              ) : (
                <>
                  The TEE signer address is acknowledged on-chain by the provider. Combined with
                  0G’s integrity check on delivery, that ties this adapter to an Intel TDX enclave
                  rather than to somebody’s assertion.
                </>
              )
            }
            code={
              sentinel
                ? `keccak256("${adapter.sentinelPreimage}")`
                : manifest.tee.signerAddress
            }
          />
        </ol>
      </Panel>

      {/* ================================================================ */}
      {/* Raw documents                                                     */}
      {/* ================================================================ */}
      {record.anchoredManifest ? (
        <RawDocument
          title="Anchored document"
          subtitle="the exact bytes this token’s hash commits to"
          document={record.anchoredManifest}
        />
      ) : null}

      <RawDocument
        title={record.anchoredManifest ? 'Full manifest (v1)' : 'Raw manifest'}
        subtitle={
          record.anchoredManifest
            ? 'the shape Crucible writes to 0G Storage today'
            : 'the document the anchored hash commits to'
        }
        document={manifest}
      />

      <p className="mt-6 text-xs leading-relaxed text-faint text-pretty">
        A passport proves lineage, not honest training. It shows which weights, which data, which
        configuration and which enclave — it does not prove the provider ran the epochs it
        reported. That requires zero-knowledge proofs over the training computation.
      </p>
    </article>
  )
}

// ---------------------------------------------------------------------------
// The verification hero
// ---------------------------------------------------------------------------

/**
 * How long the panel dwells on `checking` before showing the verdict.
 *
 * The hash itself is computed synchronously during render — keccak256 over a few
 * hundred bytes takes microseconds, which is far too fast for a human to see
 * happen. The dwell is presentation, not fake work: it holds the reveal long
 * enough that a reader watches `checking → match` rather than arriving after the
 * fact. Nothing about the result depends on it, and reduced-motion skips it.
 */
const REVEAL_MS = 450

type VerifyPhase = 'checking' | 'match' | 'mismatch' | 'demo'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The single most important claim on this page, given the room it deserves.
 *
 * A hash anchored on a public chain is only evidence if you can reproduce it. So
 * the panel stacks the two values — the one the chain holds, and the one this
 * browser just computed from the published document — character-aligned in one
 * well, and lets the reader's eye do the comparison rather than asking them to
 * accept a green tick.
 *
 * Three states, and the page genuinely passes through them: `checking` while the
 * verdict is withheld, then `match` or `mismatch`. Everything the reader would
 * need to redo the check outside this page is in the disclosure at the bottom,
 * copyable, exact.
 */
function VerificationHero({
  integrity,
  anchored,
  recomputed,
  canonicalBytes,
  anchoredIsFullManifest,
  tokenId,
  explorerLabel,
  indexerUrl,
  manifestRootHash,
}: {
  integrity: Integrity
  anchored: string
  recomputed: string
  canonicalBytes: number
  /** Whether the hashed document is this app's v1 manifest or an older record. */
  anchoredIsFullManifest: boolean
  tokenId?: string
  explorerLabel: string
  indexerUrl: string
  /** 0G Storage root of the manifest document, when one exists to curl. */
  manifestRootHash?: string
}) {
  const settled: Exclude<VerifyPhase, 'checking'> =
    integrity === 'demo' ? 'demo' : integrity === 'verified' ? 'match' : 'mismatch'

  const [phase, setPhase] = useState<VerifyPhase>('checking')

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase(settled)
      return
    }

    setPhase('checking')
    const timer = setTimeout(() => setPhase(settled), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [settled])

  const checking = phase === 'checking'
  const diffAt = useMemo(() => firstDifference(anchored, recomputed), [anchored, recomputed])

  const skin = {
    checking: 'border-line-bright bg-panel',
    match: 'border-ok/30 bg-ok/[0.045]',
    mismatch: 'border-danger/40 bg-danger/[0.06]',
    demo: 'border-line bg-panel',
  }[phase]

  const call = `verifyManifest(${tokenId ?? '<tokenId>'}, ${recomputed})`

  return (
    <section
      className={`relative mt-4 overflow-hidden rounded-lg border shadow-panel ${skin}`}
      aria-labelledby="verification"
      data-state={phase}
    >
      {/* The recomputation crossing the panel. Plays once, on the transition to
          a match — this element does not exist in any other state. */}
      {phase === 'match' ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 animate-verifysweep bg-gradient-to-r from-transparent via-ok/[0.13] to-transparent"
        />
      ) : null}

      {/* ---- header ---- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-inherit px-5 py-3 sm:px-6">
        <PhaseIcon phase={phase} />
        <h2
          id="verification"
          className={`font-mono text-xs uppercase tracking-widest2 ${
            phase === 'match'
              ? 'text-ok'
              : phase === 'mismatch'
                ? 'text-danger'
                : phase === 'demo'
                  ? 'text-faint'
                  : 'text-dim'
          }`}
        >
          {checking
            ? 'Recomputing the anchored hash…'
            : phase === 'match'
              ? 'Hash verified in this browser'
              : phase === 'mismatch'
                ? 'Hash mismatch'
                : 'Nothing anchored to check against'}
        </h2>
        <span className="font-mono text-2xs text-faint">
          keccak256 · canonical JSON · {canonicalBytes} bytes · nothing left this tab
        </span>
      </div>

      {/* ---- the two hashes, stacked and character-aligned ---- */}
      <div className="px-5 py-5 sm:px-6">
        <div className="well px-4 py-4">
          <HashLine
            label={
              phase === 'demo'
                ? 'Recorded on this demo record'
                : `Anchored on ${explorerLabel} · passportOf(${tokenId ?? '…'}).manifestRootHash`
            }
            value={anchored}
            tone="text-dim"
          />

          <div className="my-3 flex items-center gap-3" aria-hidden="true">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-xs ${
                checking
                  ? 'border-line-bright text-faint'
                  : phase === 'match'
                    ? 'border-ok/40 text-ok'
                    : phase === 'mismatch'
                      ? 'border-danger/50 text-danger'
                      : 'border-line-bright text-faint'
              }`}
            >
              {checking ? '?' : phase === 'mismatch' ? '≠' : '='}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {checking ? (
            <div>
              <div className="label">Recomputed in this browser · keccak256(canonicalize(doc))</div>
              <div className="relative mt-1.5 h-5 overflow-hidden rounded-sm bg-raised">
                <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-phosphor/20 to-transparent" />
              </div>
            </div>
          ) : (
            <div className="animate-fadeup">
              <HashLine
                label="Recomputed in this browser · keccak256(canonicalize(doc))"
                value={recomputed}
                tone={
                  phase === 'match'
                    ? 'text-ok'
                    : phase === 'mismatch'
                      ? 'text-danger'
                      : 'text-dim'
                }
              />
            </div>
          )}
        </div>

        {/* ---- the verdict ---- */}
        <p
          className={`measure mt-4 text-sm leading-relaxed text-pretty ${
            phase === 'match'
              ? 'text-ok/90'
              : phase === 'mismatch'
                ? 'text-danger'
                : 'text-dim'
          }`}
          role="status"
          aria-live="polite"
        >
          {checking
            ? `Reading the canonical document and taking its keccak256 in this tab. The manifest is not uploaded anywhere to do this — the comparison is local, and so is the document.`
            : phase === 'match'
              ? `Hashed in your browser just now — the result matches the value anchored on ${explorerLabel}. Nothing in between was trusted: not this server, not this page, not us.`
              : phase === 'mismatch'
                ? `This document does not hash to the anchored value${
                    diffAt >= 0 ? `; the two first differ at character ${diffAt} of ${anchored.length}` : ''
                  }. Either it was altered after minting, or the anchor belongs to a different document. Do not trust this passport.`
                : 'Demo record. The hash below is recomputed in your browser from the document shown, but there is no on-chain anchor to compare it against.'}
        </p>

        {anchoredIsFullManifest ? null : (
          <p className="measure mt-2 text-xs leading-relaxed text-faint text-pretty">
            The document hashed here is the smaller record this token was minted against, carried
            verbatim — not the v1 manifest further down the page. Hashing anything else would not
            reproduce the anchored value, and pretending otherwise would defeat the point.
          </p>
        )}

        {/* ---- the value the contract returns ---- */}
        {phase === 'match' || phase === 'mismatch' ? (
          <div className="mt-5">
            <div className="label">Returned by the contract</div>
            <div className="well mt-1.5 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="mt-px shrink-0 font-mono text-xs text-faint">›</span>
                <code className="min-w-0 flex-1 break-hash font-mono text-2xs leading-5 text-dim">
                  {call}
                </code>
                <CopyButton value={call} label="verifyManifest call" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="shrink-0 font-mono text-xs text-faint">↳</span>
                <code
                  data-testid="verify-manifest-return"
                  className={`font-mono text-lg leading-none ${
                    phase === 'match' ? 'text-ok' : 'text-danger'
                  }`}
                >
                  {phase === 'match' ? 'true' : 'false'}
                </code>
                <span className="font-mono text-2xs text-faint">bool</span>
              </div>
            </div>
            <p className="measure mt-2 text-xs leading-relaxed text-faint text-pretty">
              <span className="font-mono text-dim">verifyManifest</span> is a{' '}
              <span className="font-mono text-dim">view</span> function on{' '}
              <span className="font-mono text-dim">Passport.sol</span>: it compares its argument
              against the stored{' '}
              <span className="font-mono text-dim">manifestRootHash</span> and returns that
              comparison. This is the value it returns for the hash above — a value read back, not
              a claim made here. The command below makes the call against {explorerLabel} yourself.
            </p>
          </div>
        ) : null}

        {/* ---- verify it yourself ---- */}
        <details className="group mt-5 rounded-md border border-line bg-sub/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
            <span className="inline-flex items-center gap-2">
              <TerminalIcon className="h-3.5 w-3.5 text-faint" />
              <span className="label text-dim">Verify it yourself — no wallet, no clone</span>
            </span>
            <span className="shrink-0 font-mono text-2xs text-faint group-open:hidden">show</span>
            <span className="hidden shrink-0 font-mono text-2xs text-faint group-open:inline">
              hide
            </span>
          </summary>

          <div className="space-y-3 border-t border-line px-4 py-4">
            {manifestRootHash ? (
              <Command
                caption="1 · fetch the exact document that was hashed, from 0G Storage"
                value={`curl -s "${indexerUrl}/file?root=${manifestRootHash}"`}
              />
            ) : (
              <p className="text-xs leading-relaxed text-faint text-pretty">
                This record has no document on 0G Storage to fetch, so there is no{' '}
                <span className="font-mono text-dim">curl</span> that would return anything. The
                recomputation above still runs against the document printed at the bottom of this
                page.
              </p>
            )}

            <Command
              caption="2 · canonicalise it, hash it, and ask the deployed contract"
              value="node tools/verify-manifest.mjs"
            />

            <div>
              <div className="label">What it prints</div>
              <div className="scroll-x mt-1.5 rounded-sm border border-line bg-ink">
                <pre className="px-3 py-2.5 font-mono text-2xs leading-5 text-faint">
                  {[
                    `manifest keccak256                ${recomputed}`,
                    `passportOf(${tokenId ?? '…'}).manifestRootHash    ${anchored}`,
                    `verifyManifest(${tokenId ?? '…'}, that hash)      ${
                      phase === 'mismatch' ? 'false' : 'true'
                    }`,
                    `verifyManifest(${tokenId ?? '…'}, keccak256("tampered"))   false`,
                  ].join('\n')}
                </pre>
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

/**
 * One of the two stacked hashes.
 *
 * Both render into the same block, at the same start column, in the same
 * monospace at the same size, wrapping at the same character. That is what lets
 * the reader confirm the match themselves instead of being told about it.
 */
function HashLine({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1.5 flex items-start gap-2">
        <code
          className={`min-w-0 flex-1 break-hash font-mono text-[13px] leading-5 ${tone}`}
          title={value}
          data-testid="aligned-hash"
        >
          {value}
        </code>
        <CopyButton value={value} label="hash" />
      </div>
    </div>
  )
}

function PhaseIcon({ phase }: { phase: VerifyPhase }) {
  if (phase === 'match') return <CheckIcon className="h-4 w-4 shrink-0 text-ok" />
  if (phase === 'mismatch') return <AlertIcon className="h-4 w-4 shrink-0 text-danger" />
  if (phase === 'demo') return <ShieldIcon className="h-4 w-4 shrink-0 text-faint" />
  return <Dot tone="accent" pulse />
}

/** A copyable command line. The whole point is that it is exact. */
function Command({ caption, value }: { caption: string; value: string }) {
  return (
    <div>
      <div className="label">{caption}</div>
      <div className="mt-1.5 flex items-start gap-2 rounded-sm border border-line bg-ink px-3 py-2">
        <span className="mt-px shrink-0 font-mono text-2xs text-faint">$</span>
        <code className="min-w-0 flex-1 break-hash font-mono text-2xs leading-5 text-phosphor">
          {value}
        </code>
        <CopyButton value={value} label={caption} />
      </div>
    </div>
  )
}

/** Index of the first differing character, or -1 when the two are identical. */
function firstDifference(a: string, b: string): number {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  const limit = Math.min(left.length, right.length)

  for (let i = 0; i < limit; i += 1) {
    if (left[i] !== right[i]) return i
  }

  return left.length === right.length ? -1 : limit
}

/**
 * The penalty as a percentage of the fee, computed from the two neuron amounts
 * rather than restating "30%" as a constant. If the numbers ever stop agreeing
 * with 0G's documented deduction, the page says so instead of the doc winning.
 */
function penaltyPercent(penaltyNeuron: string, totalNeuron: string): string {
  try {
    const penalty = BigInt(penaltyNeuron)
    const total = BigInt(totalNeuron)
    if (total === 0n) return '—'

    // Four decimal places, computed in integer arithmetic so nothing rounds
    // through a float on the way.
    const basis = (penalty * 1_000_000n) / total
    const whole = basis / 10_000n
    const fraction = (basis % 10_000n).toString().padStart(4, '0')
    return `${whole}.${fraction}%`
  } catch {
    return '—'
  }
}

// ---------------------------------------------------------------------------
// Certificate furniture
// ---------------------------------------------------------------------------

/** One cell of the record quad: small label over value, EAS-style. */
function QuadCell({
  label,
  value,
  hint,
  href,
}: {
  label: string
  value: string
  hint?: string
  href?: string
}) {
  return (
    <div className="min-w-0 sm:text-right">
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-mono text-[13px] leading-5 text-fg">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 no-underline hover:text-phosphor"
          >
            {value}
            <ExternalIcon className="h-3 w-3" />
          </a>
        ) : (
          value
        )}
        {hint ? <span className="block font-mono text-2xs text-faint">{hint}</span> : null}
      </dd>
    </div>
  )
}

function ProvenanceRibbon({
  onChain,
  network,
  tokenId,
}: {
  onChain: boolean
  network: 'testnet' | 'mainnet'
  tokenId?: string
}) {
  if (onChain) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-phosphor/20 bg-phosphor/[0.06] px-5 py-2 sm:px-8">
        <Dot tone="accent" />
        <span className="font-mono text-2xs uppercase tracking-widest2 text-phosphor">
          Live on {NETWORKS[network].label}
          {tokenId ? ` · token #${tokenId}` : ''}
        </span>
        <span className="font-mono text-2xs text-faint">
          every hash below was produced by a real run and every link resolves
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-sub px-5 py-2 sm:px-8">
      <Dot tone="neutral" />
      <span className="font-mono text-2xs uppercase tracking-widest2 text-dim">Demo record</span>
      <span className="font-mono text-2xs text-faint">
        shows the shape of a passport · hashes here have no on-chain counterpart
      </span>
    </div>
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
  unverifiable = false,
  tone = 'default',
  note,
  meta,
  footer,
  last = false,
}: {
  icon: ReactNode
  kind: string
  title: string
  hash: string
  hashLabel: string
  href?: string
  hrefLabel?: string
  /** A real hash with no reachable proof — say so rather than linking nowhere. */
  unverifiable?: boolean
  tone?: 'default' | 'danger'
  note: string
  meta?: ChainMeta[]
  footer?: ReactNode
  last?: boolean
}) {
  const danger = tone === 'danger'

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
        <IconTile tone={danger ? 'danger' : 'accent'}>{icon}</IconTile>
      </span>

      <div className={`min-w-0 ${last ? '' : 'pb-4'}`}>
        <div
          className={`rounded-lg border px-4 py-4 ${
            danger ? 'border-danger/30 bg-danger/[0.04]' : 'border-line bg-sub'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className={`font-mono text-[13px] ${danger ? 'text-danger' : 'text-fg'}`}>
              {title}
            </h3>
            <span className="label">{kind}</span>
          </div>

          <div className="mt-2.5">
            {/* Full, not truncated. This page is the certificate, not the index. */}
            <Hash value={hash} href={href} hrefLabel={hrefLabel} title={hashLabel} full />
          </div>

          {unverifiable ? (
            <p className="mt-1 font-mono text-2xs text-faint">
              demo value — no 0G Storage object to open
            </p>
          ) : null}

          <p
            className={`mt-2 text-xs leading-relaxed text-pretty ${
              danger ? 'text-danger/90' : 'text-faint'
            }`}
          >
            {note}
          </p>

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

          {footer ? <div className="mt-3 border-t border-line pt-3">{footer}</div> : null}
        </div>
      </div>
    </li>
  )
}

/**
 * The adapter sentinel, recomputed in front of the reader.
 *
 * This is the honest counterpart to the verification hero: rather than asking the
 * reader to believe that the adapter hash means "no adapter", the page hashes
 * the published preimage locally and shows that it reproduces the anchored
 * value. A failure you can verify is a stronger claim than a success you cannot.
 */
function SentinelProof({
  preimage,
  reproduces,
  reason,
}: {
  preimage?: string
  reproduces: boolean
  reason?: string
}) {
  return (
    <div>
      {preimage ? (
        <>
          <div className="label">Sentinel preimage</div>
          <div className="well mt-1.5 flex items-center gap-2 px-3 py-2">
            <code className="min-w-0 flex-1 break-hash font-mono text-2xs text-dim">
              keccak256(&quot;{preimage}&quot;)
            </code>
            <CopyButton value={preimage} label="sentinel preimage" />
          </div>
          <p
            className={`mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed ${
              reproduces ? 'text-ok/90' : 'text-warn'
            }`}
          >
            {reproduces ? (
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {reproduces
                ? 'Hashed in your browser just now — it reproduces the value anchored on chain, so the field provably holds a sentinel and not an artifact.'
                : 'The published preimage does not reproduce the anchored value.'}
            </span>
          </p>
        </>
      ) : null}

      {reason ? (
        <p className="measure mt-3 text-xs leading-relaxed text-dim text-pretty">{reason}</p>
      ) : null}
    </div>
  )
}

function VerdictLine({
  ok,
  okText,
  badText,
}: {
  ok: boolean
  okText: string
  badText: string
}) {
  return (
    <p
      className={`inline-flex items-start gap-1.5 text-xs leading-relaxed ${
        ok ? 'text-ok/90' : 'text-danger'
      }`}
    >
      {ok ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>{ok ? okText : badText}</span>
    </p>
  )
}

type CheckState = 'ok' | 'warn' | 'bad' | 'na'

function Check({
  state,
  label,
  detail,
}: {
  state: CheckState
  label: string
  detail: string
}) {
  const colour = {
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-danger',
    na: 'text-faint',
  }[state]

  return (
    <div className="bg-panel px-4 py-4">
      <div className="flex items-center gap-2">
        {state === 'ok' ? (
          <CheckIcon className={`h-3.5 w-3.5 ${colour}`} />
        ) : state === 'na' ? (
          <Dot tone="neutral" />
        ) : (
          <AlertIcon className={`h-3.5 w-3.5 ${colour}`} />
        )}
        <span className="label text-dim">{label}</span>
      </div>
      <p
        className={`mt-2 text-xs leading-relaxed text-pretty ${
          state === 'ok' ? 'text-dim' : colour
        }`}
      >
        {detail}
      </p>
    </div>
  )
}

/** An external link, or plain text where there is nothing real to open. */
function ProofLink({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="font-mono text-dim">{label}</span>

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-phosphor no-underline hover:underline"
    >
      {label}
    </a>
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

function RawDocument({
  title,
  subtitle,
  document,
}: {
  title: string
  subtitle: string
  document: Record<string, unknown> | object
}) {
  const canonical = canonicalize(document)

  return (
    <details className="group mt-4 rounded-lg border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="min-w-0">
          <span className="label text-dim">{title}</span>
          <span className="ml-2 font-mono text-2xs text-faint">{subtitle}</span>
        </span>
        <span className="shrink-0 font-mono text-2xs text-faint group-open:hidden">show</span>
        <span className="hidden shrink-0 font-mono text-2xs text-faint group-open:inline">
          hide
        </span>
      </summary>

      <div className="border-t border-line">
        <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5">
          <span className="font-mono text-2xs text-faint">{canonical.length} bytes canonical</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-2xs text-faint">copy canonical</span>
            <CopyButton value={canonical} label={`canonical ${title.toLowerCase()}`} />
          </div>
        </div>
        <div className="scroll-x border-t border-line bg-sub">
          <pre className="px-4 py-4 font-mono text-xs leading-5 text-dim sm:px-5">
            {prettyManifest(document as Record<string, unknown>)}
          </pre>
        </div>
      </div>
    </details>
  )
}
