'use client'

/**
 * Dataset upload and validation.
 *
 * 0G rejects a malformed dataset *after* the file has been uploaded and *after*
 * funds have moved, and the rejection tells you very little. So everything is
 * checked here first, in the browser, with the line number and the fix.
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

const FORMAT_LABELS: Record<string, string> = {
  chat: 'chat-messages',
  instruction: 'instruction',
  text: 'text-completion',
}

export function DatasetInput({ onChange }: DatasetInputProps) {
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const analysis = useMemo(
    () => (source.trim() === '' ? null : analyseJsonl(source)),
    [source],
  )

  const apply = useCallback(
    (text: string, name: string) => {
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
      setReading(true)
      try {
        const text = await file.text()
        apply(text, file.name)
      } catch {
        apply('', '')
      } finally {
        setReading(false)
      }
    },
    [apply],
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
          JSONL · UTF-8 · one format throughout · at least {MINIMUM_EXAMPLES} examples
        </p>
      </div>

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
