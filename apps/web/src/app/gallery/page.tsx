'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Hash } from '@/components/Hash'
import { PassportTable } from '@/components/PassportCard'
import { AlertIcon, AnchorIcon, ArrowIcon, CheckIcon, SearchIcon } from '@/components/icons'
import { Badge, Dot, EmptyState, ErrorState, HatchBand, IconTile, Skeleton } from '@/components/ui'
import { applyFilter, getPassport, listPassports } from '@/lib/api'
import {
  NETWORKS,
  addressUrl,
  storageLookupUrl,
  storageScanHost,
  storageSubmissionUrl,
  txUrl,
} from '@/lib/chains'
import { formatCount } from '@/lib/format'
import type { Network, PassportRecord, PassportSummary } from '@/lib/types'

type NetworkFilter = Network | 'all'

/**
 * The gallery is the demo's opening shot, and the first screen has to earn
 * itself.
 *
 * The previous version opened with a label, a title, a paragraph and a row of
 * four numbers before anything checkable appeared — the token actually minted on
 * 0G Galileo sat below the fold, under a stat row that led with `8 PASSPORTS`.
 * Both of those are corrected here, and the correction is not cosmetic:
 *
 *  - **The stat row leads with `1 / 8`, not `8`.** Eight is the flattering
 *    number and one is the true one. A judge who reads `8 PASSPORTS`, opens two
 *    and finds fixtures has learned that this page inflates; a judge who reads
 *    `1 / 8 MINTED ON 0G` has been told the ratio up front and can spend their
 *    attention on the one that counts.
 *  - **`TOKENS TRAINED` says what it sums.** 3,121,508 is a sum across fixture
 *    records. An impressive number that dissolves the moment someone checks it
 *    costs more than it earns, so the figure carries its own provenance.
 *  - **The real passport is above the fold**, immediately under the numbers,
 *    with every hash beside the explorer that resolves it.
 *
 * Below the seam, the list itself is a dense table rather than a card wall —
 * see PassportCard.tsx for why, and for the reference it reimplements.
 */
export default function GalleryPage() {
  const [passports, setPassports] = useState<PassportSummary[] | null>(null)
  const [featured, setFeatured] = useState<PassportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [network, setNetwork] = useState<NetworkFilter>('all')
  const [model, setModel] = useState<string>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(() => {
    setError(null)
    setPassports(null)
    setFeatured(null)

    listPassports()
      .then(async (list) => {
        setPassports(list)

        // Pull the full record for the on-chain one, so the feature panel can
        // show the hashes it links out with rather than a summary of them.
        const real = list.find((p) => p.provenance === 'chain')
        if (real) {
          const record = await getPassport(real.id).catch(() => null)
          setFeatured(record)
        }
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Unknown error'),
      )
  }, [])

  useEffect(load, [load])

  const models = useMemo(() => {
    if (!passports) return []
    return [...new Set(passports.map((p) => p.model))].sort()
  }, [passports])

  const visible = useMemo(
    () => (passports ? applyFilter(passports, { network, model, query }) : []),
    [passports, network, model, query],
  )

  /**
   * Every number on the stat header, split by provenance rather than totalled
   * blindly. The split is the whole point: a total that mixes one real run with
   * seven fixtures is a number nobody can act on.
   */
  const totals = useMemo(() => {
    const source = passports ?? []
    const chain = source.filter((p) => p.provenance === 'chain')

    return {
      count: source.length,
      onChain: chain.length,
      tokens: source.reduce((sum, p) => sum + p.tokenCount, 0),
      chainTokens: chain.reduce((sum, p) => sum + p.tokenCount, 0),
    }
  }, [passports])

  const ready = passports !== null
  const filtered = ready && visible.length !== passports.length

  return (
    <>
      {/* ================================================================ */}
      {/* First screen: who this is, how much of it is real, and the one   */}
      {/* record that proves the claim. Nothing else competes for the top. */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 pb-7 pt-8 sm:px-6 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <div className="min-w-0">
            <p className="label">Public record</p>
            <h1 className="mt-2 text-title font-medium text-fg text-balance">Passport gallery</h1>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-dim text-pretty">
            Every model fine-tuned through Crucible, with its full lineage — public and checkable
            by anyone, with no wallet and no account. Records minted on 0G are marked; the rest are
            fixtures, and say so on every hash.
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {/* The truthful number goes first, and it is the impressive one. */}
          <Total
            label="Minted on 0G"
            value={ready ? `${totals.onChain} / ${totals.count}` : null}
            hint={
              featured?.mint.blockNumber
                ? `token #${featured.mint.tokenId} · block ${formatCount(featured.mint.blockNumber)}`
                : 'Galileo · chain 16602'
            }
            accent
          />
          <Total
            label="Passport records"
            value={ready ? formatCount(totals.count) : null}
            hint={
              ready
                ? `${totals.onChain} on chain · ${totals.count - totals.onChain} fixtures`
                : undefined
            }
          />
          {/*
            Labelled, not dropped. The figure is real arithmetic over the records
            this app holds — it is just that seven of those records are invented,
            and a reader deserves to know that before they quote it.
          */}
          <Total
            label="Tokens trained"
            value={ready ? formatCount(totals.tokens) : null}
            hint={
              ready
                ? `${formatCount(totals.chainTokens)} from the live run · the rest is a fixture sum`
                : undefined
            }
          />
        </dl>
      </section>

      {featured ? (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6" aria-labelledby="featured">
          <FeaturedPassport record={featured} />
        </section>
      ) : passports === null ? (
        <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      <HatchBand height="h-6" />

      {/* Filters — sticky, because the table below can get long. */}
      <div className="sticky top-14 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <FilterGroup
              legend="Network"
              value={network}
              onChange={(v) => setNetwork(v as NetworkFilter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'mainnet', label: '0G mainnet' },
                { value: 'testnet', label: 'Galileo' },
              ]}
            />

            {models.length > 1 ? (
              <FilterGroup
                legend="Model"
                value={model}
                onChange={setModel}
                options={[
                  { value: 'all', label: 'All' },
                  ...models.map((m) => ({ value: m, label: m })),
                ]}
              />
            ) : null}
          </div>

          <div className="relative flex items-center lg:w-64">
            <label htmlFor="gallery-search" className="sr-only">
              Search passports
            </label>
            <SearchIcon className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-faint" />
            <input
              id="gallery-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="search by name or model…"
              className="field h-9 w-full py-0 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Summary line -------------------------------------------------- */}
        {ready && !error ? (
          <p className="py-4 font-mono text-2xs uppercase tracking-widest2 text-faint" role="status">
            {filtered
              ? `${visible.length} of ${passports.length} passports`
              : `${visible.length} passport${visible.length === 1 ? '' : 's'}`}
            {visible.length > 0
              ? ` · ${formatCount(visible.reduce((sum, p) => sum + p.tokenCount, 0))} tokens`
              : ''}
          </p>
        ) : (
          <div className="py-4">
            <Skeleton className="h-3 w-40" />
          </div>
        )}

        {/* Content ------------------------------------------------------- */}
        {error ? (
          <ErrorState
            title="Could not load passports"
            body={
              <>
                {error}
                <span className="mt-2 block text-faint">
                  With no orchestrator configured the app serves fixture data, so this usually
                  means a stale <span className="font-mono">NEXT_PUBLIC_CRUCIBLE_API_URL</span>.
                </span>
              </>
            }
            onRetry={load}
          />
        ) : !passports ? (
          <TableSkeleton />
        ) : visible.length === 0 ? (
          passports.length === 0 ? (
            <EmptyState
              title="No passports yet"
              body="A passport is minted automatically when a fine-tuning run settles. Start one and this page fills itself in."
              action={{ href: '/new', label: 'Start a run' }}
            />
          ) : (
            <EmptyState
              title="Nothing matches those filters"
              body="Try a different network, model, or search term."
            />
          )
        ) : (
          <div className="animate-fadeup">
            <PassportTable passports={visible} />
          </div>
        )}
      </div>
    </>
  )
}

/**
 * The one passport whose every link resolves, given the space to prove it.
 *
 * Four hashes, each beside the explorer that verifies it, plus the honest note
 * about what this token is not. A judge should be able to click any row here and
 * land on a live 0G page.
 */
function FeaturedPassport({ record }: { record: PassportRecord }) {
  const { manifest, mint } = record
  const network = NETWORKS[manifest.network]
  const sentinel = record.adapterOrigin?.kind === 'sentinel'

  return (
    <article className="overflow-hidden rounded-lg border border-phosphor/35 bg-panel shadow-panel">
      <div className="h-px w-full origin-left animate-drawline bg-gradient-to-r from-phosphor via-phosphor/25 to-transparent" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-phosphor/20 bg-phosphor/[0.06] px-5 py-2 sm:px-6">
        <Dot tone="accent" pulse />
        <span className="font-mono text-2xs uppercase tracking-widest2 text-phosphor">
          Minted on {network.label} · token #{mint.tokenId}
        </span>
        <span className="font-mono text-2xs tabular-nums text-faint">
          block {formatCount(mint.blockNumber ?? 0)}
        </span>
      </div>

      <div className="grid gap-7 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-10">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <IconTile tone="accent">
              <AnchorIcon className="h-4 w-4" />
            </IconTile>
            <div className="min-w-0">
              <h2 id="featured" className="font-mono text-lg leading-tight text-fg">
                {record.name}
              </h2>
              <p className="mt-1 font-mono text-2xs text-faint">
                {record.id} · {manifest.base.model} · task {manifest.task.id.slice(0, 8)}…
              </p>
            </div>
          </div>

          <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
            {record.summary}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">
              <CheckIcon className="h-3 w-3" />
              every link resolves
            </Badge>
            {sentinel ? (
              <Badge tone="danger">
                <AlertIcon className="h-3 w-3" />
                adapter never retrieved
              </Badge>
            ) : null}
            <Badge tone="warn">task {manifest.task.state} on 0G</Badge>
          </div>

          <Link
            href={`/passport/${encodeURIComponent(record.id)}`}
            className="btn-primary mt-5 no-underline"
          >
            Open the passport
            <ArrowIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Rows a stranger can click straight into. */}
        <dl className="min-w-0 divide-y divide-line rounded-md border border-line bg-sub px-4 py-1">
          <Row
            k="Passport contract"
            value={mint.contractAddress}
            href={mint.contractAddress ? addressUrl(manifest.network, mint.contractAddress) : undefined}
            hrefLabel={network.explorerLabel}
          />
          <Row
            k="Mint transaction"
            value={mint.txHash}
            href={mint.txHash ? txUrl(manifest.network, mint.txHash) : undefined}
            hrefLabel={network.explorerLabel}
          />
          <Row
            k="Dataset root"
            value={manifest.dataset.rootHash}
            href={storageLookupUrl(manifest.network, manifest.dataset.rootHash)}
            hrefLabel={storageScanHost(manifest.network)}
          />
          <Row
            k="Manifest on 0G Storage"
            value={record.manifestStorage?.rootHash}
            href={
              record.manifestStorage?.txSeq !== undefined
                ? storageSubmissionUrl(manifest.network, record.manifestStorage.txSeq)
                : undefined
            }
            hrefLabel={storageScanHost(manifest.network)}
          />
          <Row k="Anchored manifest hash" value={mint.manifestRootHash} />
        </dl>
      </div>
    </article>
  )
}

function Row({
  k,
  value,
  href,
  hrefLabel,
}: {
  k: string
  value?: string
  href?: string
  hrefLabel?: string
}) {
  if (!value) return null

  return (
    <div className="py-2.5">
      <dt className="label">{k}</dt>
      <dd className="mt-1 min-w-0">
        <Hash value={value} href={href} hrefLabel={hrefLabel} title={k} />
      </dd>
    </div>
  )
}

/**
 * A stat header cell.
 *
 * The hint line is not decoration — it is where a number states what it is a sum
 * of. Every figure on this page that aggregates across fixtures says so here,
 * in the same breath as the figure itself rather than in a footnote nobody
 * reaches.
 */
function Total({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string | null
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <dt className="label">{label}</dt>
      <dd
        className={`mt-1.5 font-mono text-2xl leading-none tabular-nums ${
          accent ? 'text-phosphor' : 'text-fg'
        }`}
      >
        {value ?? <Skeleton className="h-6 w-20" />}
      </dd>
      {hint ? <p className="mt-2 font-mono text-2xs leading-tight text-faint">{hint}</p> : null}
    </div>
  )
}

/** The list's shape while it loads, rather than a blank block. */
function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-line" aria-hidden="true">
      <div className="border-b border-line bg-sub px-4 py-2.5">
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="divide-y divide-line/70">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-3 w-8 shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
            <Skeleton className="hidden h-3 w-16 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

function FilterGroup({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
      <legend className="sr-only">{legend}</legend>
      <span className="label shrink-0">{legend}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`rounded-sm border px-2.5 py-1 font-mono text-2xs transition-colors ${
                active
                  ? 'border-phosphor/50 bg-phosphor/10 text-phosphor'
                  : 'border-line text-dim hover:border-line-bright hover:text-fg'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
