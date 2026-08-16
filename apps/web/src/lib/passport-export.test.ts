import { describe, expect, it } from 'vitest'

import { canonicalHash, canonicalize, hashUtf8 } from './manifest'
import { REAL, REAL2, buildPassports, realPassport, realPassport2 } from './mock/fixtures'
import {
  attestationLine,
  canonicalManifest,
  certificateFile,
  escapeXml,
  extractEmbeddedManifest,
  fromDataUrl,
  hashEmbeddedManifest,
  hashLines,
  manifestFile,
  passportSvg,
  provenanceLine,
  statusLine,
  toDataUrl,
} from './passport-export'
import type { PassportRecord } from './types'

/** The first demo record the mock ships. Its hashes are invented. */
function demoPassport(): PassportRecord {
  const demo = buildPassports().find((record) => (record.provenance ?? 'demo') === 'demo')
  expect(demo, 'the mock must ship at least one demo record').toBeDefined()
  return demo!
}

// ---------------------------------------------------------------------------
// The round trip — the reason this module exists
// ---------------------------------------------------------------------------

describe('embedded manifest — the round trip', () => {
  it('carries the canonical manifest out in the SVG and back in unchanged', () => {
    const record = realPassport()
    const svg = passportSvg(record)

    const payload = extractEmbeddedManifest(svg)
    expect(payload).not.toBeNull()
    expect(payload!.canonical).toBe(canonicalManifest(record))
  })

  it('recomputes to the hash anchored on chain for passport #1', () => {
    // The whole claim: a stranger holding only the downloaded file can reproduce
    // `passportOf(1).manifestRootHash` without trusting the picture.
    const svg = passportSvg(realPassport())

    expect(hashEmbeddedManifest(svg)).toBe(REAL.manifestRootHash)
  })

  it('recomputes to the hash anchored on chain for passport #2', () => {
    const svg = passportSvg(realPassport2())

    expect(hashEmbeddedManifest(svg)).toBe(REAL2.manifestRootHash)
  })

  it('survives re-canonicalisation — parsing and re-sorting yields the same hash', () => {
    // A verifier who parses the JSON rather than hashing the bytes verbatim must
    // land on the same value, or the export only works one specific way.
    const record = realPassport()
    const payload = extractEmbeddedManifest(passportSvg(record))!

    const reparsed = JSON.parse(payload.canonical) as Record<string, unknown>
    expect(canonicalize(reparsed)).toBe(payload.canonical)
    expect(canonicalHash(reparsed)).toBe(record.mint.manifestRootHash)
  })

  it('embeds the document the chain committed to, not the newer v1 manifest', () => {
    // Token #1 anchored a smaller record than this app's `PassportManifest`.
    // Exporting the v1 shape would produce a file that hashes to nothing on
    // chain — an export that fails the one check it exists to enable.
    const record = realPassport()
    const payload = extractEmbeddedManifest(passportSvg(record))!

    expect(record.anchoredManifest).toBeDefined()
    expect(payload.canonical).toBe(canonicalize(record.anchoredManifest!))
    expect(payload.canonical).not.toBe(canonicalize(record.manifest))
  })

  it('reports no payload rather than throwing on a foreign SVG', () => {
    expect(extractEmbeddedManifest('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeNull()
    expect(hashEmbeddedManifest('not an svg at all')).toBeNull()
  })

  it('refuses a payload that was edited after export', () => {
    const svg = passportSvg(realPassport())
    // Corrupt one base64 character inside the payload region.
    const tampered = svg.replace(/crucible-manifest-start ([A-Za-z0-9+/=]{40})/, (_m, head: string) =>
      `crucible-manifest-start ${'!'.repeat(4)}${head.slice(4)}`,
    )

    expect(extractEmbeddedManifest(tampered)).toBeNull()
  })

  it('detects a swapped manifest — the hash stops matching the anchor', () => {
    // Someone splices passport #2's document into passport #1's certificate.
    const svg = passportSvg(realPassport())
    const other = extractEmbeddedManifest(passportSvg(realPassport2()))!
    const spliced = svg.replace(
      extractPayloadRegion(svg),
      extractPayloadRegion(passportSvg(realPassport2())),
    )

    expect(hashEmbeddedManifest(spliced)).toBe(hashUtf8(other.canonical))
    expect(hashEmbeddedManifest(spliced)).not.toBe(REAL.manifestRootHash)
  })
})

function extractPayloadRegion(svg: string): string {
  const start = svg.indexOf('crucible-manifest-start ') + 'crucible-manifest-start '.length
  const end = svg.indexOf(' crucible-manifest-end -->')
  return svg.slice(start, end)
}

// ---------------------------------------------------------------------------
// Honesty on the face of the certificate
// ---------------------------------------------------------------------------

describe('the certificate says what the record says', () => {
  it('does not let passport #1 look like a completed fine-tune', () => {
    const svg = passportSvg(realPassport())

    expect(svg).toContain('ADAPTER NOT RETRIEVED')
    expect(svg).toContain('the model is gone')
    expect(statusLine(realPassport()).tone).toBe('danger')
  })

  it('renders passport #2 differently, with the bytes it actually kept', () => {
    const svg = passportSvg(realPassport2())

    expect(svg).toContain('ADAPTER RETRIEVED')
    expect(svg).toContain('93,642,469')
    expect(svg).not.toContain('ADAPTER NOT RETRIEVED')
  })

  it('labels a demo record as a demo record and never as on chain', () => {
    const record = demoPassport()
    const svg = passportSvg(record)

    expect(provenanceLine(record)).toContain('DEMO RECORD')
    expect(svg).toContain('DEMO RECORD')
    expect(svg).not.toContain('ON CHAIN')
    expect(extractEmbeddedManifest(svg)!.provenance).toBe('demo')
  })

  it('never claims the attestation was verified', () => {
    // `verifyService()` is called nowhere in this codebase, so both real
    // passports carry false and the certificate prints the field verbatim.
    for (const record of [realPassport(), realPassport2()]) {
      const svg = passportSvg(record)
      expect(svg).toContain('tee.attestationVerified = false')
      expect(extractEmbeddedManifest(svg)!.attestationVerified).toBe(false)
    }

    // A demo fixture may carry `true`. The certificate still refuses to present
    // that as a check anyone performed.
    for (const record of [realPassport(), realPassport2(), demoPassport()]) {
      const svg = passportSvg(record)
      expect(svg).not.toMatch(/attestation verified/i)
      expect(attestationLine(record)).toContain('tee.attestationVerified =')
      if (record.manifest.tee.attestationVerified) {
        expect(attestationLine(record)).toContain('asserted, not checked here')
      }
    }
  })

  it('never labels a testnet passport as mainnet', () => {
    const svg = passportSvg(realPassport())

    expect(svg).toContain('0G GALILEO TESTNET')
    expect(svg).not.toMatch(/mainnet/i)
  })

  it('states the anchored hash in full, because truncation is for tables', () => {
    const record = realPassport()

    expect(hashLines(record.mint.manifestRootHash).join('')).toBe(record.mint.manifestRootHash)
    expect(passportSvg(record)).toContain(hashLines(record.mint.manifestRootHash)[0]!)
  })
})

// ---------------------------------------------------------------------------
// Well-formedness
// ---------------------------------------------------------------------------

describe('the SVG is a file, not a string that looks like one', () => {
  it('escapes free text so a record name cannot break the markup', () => {
    const record = realPassport()
    record.name = 'a & b <script>alert("x")</script>'

    const svg = passportSvg(record)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('a &amp; b &lt;script&gt;')
    expect(escapeXml(`< & > " '`)).toBe('&lt; &amp; &gt; &quot; &apos;')
  })

  it('parses as XML with the payload intact', () => {
    const svg = passportSvg(realPassport())
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')

    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.tagName).toBe('svg')
    expect(doc.documentElement.getAttribute('width')).toBe('1200')
    // The payload rides in a comment, so an XML round trip leaves it alone.
    expect(hashEmbeddedManifest(new XMLSerializer().serializeToString(doc))).toBe(
      REAL.manifestRootHash,
    )
  })
})

// ---------------------------------------------------------------------------
// The files themselves
// ---------------------------------------------------------------------------

describe('exported files', () => {
  it('gives the JSON export exactly the bytes the anchor commits to', () => {
    const record = realPassport()
    const file = manifestFile(record)

    expect(file.mimeType).toBe('application/json')
    expect(hashUtf8(file.text)).toBe(REAL.manifestRootHash)
  })

  it('names files after the passport and its hash, so downloads never collide', () => {
    const one = manifestFile(realPassport())
    const two = certificateFile(realPassport2())

    expect(one.filename).toBe(`crucible-passport-p-000001-${REAL.manifestRootHash.slice(2, 14)}.json`)
    expect(two.filename).toBe(`crucible-passport-p-000002-${REAL2.manifestRootHash.slice(2, 14)}.svg`)
    expect(one.filename).not.toBe(two.filename)
  })

  it('produces a data: URL that decodes back to the file, so an anchor can carry it', () => {
    // The anchor's href has to be present at first paint — no script, no blob,
    // no revoke — because some embedding sandboxes refuse script-started
    // downloads outright.
    const file = certificateFile(realPassport())
    const url = toDataUrl(file)

    expect(url.startsWith('data:image/svg+xml;charset=utf-8;base64,')).toBe(true)
    expect(fromDataUrl(url)).toBe(file.text)
    expect(hashEmbeddedManifest(fromDataUrl(url))).toBe(REAL.manifestRootHash)
  })

  it('keeps the href opaque, so an export link is never mistaken for an explorer link', () => {
    // A demo record's invented dataset root must not appear as the target of
    // anything. `PassportView` is tested with `a[href*="<hash>"]` selectors, and
    // a percent-encoded data URL would match one — truthfully, by the selector,
    // and misleadingly, to a reader.
    const record = demoPassport()
    const url = toDataUrl(certificateFile(record))

    expect(url).not.toContain(record.manifest.dataset.rootHash)
    expect(url).not.toContain(record.mint.manifestRootHash)
  })
})
