/**
 * Taking a passport off this page — as bytes that can still be checked.
 *
 * A screenshot of a certificate proves nothing: it is a picture of some hashes,
 * and a picture can say anything. So the two things this module produces are
 * both *documents*, not pictures of documents:
 *
 *   1. the canonical manifest JSON — the exact bytes whose keccak256 is the
 *      value anchored on chain, byte-for-byte, no whitespace, keys sorted; and
 *   2. an SVG certificate **with those same bytes embedded inside it**.
 *
 * (2) is the one that matters. A downloaded SVG that merely *renders* a hash is
 * a decorative object. An SVG that carries the canonical manifest in its own
 * metadata is independently verifiable: pull the payload back out, recompute
 * keccak256 over it, and compare against `passportOf(tokenId).manifestRootHash`
 * on 0G Chain. Nothing in that chain of steps requires trusting this app, this
 * page, or the image itself — which is the same standard the passport page holds
 * itself to when it recomputes the anchored hash in the reader's browser.
 *
 * PRIOR ART. The embed-the-source-in-the-exported-image technique is taken from
 * Excalidraw's `exportEmbedScene` (MIT licensed — the idea is freely usable),
 * which stores the scene JSON inside the exported `.svg`/`.png` so the export can
 * be reopened and edited rather than being a dead raster. Excalidraw embeds it so
 * the file stays *editable*; Crucible embeds it so the file stays *checkable*.
 * The mechanism — base64 payload between explicit markers, inside a metadata
 * element — follows theirs. No Excalidraw code was copied.
 *
 * What this module will not do: it will not label a demo record as if it were on
 * chain, it will not describe the enclave attestation as verified (nothing in
 * this codebase calls `verifyService()`, and `tee.attestationVerified` is false
 * on every real passport), and it will not soften a run whose adapter was never
 * retrieved. The certificate says what the record says.
 */

import { canonicalize, hashUtf8 } from './manifest'
import type { PassportRecord } from './types'

// ---------------------------------------------------------------------------
// The embedded payload
// ---------------------------------------------------------------------------

/**
 * Markers around the base64 payload.
 *
 * XML comments, so the payload is inert to every SVG renderer and to any XML
 * parser, and so extraction needs nothing more than `indexOf` — a verifier
 * should not have to install an XML library to check a hash.
 */
export const PAYLOAD_START = '<!-- crucible-manifest-start '
export const PAYLOAD_END = ' crucible-manifest-end -->'

export const EXPORT_FORMAT = 'crucible-passport-export'
export const EXPORT_VERSION = 1

/**
 * What travels inside the SVG.
 *
 * `canonical` is the load-bearing field and is a *string*, not an object: the
 * whole claim is about specific bytes, and re-serialising an object risks
 * handing the verifier a document that hashes differently from the one that was
 * anchored. Everything else is context that helps a reader find the anchor to
 * compare against — none of it is trusted by the check itself.
 */
export interface EmbeddedManifest {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  passportId: string
  /** The exact canonical bytes the anchored hash commits to. */
  canonical: string
  /** `PassportData.manifestRootHash`, as read from the record. */
  anchoredHash: string
  network: string
  chainId: number
  tokenId?: string
  contractAddress?: string
  /** `chain` or `demo`. Absent on the record means demo — see types.ts. */
  provenance: 'chain' | 'demo'
  /** `sentinel` means no adapter was ever retrieved for this run. */
  adapterKind: 'retrieved' | 'sentinel'
  /** `getDeliverables(...).acknowledged`. False means the artifact is lost. */
  settlementAcknowledged?: boolean
  /** Always false today. Recorded so the export cannot quietly imply otherwise. */
  attestationVerified: boolean
}

/**
 * The document whose keccak256 is anchored on chain for this record.
 *
 * Token #1 anchored a smaller document than this app's v1 manifest, so the
 * record carries that document verbatim. Exporting the v1 manifest instead would
 * produce a file that hashes to something the chain has never heard of — an
 * export that fails the one check it exists to enable.
 */
export function hashedDocument(record: PassportRecord): Record<string, unknown> {
  return (record.anchoredManifest ?? record.manifest) as Record<string, unknown>
}

/** The canonical bytes of the anchored document, as a string. */
export function canonicalManifest(record: PassportRecord): string {
  return canonicalize(hashedDocument(record))
}

function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Decode(encoded: string): string {
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function buildEmbeddedManifest(record: PassportRecord): EmbeddedManifest {
  const { manifest, mint } = record

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    passportId: record.id,
    canonical: canonicalManifest(record),
    anchoredHash: mint.manifestRootHash,
    network: manifest.network,
    chainId: manifest.chainId,
    tokenId: mint.tokenId,
    contractAddress: mint.contractAddress,
    // Absent means demo. A record has to earn the claim that it is on chain.
    provenance: record.provenance ?? 'demo',
    adapterKind: record.adapterOrigin?.kind ?? 'retrieved',
    settlementAcknowledged: record.settlement?.acknowledged,
    attestationVerified: manifest.tee.attestationVerified,
  }
}

/**
 * Pull the manifest back out of an exported SVG.
 *
 * Returns `null` rather than throwing for anything that is not a Crucible
 * export: a verifier pointing this at an arbitrary SVG should learn "no payload
 * here", not get an exception it has to catch.
 */
export function extractEmbeddedManifest(svg: string): EmbeddedManifest | null {
  const start = svg.indexOf(PAYLOAD_START)
  if (start === -1) return null

  const from = start + PAYLOAD_START.length
  const end = svg.indexOf(PAYLOAD_END, from)
  if (end === -1) return null

  try {
    const parsed = JSON.parse(base64Decode(svg.slice(from, end).trim())) as EmbeddedManifest
    if (parsed?.format !== EXPORT_FORMAT) return null
    if (typeof parsed.canonical !== 'string') return null
    return parsed
  } catch {
    // Truncated, re-encoded, or edited payload. That is a failed verification,
    // not a crash — and saying so plainly is the honest answer.
    return null
  }
}

/**
 * keccak256 of the bytes carried inside an exported SVG.
 *
 * This is the whole point of the embed: hand it the file, get back the hash to
 * compare against `passportOf(tokenId).manifestRootHash`.
 */
export function hashEmbeddedManifest(svg: string): string | null {
  const payload = extractEmbeddedManifest(svg)
  return payload ? hashUtf8(payload.canonical) : null
}

// ---------------------------------------------------------------------------
// The SVG certificate
// ---------------------------------------------------------------------------

/** XML-escape. Record names and reasons are free text and reach the markup. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Break a 0x-prefixed hash into fixed-width runs the eye can compare. */
export function hashLines(hash: string, perLine = 34): string[] {
  const lines: string[] = []
  for (let i = 0; i < hash.length; i += perLine) lines.push(hash.slice(i, i + perLine))
  return lines
}

/**
 * The one line that says what this run actually produced.
 *
 * Derived from the record every time rather than written once: a passport whose
 * adapter survived says so, and a passport whose adapter was destroyed says
 * *that*, on the face of the certificate, where it cannot be missed.
 */
export function statusLine(record: PassportRecord): { text: string; tone: 'ok' | 'danger' | 'warn' } {
  const lost = record.settlement?.acknowledged === false
  const sentinel = (record.adapterOrigin?.kind ?? 'retrieved') === 'sentinel'

  if (lost || sentinel) {
    return {
      text: 'ADAPTER NOT RETRIEVED — the deliverable was never acknowledged and the model is gone',
      tone: 'danger',
    }
  }

  if (record.manifest.adapter.sizeBytes) {
    return {
      text: `ADAPTER RETRIEVED — ${record.manifest.adapter.sizeBytes.toLocaleString('en-US')} bytes, validated against the on-chain root hash`,
      tone: 'ok',
    }
  }

  return { text: 'ADAPTER RETRIEVED — validated against the on-chain root hash', tone: 'ok' }
}

/**
 * The attestation line — printed on every certificate, whatever the value.
 *
 * `verifyService()` is not called anywhere in this codebase, so nothing here has
 * ever checked an enclave quote. Every on-chain passport carries
 * `tee.attestationVerified: false` and says so. A record carrying `true` is
 * asserting it, not demonstrating it, and the certificate has to be worded so
 * that a reader cannot mistake the second for the first.
 */
export function attestationLine(record: PassportRecord): string {
  return record.manifest.tee.attestationVerified
    ? 'tee.attestationVerified = true as recorded — Crucible never calls verifyService(), so this is asserted, not checked here'
    : 'tee.attestationVerified = false — the enclave quote was never verified by Crucible'
}

/** The provenance band. A demo record never gets to look anchored. */
export function provenanceLine(record: PassportRecord): string {
  if ((record.provenance ?? 'demo') !== 'chain') {
    return 'DEMO RECORD — fixture data, nothing on chain, no link here resolves'
  }
  const token = record.mint.tokenId ? ` · TOKEN #${record.mint.tokenId}` : ''
  return `ON CHAIN · ${record.manifest.network === 'testnet' ? '0G GALILEO TESTNET' : '0G MAINNET'}${token}`
}

const COLORS = {
  ink: '#131414',
  sub: '#0d0e0e',
  panel: '#191a1a',
  line: '#282a29',
  lineBright: '#383a38',
  fg: '#ecedea',
  dim: '#a6a8a2',
  faint: '#82847e',
  phosphor: '#c8f050',
  ok: '#4ade80',
  warn: '#fbbf24',
  danger: '#f87171',
} as const

/**
 * No webfont is referenced, by the same rule the app's Tailwind stack follows: a
 * certificate that waits on a CDN is a certificate that fails to render. The
 * generic `monospace` family is requested and the viewer's own mono answers.
 */
const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

const SVG_WIDTH = 1200
const SVG_HEIGHT = 860

export function passportSvg(record: PassportRecord): string {
  const { manifest, mint } = record
  const onChain = (record.provenance ?? 'demo') === 'chain'
  const status = statusLine(record)
  const payload = base64Encode(JSON.stringify(buildEmbeddedManifest(record)))

  const serial = mint.tokenId ? `#${mint.tokenId}` : '—'
  const title = record.name ?? manifest.base.model
  const anchorLabel = onChain
    ? 'ANCHORED MANIFEST HASH · PassportData.manifestRootHash'
    : 'MANIFEST HASH ON THIS DEMO RECORD · not anchored anywhere'

  const rows: Array<[string, string]> = [
    ['BASE MODEL', manifest.base.model],
    ['TEE', manifest.tee.signerAddress],
    ['TASK', manifest.task.id],
    ['DATASET ROOT', manifest.dataset.rootHash],
    ['ADAPTER ROOT', manifest.adapter.rootHash],
    ['CONTRACT', mint.contractAddress ?? '—'],
  ]

  const hashRows = hashLines(mint.manifestRootHash)
    .map(
      (line, i) =>
        `<text x="64" y="${318 + i * 46}" font-family="${MONO}" font-size="38" letter-spacing="1.5" fill="${COLORS.phosphor}">${escapeXml(line)}</text>`,
    )
    .join('\n    ')

  const fieldRows = rows
    .map(([label, value], i) => {
      const y = 486 + i * 42
      return (
        `<text x="64" y="${y}" font-family="${MONO}" font-size="15" letter-spacing="1.6" fill="${COLORS.faint}">${escapeXml(label)}</text>` +
        `\n    <text x="300" y="${y}" font-family="${MONO}" font-size="17" fill="${COLORS.dim}">${escapeXml(value)}</text>`
      )
    })
    .join('\n    ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="Model Passport ${escapeXml(serial)} — ${escapeXml(title)}">
  <title>Model Passport ${escapeXml(serial)} — ${escapeXml(title)}</title>
  <desc>${escapeXml(provenanceLine(record))}. ${escapeXml(status.text)}. The canonical manifest is embedded in this file's metadata; recompute keccak256 over it and compare against the chain.</desc>
  <metadata>
    ${PAYLOAD_START}${payload}${PAYLOAD_END}
  </metadata>
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="${COLORS.ink}"/>
  <rect x="32" y="32" width="${SVG_WIDTH - 64}" height="${SVG_HEIGHT - 64}" fill="${COLORS.panel}" stroke="${COLORS.lineBright}" stroke-width="1"/>
  <rect x="32" y="32" width="${SVG_WIDTH - 64}" height="3" fill="${COLORS.phosphor}"/>

  <g>
    <rect x="33" y="35" width="${SVG_WIDTH - 66}" height="40" fill="${onChain ? COLORS.sub : '#2a1f14'}"/>
    <text x="64" y="61" font-family="${MONO}" font-size="15" letter-spacing="2.2" fill="${onChain ? COLORS.phosphor : COLORS.warn}">${escapeXml(provenanceLine(record))}</text>
  </g>

  <text x="64" y="132" font-family="${MONO}" font-size="15" letter-spacing="3" fill="${COLORS.faint}">MODEL PASSPORT</text>
  <text x="64" y="200" font-family="${MONO}" font-size="54" fill="${COLORS.phosphor}">${escapeXml(serial)}</text>
  <text x="${64 + Math.max(110, serial.length * 34)}" y="200" font-family="${MONO}" font-size="36" fill="${COLORS.fg}">${escapeXml(title)}</text>

  <line x1="64" y1="236" x2="${SVG_WIDTH - 64}" y2="236" stroke="${COLORS.line}" stroke-width="1"/>
  <text x="64" y="272" font-family="${MONO}" font-size="15" letter-spacing="2" fill="${COLORS.faint}">${escapeXml(anchorLabel)}</text>
    ${hashRows}

  <line x1="64" y1="440" x2="${SVG_WIDTH - 64}" y2="440" stroke="${COLORS.line}" stroke-width="1"/>
    ${fieldRows}

  <rect x="64" y="${SVG_HEIGHT - 176}" width="${SVG_WIDTH - 128}" height="52" fill="${COLORS.sub}" stroke="${status.tone === 'danger' ? COLORS.danger : COLORS.ok}" stroke-width="1"/>
  <text x="84" y="${SVG_HEIGHT - 143}" font-family="${MONO}" font-size="17" fill="${status.tone === 'danger' ? COLORS.danger : COLORS.ok}">${escapeXml(status.text)}</text>

  <text x="64" y="${SVG_HEIGHT - 92}" font-family="${MONO}" font-size="15" fill="${COLORS.warn}">${escapeXml(attestationLine(record))}</text>
  <text x="64" y="${SVG_HEIGHT - 66}" font-family="${MONO}" font-size="15" fill="${COLORS.faint}">This file carries its own canonical manifest. Extract it, keccak256 it, compare against the chain — trust nothing here.</text>
</svg>
`
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface ExportedFile {
  filename: string
  mimeType: string
  text: string
}

/** Filenames carry the hash, so two downloads of two passports never collide. */
function stem(record: PassportRecord): string {
  return `crucible-passport-${record.id}-${record.mint.manifestRootHash.slice(2, 14)}`
}

/** (a) The raw canonical manifest — the exact bytes the anchor commits to. */
export function manifestFile(record: PassportRecord): ExportedFile {
  return {
    filename: `${stem(record)}.json`,
    mimeType: 'application/json',
    text: canonicalManifest(record),
  }
}

/** (b) The certificate, with (a) embedded inside it. */
export function certificateFile(record: PassportRecord): ExportedFile {
  return {
    filename: `${stem(record)}.svg`,
    mimeType: 'image/svg+xml',
    text: passportSvg(record),
  }
}

/**
 * A `data:` URL for a real `<a download>`.
 *
 * Deliberately not a blob URL: blobs need a live `URL.createObjectURL` and a
 * revoke, which means the href only exists after an effect has run — and a
 * download that depends on script is exactly what several embedding sandboxes
 * refuse to start. A `data:` URL is present in the markup from first paint, so
 * the anchor is a plain link and the browser handles it.
 *
 * Base64 rather than percent-encoding, for a reason that is not cosmetic. A
 * percent-encoded href contains the record's hashes as literal text, which makes
 * an export link indistinguishable — to a reader, to a scraper, or to the test
 * that guards this rule — from an outbound link *to* one of those hashes. On a
 * demo record that distinction is the whole point: no invented value may appear
 * to be linked anywhere. Base64 keeps the href opaque, so a link is a link only
 * when it goes somewhere.
 */
export function toDataUrl(file: ExportedFile): string {
  return `data:${file.mimeType};charset=utf-8;base64,${base64Encode(file.text)}`
}

/** The inverse of `toDataUrl`. Exists so tests can read what a click would save. */
export function fromDataUrl(url: string): string {
  return base64Decode(url.slice(url.indexOf(';base64,') + ';base64,'.length))
}
