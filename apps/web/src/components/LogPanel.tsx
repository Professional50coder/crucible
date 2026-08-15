'use client'

import { useEffect, useRef } from 'react'

import { formatTimestamp } from '@/lib/format'
import type { LogLine } from '@/lib/types'
import { Skeleton } from './ui'

const levelClass: Record<LogLine['level'], string> = {
  info: 'text-dim',
  ok: 'text-ok',
  warn: 'text-warn',
  error: 'text-danger',
}

const levelMark: Record<LogLine['level'], string> = {
  info: '·',
  ok: '+',
  warn: '!',
  error: '×',
}

export function LogPanel({
  lines,
  loading = false,
  follow = true,
}: {
  lines: LogLine[]
  loading?: boolean
  follow?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!follow || !scroller.current) return
    scroller.current.scrollTop = scroller.current.scrollHeight
  }, [lines, follow])

  if (loading) {
    return (
      <div className="space-y-2 px-4 py-4 sm:px-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="dotfield bg-sub px-4 py-10 text-center sm:px-5">
        <p className="font-mono text-xs text-dim">No provider output yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-faint text-pretty">
          0G streams logs once the task reaches Setting up. This panel follows the tail as they
          arrive — nothing to refresh.
        </p>
      </div>
    )
  }

  return (
    <div ref={scroller} className="max-h-80 overflow-y-auto scroll-x bg-sub">
      <ol className="min-w-max px-4 py-3 font-mono text-xs leading-6 sm:px-5">
        {lines.map((line, index) => (
          <li key={`${line.ts}-${index}`} className="flex gap-3 whitespace-nowrap">
            <span className="shrink-0 text-faint">{formatTimestamp(line.ts).slice(11, 19)}</span>
            <span className={`shrink-0 ${levelClass[line.level]}`} aria-hidden="true">
              {levelMark[line.level]}
            </span>
            <span className={levelClass[line.level]}>{line.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
