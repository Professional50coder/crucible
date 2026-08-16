'use client'

/**
 * The gallery's record list.
 *
 * This used to be a wall of cards. A card grid gives every record the same
 * visual weight, which is exactly wrong here: seven of the eight are fixtures
 * and one is a token that actually exists on a public chain. Eight equal cards
 * say "eight things happened". They did not.
 *
 * So the list is now a dense table, in the register of a public attestations
 * index — the structural reference is EAS's attestation list at
 * easscan.org/attestations, reimplemented here rather than adapted: a compact
 * header row, one line per record, provenance as a badge in its own column, and
 * relative age last. Cited in the report; no EAS code is used.
 *
 * Three things the table is built around:
 *
 *  - **Provenance is a column, not a decoration.** It sorts, it scans, and a
 *    reader can see at a glance how much of this page is real.
 *  - **Numbers are tabular and right-aligned.** Comparing example counts down a
 *    column is the only reason to put them in a table at all, and proportional
 *    digits make that comparison impossible.
 *  - **One tab stop per row.** The link in the first cell is stretched across
 *    the row, so the whole line is a hit target while the keyboard still sees a
 *    single focusable element with a visible ring.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

import { formatCount, formatOg, formatRelative } from '@/lib/format'
import type { Network, PassportSummary } from '@/lib/types'
import { AlertIcon, CheckIcon } from './icons'
import { Dot } from './ui'

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * The three columns worth ordering by.
 *
 * Deliberately not every column. A sort control on `Passport` or `Provenance`
 * would be a control that answers no question a reader has — the facet idea is
 * from Immich's asset browser (AGPL-3.0; idea only, no code taken or adapted),
 * and the lesson taken from it is that a facet earns its place by narrowing a
 * real question, not by existing for every field in the row.
 *
 *  - `age`    — newest or oldest first. The default, newest first.
 *  - `tokens` — how much data actually went through the run.
 *  - `fee`    — what it cost, compared across records.
 */
export const SORT_KEYS = ['age', 'tokens', 'fee'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDirection = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  direction: SortDirection
}

/** Newest first: the only default that makes sense for a record of runs. */
export const DEFAULT_SORT: Sort = { key: 'age', direction: 'desc' }

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value)
}

/**
 * Order a list of summaries.
 *
 * Pure, total, and non-mutating — it copies before sorting, because the caller's
 * array is the unfiltered source of truth for the counts in the header and a
 * sort that reorders it in place would silently change those too.
 *
 * `fee` compares as BigInt: neuron amounts are 1e16-scale strings and Number()
 * on them loses precision exactly where two records would need to be told apart.
 */
export function sortPassports(passports: PassportSummary[], sort: Sort): PassportSummary[] {
  const factor = sort.direction === 'asc' ? 1 : -1

  return [...passports].sort((a, b) => {
    let delta = 0

    if (sort.key === 'age') {
      // `desc` on age means newest first, which is the larger timestamp.
      delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    } else if (sort.key === 'tokens') {
      delta = a.tokenCount - b.tokenCount
    } else {
      const left = BigInt(a.totalNeuron || '0')
      const right = BigInt(b.totalNeuron || '0')
      delta = left < right ? -1 : left > right ? 1 : 0
    }

    // Ties resolve by id so the order is stable and a shared URL reproduces
    // exactly the list the sender was looking at.
    if (delta === 0) return a.id.localeCompare(b.id)
    return delta * factor
  })
}

// ---------------------------------------------------------------------------
// The gallery's view state, and its URL
// ---------------------------------------------------------------------------

/**
 * Filter + sort, serialised to a query string and back.
 *
 * A filtered gallery that cannot be linked to is a filtered gallery nobody can
 * cite. "The two on-chain records", "everything over 100k tokens" — each should
 * be a URL a reader can paste into a report. The facet model that makes that
 * worth doing is Immich's asset browser (AGPL-3.0 — idea only; no code taken or
 * adapted).
 *
 * **These live here rather than in `app/gallery/page.tsx` because a Next route
 * file may not export anything outside the route contract.** Next generates a
 * type in `.next/types` asserting that every non-route export of a `page.tsx` is
 * `never`, so exporting these two helpers from the page typechecks locally and
 * then fails `next build`. Keeping them in the module that already owns the
 * table's sorting keeps them unit-testable without breaking the build.
 */
export interface GalleryView {
  network: Network | 'all'
  model: string
  query: string
  sort: Sort
}

export const DEFAULT_VIEW: GalleryView = {
  network: 'all',
  model: 'all',
  query: '',
  sort: DEFAULT_SORT,
}

/**
 * Defaults are omitted, so an untouched gallery stays at `/gallery` rather than
 * carrying four redundant parameters a reader would have to squint past.
 */
export function viewToParams(view: GalleryView): string {
  const params = new URLSearchParams()
  if (view.network !== DEFAULT_VIEW.network) params.set('network', view.network)
  if (view.model !== DEFAULT_VIEW.model) params.set('model', view.model)
  if (view.query.trim() !== '') params.set('q', view.query)
  if (view.sort.key !== DEFAULT_SORT.key) params.set('sort', view.sort.key)
  if (view.sort.direction !== DEFAULT_SORT.direction) params.set('dir', view.sort.direction)
  return params.toString()
}

/**
 * Read a view out of a query string.
 *
 * Every value is validated against what the app actually supports, because a
 * query string is untrusted input like any other. An unrecognised
 * `network=solana` falls back to `all` rather than filtering every record away
 * and leaving the reader staring at an empty table with no explanation.
 */
export function paramsToView(search: string): GalleryView {
  const params = new URLSearchParams(search)
  const network = params.get('network')
  const dir = params.get('dir')
  const sortKey = params.get('sort')

  return {
    network: network === 'testnet' || network === 'mainnet' ? network : 'all',
    model: params.get('model') || 'all',
    query: params.get('q') ?? '',
    sort: {
      key: sortKey && isSortKey(sortKey) ? sortKey : DEFAULT_SORT.key,
      direction: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_SORT.direction,
    },
  }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function PassportTable({
  passports,
  sort,
  onSortChange,
}: {
  passports: PassportSummary[]
  /** Omitted by callers that render a fixed order; the headers stay inert text. */
  sort?: Sort
  onSortChange?: (sort: Sort) => void
}) {
  /**
   * Clicking the active column flips its direction; clicking a new one adopts
   * that column's natural direction — largest-first for quantities, newest-first
   * for age. Starting `tokens` ascending would open on the smallest run, which
   * is never the row anyone clicked the header to find.
   */
  const toggle = (key: SortKey) => {
    if (!onSortChange) return
    if (sort?.key === key) {
      onSortChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      onSortChange({ key, direction: 'desc' })
    }
  }

  const sortable = onSortChange !== undefined && sort !== undefined

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[38rem] border-collapse text-left">
        <caption className="sr-only">
          Every passport Crucible has recorded, with its provenance, size, fee and age.
          {sortable ? ` Sorted by ${sort.key}, ${sort.direction}ending.` : ''}
        </caption>

        <thead>
          <tr className="border-b border-line bg-sub">
            <Th className="w-14 text-right">#</Th>
            <Th>Passport</Th>
            <Th>Provenance</Th>
            <Th className="hidden lg:table-cell">Model</Th>
            <Th className="hidden md:table-cell text-right">Examples</Th>
            <SortTh
              sortKey="tokens"
              label="Tokens"
              sort={sortable ? sort : undefined}
              onSort={sortable ? toggle : undefined}
              className="hidden md:table-cell text-right"
            />
            <SortTh
              sortKey="fee"
              label="Fee"
              sort={sortable ? sort : undefined}
              onSort={sortable ? toggle : undefined}
              className="hidden xl:table-cell text-right"
            />
            <SortTh
              sortKey="age"
              label="Age"
              sort={sortable ? sort : undefined}
              onSort={sortable ? toggle : undefined}
              className="text-right"
            />
          </tr>
        </thead>

        <tbody>
          {passports.map((passport) => (
            <PassportRow key={passport.id} passport={passport} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PassportRow({ passport }: { passport: PassportSummary }) {
  const onChain = passport.provenance === 'chain'
  const sentinel = passport.adapterKind === 'sentinel'

  return (
    <tr
      className={`group relative border-b border-line/70 transition-colors last:border-b-0 hover:bg-raised focus-within:bg-raised ${
        onChain ? 'bg-phosphor/[0.035]' : ''
      }`}
      data-testid="passport-row"
      data-provenance={passport.provenance}
    >
      {/* Token number. The best numeral in the app, given its own column. */}
      <Td className="w-14 text-right">
        <span
          className={`font-mono text-sm tabular-nums ${onChain ? 'text-phosphor' : 'text-faint'}`}
        >
          {passport.tokenId ? `#${passport.tokenId}` : '—'}
        </span>
      </Td>

      {/* Name. Carries the stretched link, so the whole row is clickable while
          the keyboard sees exactly one stop. */}
      <Td>
        <Link
          // Encoded: the id is orchestrator-supplied, so it is not ours to
          // splice into a route unescaped.
          href={`/passport/${encodeURIComponent(passport.id)}`}
          className="font-mono text-[13px] text-fg no-underline transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-phosphor"
        >
          {passport.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-faint">
          <span>{passport.id}</span>
          <span className="lg:hidden">{passport.model}</span>
          {sentinel ? (
            <span className="inline-flex items-center gap-1 text-danger/90">
              <AlertIcon className="h-2.5 w-2.5" />
              no adapter
            </span>
          ) : null}
        </div>
      </Td>

      {/* Rendered once, at every width. Duplicating it into the name cell for
          small screens would read it twice to a screen reader — the badge is
          compact enough to keep its own column throughout. */}
      <Td>
        <ProvenanceBadge onChain={onChain} />
      </Td>

      <Td className="hidden lg:table-cell">
        <span className="font-mono text-2xs text-dim">{passport.model}</span>
      </Td>

      <Num className="hidden md:table-cell">{formatCount(passport.exampleCount)}</Num>
      <Num className="hidden md:table-cell">{formatCount(passport.tokenCount)}</Num>
      <Num className="hidden xl:table-cell">{formatOg(passport.totalNeuron)} 0G</Num>

      <Td className="text-right">
        <span className="whitespace-nowrap font-mono text-2xs tabular-nums text-faint">
          {formatRelative(passport.createdAt)}
        </span>
      </Td>
    </tr>
  )
}

/**
 * The one distinction the page exists to make.
 *
 * `on chain` is claimed only by a record whose hashes were produced by a real
 * run and whose explorer links resolve. Everything else says `demo`, in grey,
 * without apology — a fixture that admits it is a fixture costs nothing, and a
 * fixture dressed as evidence costs the whole argument.
 */
function ProvenanceBadge({ onChain }: { onChain: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-widest2 ${
        onChain ? 'border-phosphor/40 text-phosphor' : 'border-line text-faint'
      }`}
    >
      {onChain ? <CheckIcon className="h-2.5 w-2.5" /> : <Dot tone="neutral" />}
      {onChain ? 'on chain' : 'demo'}
    </span>
  )
}

/**
 * A column header that sorts.
 *
 * `aria-sort` on the `th` is the part that matters: it is the only way a screen
 * reader learns that a column is ordered and which way, and an arrow glyph
 * communicates that to sighted readers alone. The button carries the label so
 * the whole header is one hit target and one tab stop, matching the row rule
 * above.
 *
 * Without an `onSort` this degrades to plain header text rather than a dead
 * button — a control that looks interactive and does nothing is worse than no
 * control.
 */
function SortTh({
  sortKey,
  label,
  sort,
  onSort,
  className = '',
}: {
  sortKey: SortKey
  label: string
  sort?: Sort
  onSort?: (key: SortKey) => void
  className?: string
}) {
  if (!onSort || !sort) {
    return <Th className={className}>{label}</Th>
  }

  const active = sort.key === sortKey
  const ascending = active && sort.direction === 'asc'

  return (
    <th
      scope="col"
      aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
      data-testid={`sort-${sortKey}`}
      className={`label whitespace-nowrap px-3 py-2.5 font-normal first:pl-4 last:pr-4 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-widest2 transition-colors ${
          active ? 'text-phosphor' : 'text-inherit hover:text-fg'
        }`}
      >
        {label}
        <span aria-hidden="true" className="font-mono text-2xs">
          {active ? (ascending ? '↑' : '↓') : '↕'}
        </span>
        <span className="sr-only">
          {active
            ? `— sorted ${ascending ? 'ascending' : 'descending'}, activate to reverse`
            : '— activate to sort by this column'}
        </span>
      </button>
    </th>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`label whitespace-nowrap px-3 py-2.5 font-normal first:pl-4 last:pr-4 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top first:pl-4 last:pr-4 ${className}`}>{children}</td>
}

function Num({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Td className={`text-right ${className}`}>
      <span className="whitespace-nowrap font-mono text-2xs tabular-nums text-dim">{children}</span>
    </Td>
  )
}
