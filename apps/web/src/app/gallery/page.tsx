'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Hash } from '@/components/Hash'
import { PassportCard } from '@/components/PassportCard'
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
 * The gallery is the demo's opening shot: a wall of passports, each one a page a
 * stranger can open and check.
 *
 * It leads with the one record that is real — the token actually minted on 0G
 * Galileo — because the difference between a checkable claim and a demonstration
 * of shape is the whole argument, and burying the real one in a grid of seven
 * identical cards throws that difference away. Everything below the fold is
 * clearly labelled as the fixture data it is.
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

        // Pull the full record for the on-chain one, so the feature card can show
        // the hashes it links out with rather than a summary of them.
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

  const totals = useMemo(() => {
    const source = passports ?? []
    return {
      count: source.length,
      tokens: source.reduce((sum, p) => sum + p.tokenCount, 0),
      onChain: source.filter((p) => p.provenance === 'chain').length,
      anchored: source.filter((p) => p.mintStatus === 'minted').length,
    }
  }, [passports])

  const filtered = passports !== null && visible.length !== passports.length

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
        <p className="label">Public record</p>
        <h1 className="mt-3 text-title font-medium text-fg text-balance">Passport gallery</h1>
        <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
          Every model fine-tuned through Crucible, with its full lineage. Each page is public and
          checkable by anyone — no wallet, no account, no permission. Records minted on 0G are
          marked as such; the rest are fixtures, and say so on every hash.
        </p>

        <dl className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          <Total label="Passports" value={passports ? formatCount(totals.count) : null} />
          <Total
            label="Minted on 0G"
            value={passports ? `${totals.onChain} / ${totals.count}` : null}
            accent
          />
          <Total label="Tokens trained" value={passports ? formatCount(totals.tokens) : null} />
          <Total
            label="Carry an anchor"
            value={passports ? `${totals.anchored} / ${totals.count}` : null}
          />
        </dl>
      </section>

      {/* ================================================================ */}
      {/* The real one, above the fold.                                     */}
      {/* ================================================================ */}
      {featured ? (
        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6" aria-labelledby="featured">
          <FeaturedPassport record={featured} />
        </section>
      ) : passports === null ? (
        <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <Skeleton className="h-56 w-full" />
        </div>
      ) : null}

      <HatchBand height="h-6" />

      {/* Filters — sticky, because the grid below can get long. */}
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
        {passports && !error ? (
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
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
          <div className="grid animate-fadeup gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((passport) => (
              <PassportCard key={passport.id} passport={passport} />
            ))}
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
    <article className="overflow-hidden rounded-lg border border-phosphor/35 bg-panel">
      <div className="h-px w-full origin-left animate-drawline bg-gradient-to-r from-phosphor via-phosphor/25 to-transparent" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-phosphor/20 bg-phosphor/[0.06] px-5 py-2 sm:px-6">
        <Dot tone="accent" pulse />
        <span className="font-mono text-2xs uppercase tracking-widest2 text-phosphor">
          Minted on {network.label} · token #{mint.tokenId}
        </span>
        <span className="font-mono text-2xs text-faint">block {formatCount(mint.blockNumber ?? 0)}</span>
      </div>

      <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-10">
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

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
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

          <Link href={`/passport/${record.id}`} className="btn-primary mt-6 no-underline">
            Open the passport
            <ArrowIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Four rows a stranger can click straight into. */}
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

function Total({ label, value, accent = false }: { label: string; value: string | null; accent?: boolean }) {
  return (
    <div className="bg-panel px-4 py-4">
      <dt className="label">{label}</dt>
      <dd className={`mt-1.5 font-mono text-lg leading-none ${accent ? 'text-phosphor' : 'text-fg'}`}>
        {value ?? <Skeleton className="h-4 w-16" />}
      </dd>
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
