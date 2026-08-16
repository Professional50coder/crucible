/**
 * The card a passport shows when its link is pasted somewhere else.
 *
 * A passport is meant to be shared, and the first thing most readers will ever
 * see of one is a 1200x630 preview in a chat window. That preview is doing the
 * same job as the page: it must be honest at a glance, and it must not flatter
 * the record.
 *
 * Two decisions follow from that.
 *
 * 1. **It is an instrument panel, not a screenshot.** A squeezed thumbnail of
 *    the certificate would be unreadable at preview size, and unreadable
 *    provenance is decorative provenance. So the landscape frame carries only
 *    what survives being small: the manifest hash set large in mono, the base
 *    model, the TEE provider, the token, and one status line.
 * 2. **The failure cases must look different.** A demo record is stamped as a
 *    demo record, and a passport whose adapter was never retrieved is stamped in
 *    red with the reason. If passport #1 and passport #2 produced the same card,
 *    the card would be lying about the one thing that separates them.
 *
 * The image is keyed off the manifest hash via `generateImageMetadata`, so its
 * URL changes only when the anchored document changes — which, the anchor being
 * immutable, is never. That makes it safely cacheable forever.
 *
 * The record is read through `getPassport()` in `lib/api.ts`, the same seam every
 * page uses. A second data path here would be a second thing to keep honest.
 */

import { ImageResponse } from 'next/og'

import { getPassport } from '@/lib/api'
import { attestationLine, hashLines, statusLine } from '@/lib/passport-export'
import type { PassportRecord } from '@/lib/types'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** The palette, lifted from tailwind.config.ts. Satori takes no class names. */
const INK = '#131414'
const SUB = '#0d0e0e'
const PANEL = '#191a1a'
const LINE = '#282a29'
const FG = '#ecedea'
const DIM = '#a6a8a2'
const FAINT = '#82847e'
const PHOSPHOR = '#c8f050'
const OK = '#4ade80'
const WARN = '#fbbf24'
const DANGER = '#f87171'

/**
 * No webfont is fetched, by the rule the app's font stack already follows: a
 * build that reaches a CDN is a build that fails offline, and an OG image that
 * fails to render is worse than a plain one. `monospace` is requested by family
 * name; the renderer answers with what it has.
 */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/**
 * The image id — and therefore its URL — is the manifest hash.
 *
 * `Passport.sol` makes the anchored hash immutable after mint, so this id can
 * never go stale for a given passport; a different id means a different anchored
 * document, which is exactly when the card should be re-fetched.
 */
export async function generateImageMetadata({ params }: { params: { id: string } }) {
  const record = await getPassport(params.id)

  return [
    {
      id: record ? record.mint.manifestRootHash.slice(2, 18) : 'unknown',
      alt: record ? altText(record) : `No Crucible passport with id ${params.id}`,
      size,
      contentType,
    },
  ]
}

/** The alt text carries the same verdict the image does, for readers using one. */
function altText(record: PassportRecord): string {
  const serial = record.mint.tokenId ? `#${record.mint.tokenId}` : 'unminted'
  const provenance = (record.provenance ?? 'demo') === 'chain' ? 'on chain' : 'demo record'
  return `Crucible Model Passport ${serial}, ${provenance}. ${statusLine(record).text}`
}

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  const record = await getPassport(params.id)

  if (record === null) {
    return new ImageResponse(<Missing id={params.id} />, size)
  }

  return new ImageResponse(<Card record={record} />, size)
}

function Missing({ id }: { id: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 72,
        background: INK,
        fontFamily: MONO,
      }}
    >
      <div style={{ fontSize: 22, letterSpacing: 4, color: FAINT }}>CRUCIBLE MODEL PASSPORT</div>
      <div style={{ fontSize: 52, color: FG, marginTop: 24 }}>No passport with id {id}</div>
    </div>
  )
}

function Card({ record }: { record: PassportRecord }) {
  const { manifest, mint } = record

  const onChain = (record.provenance ?? 'demo') === 'chain'
  const status = statusLine(record)
  const statusColor = status.tone === 'danger' ? DANGER : OK

  const serial = mint.tokenId ? `#${mint.tokenId}` : '—'
  // Two 33-character runs. The full hash, because on a certificate the whole
  // value is the content — and because a truncated hash cannot be compared.
  const hash = hashLines(mint.manifestRootHash, 33)

  const cells: Array<[string, string]> = [
    ['BASE MODEL', manifest.base.model],
    ['TEE', 'Intel TDX · Phala dstack'],
    ['TOKEN', mint.tokenId ? `#${mint.tokenId}` : 'not minted'],
    ['NETWORK', onChain ? networkLabel(manifest.network) : `${networkLabel(manifest.network)} (demo)`],
  ]

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: INK,
        fontFamily: MONO,
        color: FG,
      }}
    >
      {/* The foil rule, as on the page. */}
      <div style={{ display: 'flex', height: 6, width: '100%', background: PHOSPHOR }} />

      {/* Provenance band. Read first, because it governs how much weight every
          hash below it carries. A demo record is never allowed to look anchored. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          paddingLeft: 56,
          paddingRight: 56,
          background: onChain ? SUB : '#2a1f14',
          color: onChain ? PHOSPHOR : WARN,
          fontSize: 20,
          letterSpacing: 3,
        }}
      >
        {onChain
          ? `ON CHAIN · ${networkLabel(manifest.network).toUpperCase()}${
              mint.tokenId ? ` · TOKEN #${mint.tokenId}` : ''
            }`
          : 'DEMO RECORD · FIXTURE DATA · NOTHING HERE IS ON CHAIN'}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          paddingLeft: 56,
          paddingRight: 56,
          paddingTop: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', fontSize: 44, color: PHOSPHOR }}>{serial}</div>
          <div style={{ display: 'flex', fontSize: 30, color: FG, marginLeft: 22 }}>
            {record.name ?? manifest.base.model}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 18, color: FAINT, letterSpacing: 2, marginTop: 22 }}>
          {onChain ? 'ANCHORED MANIFEST HASH' : 'MANIFEST HASH · NOT ANCHORED'}
        </div>

        {/* The hash, set as large as 1200px allows. This is the value the whole
            passport exists to let a stranger check. */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
          {hash.map((line) => (
            <div key={line} style={{ display: 'flex', fontSize: 34, color: PHOSPHOR, lineHeight: 1.3 }}>
              {line}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', width: '100%', height: 1, background: LINE, marginTop: 22 }} />

        <div style={{ display: 'flex', marginTop: 20 }}>
          {cells.map(([label, value]) => (
            <div
              key={label}
              style={{ display: 'flex', flexDirection: 'column', width: '25%', paddingRight: 16 }}
            >
              <div style={{ display: 'flex', fontSize: 15, letterSpacing: 2, color: FAINT }}>
                {label}
              </div>
              <div style={{ display: 'flex', fontSize: 20, color: DIM, marginTop: 8 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* The status line. Passport #1 and passport #2 must not produce the same
          card: one lost its model and one kept it, and that is the single most
          important thing either record has to say. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 56,
          paddingRight: 56,
          paddingTop: 16,
          paddingBottom: 22,
          background: PANEL,
          borderTop: `2px solid ${statusColor}`,
        }}
      >
        <div style={{ display: 'flex', fontSize: 21, color: statusColor }}>{status.text}</div>
        <div style={{ display: 'flex', fontSize: 15, color: WARN, marginTop: 10 }}>
          {attestationLine(record)}
        </div>
      </div>
    </div>
  )
}

/** Spelled out, so a testnet card can never be mistaken for a mainnet one. */
function networkLabel(network: PassportRecord['manifest']['network']): string {
  return network === 'testnet' ? '0G Galileo testnet' : '0G mainnet'
}
