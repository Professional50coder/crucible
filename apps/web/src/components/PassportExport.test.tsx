import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { REAL, realPassport, realPassport2 } from '@/lib/mock/fixtures'
import { fromDataUrl, hashEmbeddedManifest } from '@/lib/passport-export'
import { PassportExport } from './PassportExport'

/** The href of a link, decoded back into the file the browser would save. */
function savedFile(link: HTMLAnchorElement): string {
  return fromDataUrl(link.getAttribute('href') ?? '')
}

function certificateLink(): HTMLAnchorElement {
  return screen.getByRole('link', { name: /svg certificate/i }) as HTMLAnchorElement
}

describe('<PassportExport>', () => {
  it('offers both documents as real links, not script-driven downloads', () => {
    // Several embedding sandboxes refuse a download a script started, so the
    // href has to be in the markup from first paint and the anchor has to carry
    // `download`. A button that silently does nothing is worse than no button.
    render(<PassportExport record={realPassport()} />)

    const certificate = certificateLink()
    const manifest = screen.getByRole('link', { name: /manifest json/i }) as HTMLAnchorElement

    for (const link of [certificate, manifest]) {
      expect(link.getAttribute('download')).toMatch(/^crucible-passport-p-000001-/)
      expect(link.getAttribute('href')?.startsWith('data:')).toBe(true)
    }

    expect(certificate.getAttribute('download')?.endsWith('.svg')).toBe(true)
    expect(manifest.getAttribute('download')?.endsWith('.json')).toBe(true)
  })

  it('hands over a certificate that still verifies once it has left the page', () => {
    // The point of the whole control: pull the manifest out of the downloaded
    // file, hash it, and land on the value anchored on 0G Galileo for token #1.
    render(<PassportExport record={realPassport()} />)

    expect(hashEmbeddedManifest(savedFile(certificateLink()))).toBe(REAL.manifestRootHash)
  })

  it('keeps a copy fallback for the case where even the anchor is blocked', () => {
    render(<PassportExport record={realPassport()} />)

    expect(screen.getByRole('button', { name: /copy canonical manifest/i })).toBeInTheDocument()
  })

  it('does not soften passport #1 — the exported certificate says the model is gone', () => {
    render(<PassportExport record={realPassport()} />)

    expect(savedFile(certificateLink())).toContain('ADAPTER NOT RETRIEVED')
  })

  it('exports passport #2 as the run that kept its model', () => {
    render(<PassportExport record={realPassport2()} />)

    const saved = savedFile(certificateLink())
    expect(saved).toContain('ADAPTER RETRIEVED')
    expect(saved).not.toContain('ADAPTER NOT RETRIEVED')
  })

  it('credits the prior art it borrowed the embedding technique from', () => {
    render(<PassportExport record={realPassport()} />)

    expect(screen.getByText(/exportEmbedScene/)).toBeInTheDocument()
    expect(screen.getByText(/docs\/PRIOR_ART\.md/)).toBeInTheDocument()
  })
})
