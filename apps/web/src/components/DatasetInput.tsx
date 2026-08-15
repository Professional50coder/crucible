'use client'

/**
 * Dataset upload and validation.
 *
 * 0G rejects a malformed dataset *after* the file has been uploaded and *after*
 * funds have moved, and the rejection tells you very little. So everything is
 * checked here first, in the browser, with the line number and the fix.
 *
 * Two properties this component is required to hold, and holds deliberately:
 *
 *  - **Nothing in an uploaded file is ever executed.** The content is read as
 *    text and parsed line-by-line with `JSON.parse`. There is no `eval`, no
 *    `Function`, no `dangerouslySetInnerHTML`, and the file name and contents
 *    only ever reach the DOM as text children — never as an attribute value,
 *    never as a URL.
 *  - **Reads are capped.** A dataset lives entirely in memory here (analysis
 *    needs the whole document), so an unbounded read is an unbounded allocation
 *    from a file picker. Anything past the cap is refused before a single byte
 *    is read, with the actual size named so the refusal is actionable.
 */

import { useCallback, useMemo, useRef, useState } from 'react'

import { MINIMUM_EXAMPLES, analyseJsonl, type DatasetAnalysis } from '@/lib/dataset'
import { formatBytes, formatCount } from '@/lib/format'
import { BROKEN_DATASET, SAMPLE_DATASET } from '@/lib/sample-dataset'
import { AlertIcon, CheckIcon, UploadIcon } from './icons'
import { Badge } from './ui'

export interface DatasetInputProps {
  onChange: (result: { filename: string; analysis: DatasetAnalysis } | null) => void
}

/**
 * The most this component will pull into memory, from a file or a paste.
 *
 * 8 MiB is far above any legitimate LoRA fine-tuning set — 0G's own worked
 * example is a few hundred kilobytes, and this project's real run was 61
 * examples — and far below the point at which reading it stalls the tab.
 */
export const MAX_DATASET_BYTES = 8 * 1024 * 1024

const FORMAT_LABELS: Record<string, string> = {
  chat: 'chat-messages',
  instruction: 'instruction',
  text: 'text-completion',
}

/** Bytes, not characters: a UTF-8 dataset of CJK text is 3× its length. */
const byteLength = (text: string) =>
  typeof TextEncoder === 'undefined' ? text.length : new TextEncoder().encode(text).length

export function DatasetInput({ onChange }: DatasetInputProps) {
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const analysis = useMemo(
    () => (source.trim() === '' ? null : analyseJsonl(source)),
    [source],
  )

  const apply = useCallback(
    (text: string, name: string) => {
      // The cap applies to pasted text too — a paste is the same allocation as
      // a file read, and refusing only one of the two paths is not a cap.
      if (byteLength(text) > MAX_DATASET_BYTES) {
        setRefusal(
          `That is ${formatBytes(byteLength(text))}. Crucible reads at most ` +
            `${formatBytes(MAX_DATASET_BYTES)} into the browser — split it, or upload the root ` +
            `hash of a set already on 0G Storage.`,
        )
        setSource('')
        setFilename('')
        onChange(null)
        return
      }

      setRefusal(null)
      setSource(text)
      setFilename(name)

      if (text.trim() === '') {
        onChange(null)
        return
      }
      onChange({ filename: name, analysis: analyseJsonl(text) })
    },
    [onChange],
  )

  const readFile = useCallback(
    async (file: File) => {
      // Checked before the read, not after: `file.text()` on a 2 GB file has
      // already cost the allocation by the time you could measure the result.
      if (file.size > MAX_DATASET_BYTES) {
        setRefusal(
          `${file.name} is ${formatBytes(file.size)}. Crucible reads at most ` +
            `${formatBytes(MAX_DATASET_BYTES)} into the browser — split it, or upload the root ` +
            `hash of a set already on 0G Storage.`,
        )
        setSource('')
        setFilename('')
        onChange(null)
        return
      }

      setReading(true)
      try {
        const text = await file.text()
        apply(text, file.name)
      } catch {
        setRefusal(`Could not read ${file.name}. It may not be a text file.`)
        setSource('')
        setFilename('')
        onChange(null)
      } finally {
        setReading(false)
      }
    },
    [apply, onChange],
  )

  const errors = analysis?.issues.filter((i) => i.severity === 'error') ?? []
  const warnings = analysis?.issues.filter((i) => i.severity === 'warning') ?? []

  return (
    <div>
      {/* Drop zone -------------------------------------------------- */}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) void readFile(file)
        }}
        className={`dotfield rounded-lg border border-dashed px-5 py-9 text-center transition-colors ${
          dragging ? 'border-phosphor bg-phosphor/[0.05]' : 'border-line-bright bg-sub'
        }`}
      >
        <UploadIcon className="mx-auto h-5 w-5 text-faint" />
        <p className="mt-3 text-sm text-dim">
          Drop a <span className="font-mono text-fg">.jsonl</span> file, or
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-ghost">
            {reading ? 'Reading…' : 'Choose a file'}
          </button>
          <button
            type="button"
            onClick={() => apply(SAMPLE_DATASET, 'sample-support-tone.jsonl')}
            className="btn-quiet"
          >
            Use the sample
          </button>
          <button
            type="button"
            onClick={() => apply(BROKEN_DATASET, 'broken-example.jsonl')}
            className="btn-quiet"
            title="Loads a deliberately malformed file to show what validation catches"
          >
            Try a broken one
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jsonl,.json,.txt,application/json,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void readFile(file)
          }}
        />

        <p className="mt-5 font-mono text-2xs leading-relaxed text-faint">
          JSONL · UTF-8 · one format throughout · at least {MINIMUM_EXAMPLES} examples · up to{' '}
          {formatBytes(MAX_DATASET_BYTES)}
        </p>
      </div>

      {/* A refused read. Stated where the file was dropped, with the number
          that caused it, rather than swallowed into a console warning. */}
      {refusal ? (
        <div
          className="mt-3 flex items-start gap-3 rounded-md border border-danger/30 bg-danger/[0.05] px-4 py-3"
          role="alert"
          data-testid="dataset-refusal"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-danger text-pretty">{refusal}</p>
        </div>
      ) : null}

      {/* Or paste ---------------------------------------------------- */}
      <details className="mt-3">
        <summary className="cursor-pointer list-none font-mono text-2xs text-faint hover:text-dim">
          or paste JSONL directly
        </summary>
        <textarea
          value={source}
          onChange={(event) => apply(event.target.value, filename || 'pasted.jsonl')}
          rows={6}
          spellCheck={false}
          placeholder={'{"messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}]}'}
          className="field mt-2 resize-y text-xs"
          aria-label="Dataset JSONL"
        />
      </details>

      {/* Analysis ---------------------------------------------------- */}
      {analysis ? (
        <div className="mt-4 animate-fadeup" data-testid="dataset-analysis">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {analysis.valid ? (
                <CheckIcon className="h-4 w-4 shrink-0 text-ok" />
              ) : (
                <AlertIcon className="h-4 w-4 shrink-0 text-danger" />
              )}
              <span className="truncate font-mono text-xs text-fg">{filename}</span>
              <span className="shrink-0 font-mono text-2xs text-faint">
                {formatBytes(new Blob([source]).size)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {analysis.format ? (
                <Badge tone="info">{FORMAT_LABELS[analysis.format] ?? analysis.format}</Badge>
              ) : null}
              <Badge tone={analysis.valid ? 'ok' : 'danger'}>
                {formatCount(analysis.exampleCount)} examples
              </Badge>
              <Badge>≈{formatCount(analysis.tokenCount)} tokens</Badge>
            </div>
          </div>

          {errors.length > 0 ? (
            <ul className="mt-3 space-y-px overflow-hidden rounded-md border border-danger/25 bg-danger/[0.03]">
              {errors.map((issue, index) => (
                <li key={index} className="flex gap-3 px-4 py-3">
                  <span className="shrink-0 font-mono text-2xs text-danger">
                    {issue.line ? `L${issue.line}` : '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-danger text-pretty">
                      {issue.message}
                    </p>
                    {issue.fix ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-dim text-pretty">
                        {issue.fix}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {warnings.length > 0 ? (
            <ul className="mt-3 space-y-px overflow-hidden rounded-md border border-warn/25 bg-warn/[0.03]">
              {warnings.map((issue, index) => (
                <li key={index} className="flex gap-3 px-4 py-3">
                  <span className="shrink-0 font-mono text-2xs text-warn">note</span>
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-warn/90 text-pretty">
                      {issue.message}
                    </p>
                    {issue.fix ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-dim text-pretty">
                        {issue.fix}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {analysis.valid && warnings.length === 0 ? (
            <p className="mt-3 px-1 text-xs leading-relaxed text-ok/80">
              Valid. Every rule 0G enforces after upload has been checked here first.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
