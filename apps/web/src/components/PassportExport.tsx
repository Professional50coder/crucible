'use client'

/**
 * The take-it-with-you control.
 *
 * A passport that only exists on a page it is served from is a passport you have
 * to keep trusting the server for. Both downloads here are self-contained
 * documents: the JSON is the exact canonical bytes the anchored hash commits to,
 * and the SVG certificate carries those same bytes inside its own metadata, so a
 * file saved from this page can be checked against 0G Chain years later by
 * someone who never loads this app. See `lib/passport-export.ts`.
 *
 * Both are real `<a download>` links with `data:` hrefs present at first paint —
 * not click handlers that construct a blob. Script-initiated downloads are
 * refused outright in several embedding sandboxes, and a download button that
 * silently does nothing is worse than no button. The copy control is the fallback
 * for the case where even the anchor is blocked.
 */

import { useMemo } from 'react'

import { certificateFile, manifestFile, toDataUrl } from '@/lib/passport-export'
import type { PassportRecord } from '@/lib/types'
import { CopyButton } from './Hash'
// `icons.tsx` ships no download glyph and this control does not justify adding
// one: the arrow is the same arrow, turned around.
import { UploadIcon } from './icons'
import { Panel, PanelHeader } from './ui'

export function PassportExport({ record }: { record: PassportRecord }) {
  const manifest = useMemo(() => manifestFile(record), [record])
  const certificate = useMemo(() => certificateFile(record), [record])

  return (
    <Panel className="no-print mt-4">
      <PanelHeader
        title="Take this passport with you"
        aside={
          <span className="font-mono text-2xs text-faint">
            {manifest.text.length} bytes canonical
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <a
          href={toDataUrl(certificate)}
          download={certificate.filename}
          className="btn-ghost no-underline"
          aria-label="Download the SVG certificate, with the canonical manifest embedded in it"
        >
          <UploadIcon className="h-3.5 w-3.5 rotate-180" />
          certificate.svg
        </a>
        <a
          href={toDataUrl(manifest)}
          download={manifest.filename}
          className="btn-ghost no-underline"
          aria-label="Download the canonical manifest JSON"
        >
          <UploadIcon className="h-3.5 w-3.5 rotate-180" />
          manifest.json
        </a>

        <span className="ml-auto flex items-center gap-1">
          <span className="font-mono text-2xs text-faint">copy canonical</span>
          <CopyButton value={manifest.text} label="canonical manifest" />
        </span>
      </div>

      <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-faint text-pretty sm:px-5">
        The certificate is not a picture of the evidence — it carries the evidence. The canonical
        manifest is embedded in the SVG’s metadata, so anyone holding the file can pull it back out,
        recompute <span className="font-mono text-dim">keccak256</span> over it, and compare the
        result against{' '}
        <span className="font-mono text-dim">
          passportOf({record.mint.tokenId ?? '<tokenId>'}).manifestRootHash
        </span>{' '}
        without trusting this page or the image. The technique is Excalidraw’s{' '}
        <span className="font-mono text-dim">exportEmbedScene</span>; see docs/PRIOR_ART.md.
      </p>
    </Panel>
  )
}
