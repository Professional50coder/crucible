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
import type { PassportSummary } from '@/lib/types'
import { AlertIcon, CheckIcon } from './icons'
import { Dot } from './ui'

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function PassportTable({ passports }: { passports: PassportSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[38rem] border-collapse text-left">
        <caption className="sr-only">
          Every passport Crucible has recorded, with its provenance, size, fee and age.
        </caption>

        <thead>
          <tr className="border-b border-line bg-sub">
            <Th className="w-14 text-right">#</Th>
            <Th>Passport</Th>
            <Th>Provenance</Th>
            <Th className="hidden lg:table-cell">Model</Th>
            <Th className="hidden md:table-cell text-right">Examples</Th>
            <Th className="hidden md:table-cell text-right">Tokens</Th>
            <Th className="hidden xl:table-cell text-right">Fee</Th>
            <Th className="text-right">Age</Th>
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
