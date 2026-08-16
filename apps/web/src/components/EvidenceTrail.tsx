'use client'

/**
 * The audit log behind a passport.
 *
 * A passport is a certificate: it states an outcome and anchors a hash. That is
 * the right shape for the top of the page and the wrong shape for anyone who
 * wants to check the *process* rather than the claim. The reference is
 * Documenso, which ships two artefacts for every signed document — a short
 * signing certificate, and an exhaustive audit log of every event with its
 * timestamp — precisely so a third party can audit the procedure instead of
 * taking the certificate's word for it. Idea only: Documenso is AGPL-3.0 and no
 * code from it is used or adapted here. Cited in the report.
 *
 * What this renders and why it is built the way it is:
 *
 *  - **Only recorded instants become rows.** The one thing an audit log may
 *    never do is interpolate. A run whose delivery time is unknown gets a
 *    shorter trail, not an invented one — see `NOTHING_RECORDED` below for what
 *    an empty trail says instead of drawing an empty box.
 *  - **The 48-hour window is a reference point, not a row.** It is arithmetic
 *    over `deliveredAt`, so it renders as a marker with its derivation stated,
 *    and only when a delivery instant was actually recorded.
 *  - **Gaps carry their duration.** "How long did this sit at Delivered before
 *    anyone acted" is the question that cost this project its first model, and
 *    a timeline that shows instants without intervals cannot answer it.
 *
 * ── What the wire gives us, and what this component can therefore use ────────
 *
 * `services/orchestrator/src/wire.ts` now sends `WireJob.transitions`
 * (`{ state, at }[]`, oldest first), plus the `ackDeadlineMissed` and
 * `artifactAtRisk` booleans. None of those three fields exist on the client
 * types in `@/lib/types` — `Job` carries only `history?: Partial<Record<
 * TaskState, string>>` and `PassportRecord` carries no history at all — and
 * `lib/types.ts` is not this change's to edit. So the trail is assembled from
 * the instants a `PassportRecord` genuinely carries today:
 *
 *     manifest.createdAt · record.deliveredAt · mint.mintedAt
 *     record.settlement.acknowledged (+ note) · record.adapterOrigin
 *
 * When `transitions` reaches the client type this component takes it as an
 * optional prop (`transitions`) and renders the real state history in place of
 * the derived rows — the prop is already threaded through so that change is
 * additive rather than a rewrite.
 */

import { ACK_WINDOW_HOURS, acknowledgeDeadline } from '@/lib/deadline'
import { formatDuration, formatTimestamp } from '@/lib/format'
import { NETWORKS, txUrl } from '@/lib/chains'
import type { PassportRecord, TaskState } from '@/lib/types'
import { Hash } from './Hash'
import { AlertIcon, CheckIcon } from './icons'
import { Dot } from './ui'

/**
 * One entry of a job's state history as the orchestrator sends it
 * (`WireTransition` in services/orchestrator/src/wire.ts — field names taken
 * from that file, not guessed). Declared locally because `@/lib/types` does not
 * carry it yet and this component may not edit that file.
 */
export interface EvidenceTransition {
  state: TaskState
  at: string
}

type Tone = 'neutral' | 'ok' | 'danger' | 'warn'

interface TrailEntry {
  /** ISO instant. Every entry has one — an entry without a time is not evidence. */
  at: string
  label: string
  /** What was recorded, and where the value came from. Rendered verbatim. */
  detail: string
  tone: Tone
  /** A transaction the reader can open, where one exists for this entry. */
  txHash?: string
}

/** What an empty trail says. Never an empty box, never a fabricated timeline. */
const NOTHING_RECORDED =
  'No state history was recorded for this run. The orchestrator sends a job’s transitions over ' +
  'the wire, but this passport was assembled without them, so there is nothing to show — and a ' +
  'timeline reconstructed from a mint timestamp would be a guess dressed as a record.'

export function EvidenceTrail({
  record,
  transitions,
  now = new Date(),
}: {
  record: PassportRecord
  /**
   * The orchestrator's own state history, when a caller has it. Optional today
   * because no client type carries it; passing it makes the trail authoritative
   * rather than derived.
   */
  transitions?: EvidenceTransition[]
  /** Injected so the elapsed columns are deterministic under test. */
  now?: Date
}) {
  const entries = buildTrail(record, transitions)

  // Provenance gates every claim below, exactly as it does on the rest of the
  // passport: a demo record's timestamps are invented, so its trail is labelled
  // as a fixture and never links out to an explorer that would 404.
  const onChain = record.provenance === 'chain'
  const network = NETWORKS[record.manifest.network]

  const deliveredAt = record.deliveredAt
  const deadline = deliveredAt ? acknowledgeDeadline(deliveredAt) : null

  /**
   * The deliverable was never acknowledged, so 0G destroyed the artifact and
   * took its 30%. Read from the settlement the record carries, not inferred
   * from the task state — a provider reporting `Finished` is reporting on its
   * own work and says nothing about whether anyone collected the model.
   */
  const lost = record.settlement?.acknowledged === false
  const sentinel = record.adapterOrigin?.kind === 'sentinel'

  return (
    <section
      className="overflow-hidden rounded-lg border border-line bg-panel"
      aria-labelledby="evidence-trail"
      data-testid="evidence-trail"
      data-provenance={record.provenance ?? 'demo'}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-sub px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 id="evidence-trail" className="label text-dim">
            Evidence trail
          </h2>
          <span className="font-mono text-2xs text-faint">
            every instant this run recorded, in order
          </span>
        </div>

        {/* The same distinction the rest of the page turns on, restated here
            because a timeline is exactly the sort of thing a reader assumes is
            a log of real events. */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-widest2 ${
            onChain ? 'border-phosphor/40 text-phosphor' : 'border-line text-faint'
          }`}
          data-testid="trail-provenance"
        >
          {onChain ? <CheckIcon className="h-2.5 w-2.5" /> : <Dot tone="neutral" />}
          {onChain ? `on chain · ${network.label}` : 'demo — invented timestamps'}
        </span>
      </div>

      {/* The verdict, before the rows. A reader who stops here must not stop
          with the wrong impression: a run that lost its model says so at the
          top of its own audit log, not three rows down. */}
      {lost ? (
        <p
          className="flex items-start gap-2 border-b border-danger/25 bg-danger/[0.05] px-4 py-3 text-xs leading-relaxed text-danger/90 sm:px-5"
          data-testid="trail-verdict"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {/*
            Worded deliberately unlike the settlement panel above it. The two say
            the same true thing, and a reader who meets the identical sentence
            twice reads the second as boilerplate rather than as a second source.
          */}
          <span>
            This run did not keep its model. The 48-hour window closed with the deliverable
            unacknowledged, the artifact was forfeited, and 0G took its 30% penalty out of the
            fee.
            {sentinel
              ? ' The adapter field on this passport holds a published sentinel rather than an artifact.'
              : ''}
          </span>
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="measure px-4 py-5 text-xs leading-relaxed text-faint text-pretty sm:px-5">
          {NOTHING_RECORDED}
        </p>
      ) : (
        <ol className="divide-y divide-line/70" data-testid="trail-entries">
          {entries.map((entry, index) => {
            // Interval to the *previous* recorded instant. First row has no
            // predecessor, so it has no gap — not a zero.
            const previous = index > 0 ? entries[index - 1] : undefined
            const gapMs = previous
              ? new Date(entry.at).getTime() - new Date(previous.at).getTime()
              : null

            return (
              <li
                key={`${entry.label}-${entry.at}`}
                className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-5"
                data-testid="trail-entry"
              >
                <div className="min-w-0">
                  <time
                    dateTime={entry.at}
                    className="block font-mono text-2xs tabular-nums text-dim"
                  >
                    {formatTimestamp(entry.at)}
                  </time>
                  {gapMs !== null && gapMs > 0 ? (
                    <span className="mt-0.5 block font-mono text-2xs tabular-nums text-faint">
                      +{formatDuration(gapMs)}
                    </span>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <p
                    className={`font-mono text-xs ${
                      {
                        neutral: 'text-fg',
                        ok: 'text-ok',
                        danger: 'text-danger',
                        warn: 'text-warn',
                      }[entry.tone]
                    }`}
                  >
                    {entry.label}
                  </p>
                  <p className="measure mt-1 text-xs leading-relaxed text-faint text-pretty">
                    {entry.detail}
                  </p>

                  {/* The acknowledgement transaction, where the record actually
                      carries one. Linked only for an on-chain record — a demo
                      hash sent to an explorer teaches the reader that the links
                      on this app are decorative. */}
                  {entry.txHash ? (
                    <div className="mt-1.5 min-w-0" data-testid="trail-tx">
                      <Hash
                        value={entry.txHash}
                        href={
                          onChain ? txUrl(record.manifest.network, entry.txHash) : undefined
                        }
                        hrefLabel={onChain ? network.explorerLabel : undefined}
                        title="Acknowledgement transaction"
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* The window itself: arithmetic, so it is marked as arithmetic and shown
          only when the instant it is derived from was actually recorded. */}
      {deadline && deliveredAt ? (
        <div
          className="border-t border-line bg-sub px-4 py-3 sm:px-5"
          data-testid="trail-deadline"
        >
          <p className="label">{ACK_WINDOW_HOURS}-hour acknowledgement window</p>
          <p className="mt-1 font-mono text-2xs tabular-nums text-dim">
            closed <time dateTime={deadline.toISOString()}>{formatTimestamp(deadline.toISOString())}</time>
            {' · '}
            {formatTimestamp(deliveredAt)} + {ACK_WINDOW_HOURS}h
          </p>
          <p className="measure mt-1.5 text-xs leading-relaxed text-faint text-pretty">
            {deadline.getTime() <= now.getTime()
              ? lost
                ? 'The window is closed and the deliverable was never acknowledged. This is the deadline the run missed.'
                : 'The window is closed. The deliverable was acknowledged inside it.'
              : 'The window is still open. 0G destroys the artifact and deducts 30% of the fee if it closes unacknowledged.'}
          </p>
        </div>
      ) : null}
    </section>
  )
}

/**
 * The rows, assembled from recorded instants only.
 *
 * When `transitions` is supplied it *is* the trail — the orchestrator's own
 * history beats anything derived. Otherwise every entry below is tied to a
 * field the record genuinely carries, and a missing field drops its row rather
 * than producing a plausible-looking one.
 */
function buildTrail(
  record: PassportRecord,
  transitions?: EvidenceTransition[],
): TrailEntry[] {
  if (transitions && transitions.length > 0) {
    return transitions
      .filter((transition) => Number.isFinite(new Date(transition.at).getTime()))
      .map((transition) => ({
        at: transition.at,
        label: transition.state,
        detail: 'State recorded by the orchestrator.',
        tone: transition.state === 'Failed' ? ('danger' as const) : ('neutral' as const),
      }))
      .sort(byTime)
  }

  const entries: TrailEntry[] = []
  const lost = record.settlement?.acknowledged === false
  const sentinel = record.adapterOrigin?.kind === 'sentinel'

  if (record.deliveredAt) {
    entries.push({
      at: record.deliveredAt,
      label: 'Delivered',
      detail:
        'The provider delivered the task. This instant starts the 48-hour acknowledgement clock, ' +
        'and it is the only point from which the deadline below can be computed.',
      tone: 'warn',
    })
  }

  if (record.settlement) {
    // The settlement is a fact read off FineTuningServing, but the record does
    // not carry the instant it settled — only the mint does. So the row is hung
    // on the mint timestamp and says which instant it is showing, rather than
    // implying the settlement happened then.
    const at = record.mint.mintedAt ?? record.manifest.createdAt
    entries.push({
      at,
      label: lost
        ? 'Acknowledgement never completed — the model was lost'
        : 'Deliverable acknowledged on chain',
      detail:
        `getDeliverables reports acknowledged: ${record.settlement.acknowledged}. ` +
        (record.settlement.note ?? '') +
        ' (Shown at the mint instant: the record carries no separate settlement timestamp.)',
      tone: lost ? 'danger' : 'ok',
      txHash: acknowledgeTxFrom(record),
    })
  }

  if (sentinel && record.mint.mintedAt) {
    entries.push({
      at: record.mint.mintedAt,
      label: 'Adapter not retrieved — sentinel anchored',
      detail:
        record.adapterOrigin?.reason ??
        'No adapter was ever retrieved for this run, so the passport anchors a published sentinel ' +
          'rather than an artifact hash.',
      tone: 'danger',
    })
  }

  if (record.mint.mintedAt && record.mint.status === 'minted') {
    entries.push({
      at: record.mint.mintedAt,
      label: `Passport minted${record.mint.tokenId ? ` — token #${record.mint.tokenId}` : ''}`,
      detail:
        record.mint.blockNumber !== undefined
          ? `Written to Passport.sol in block ${record.mint.blockNumber}. The outcome above is what ` +
            'this token permanently records.'
          : 'Written to Passport.sol.',
      tone: 'neutral',
    })
  }

  return entries.filter((e) => Number.isFinite(new Date(e.at).getTime())).sort(byTime)
}

function byTime(a: TrailEntry, b: TrailEntry): number {
  return new Date(a.at).getTime() - new Date(b.at).getTime()
}

/**
 * The acknowledgement transaction, when the record carries one.
 *
 * There is no `acknowledgeTx` field on `PassportRecord` — the only place the
 * hash appears today is inside `settlement.note`, which states it in prose
 * ("Acknowledge transaction 0x…"). Extracting it is preferable to inventing a
 * field or dropping the one transaction a reader most wants to open, and the
 * match is deliberately strict: a full 32-byte hash or nothing. A note without
 * one yields no link rather than a truncated or guessed value.
 */
function acknowledgeTxFrom(record: PassportRecord): string | undefined {
  if (record.settlement?.acknowledged !== true) return undefined
  const match = /0x[0-9a-fA-F]{64}/.exec(record.settlement.note ?? '')
  return match?.[0]
}
