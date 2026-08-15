'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { PassportCard } from '@/components/PassportCard'
import { SearchIcon } from '@/components/icons'
import { EmptyState, ErrorState, HatchBand, Skeleton } from '@/components/ui'
import { applyFilter, listPassports } from '@/lib/api'
import { formatCount } from '@/lib/format'
import type { Network, PassportSummary } from '@/lib/types'

type NetworkFilter = Network | 'all'

/**
 * The gallery is the demo centrepiece: a wall of passports, each one a page a
 * stranger can open and check. So the page leads with the aggregate — how much
 * has been trained through here and how much of it is anchored — and then gets
 * out of the way.
 */
export default function GalleryPage() {
  const [passports, setPassports] = useState<PassportSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [network, setNetwork] = useState<NetworkFilter>('all')
  const [model, setModel] = useState<string>('all')
  const [query, setQuery] = useState('')

  const load = useCallback(() => {
    setError(null)
    setPassports(null)

    listPassports()
      .then(setPassports)
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
      anchored: source.filter((p) => p.mintStatus === 'minted').length,
      attested: source.filter((p) => p.attestationVerified).length,
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
          checkable by anyone — no wallet, no account, no permission.
        </p>

        <dl className="mt-9 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          <Total label="Passports" value={passports ? formatCount(totals.count) : null} />
          <Total
            label="Tokens trained"
            value={passports ? formatCount(totals.tokens) : null}
            accent
          />
          <Total
            label="Anchored on chain"
            value={passports ? `${totals.anchored} / ${totals.count}` : null}
          />
          <Total
            label="TEE attested"
            value={passports ? `${totals.attested} / ${totals.count}` : null}
          />
        </dl>
      </section>

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
              <Skeleton key={i} className="h-72" />
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
