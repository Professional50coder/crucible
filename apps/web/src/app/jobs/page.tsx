'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { AdapterIcon, ArrowIcon } from '@/components/icons'
import {
  EmptyState,
  ErrorState,
  IconTile,
  NetworkBadge,
  Skeleton,
  StateBadge,
} from '@/components/ui'
import { listJobs } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { progressPercent } from '@/lib/task-states'
import type { Job } from '@/lib/types'

const POLL_MS = 3000

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listJobs()
      .then((result) => {
        setJobs(result)
        setError(null)
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Unknown error'),
      )
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-8">
        <div>
          <p className="label">Managed by the daemon</p>
          <h1 className="mt-3 text-title font-medium text-fg">Runs</h1>
          <p className="measure mt-4 text-sm leading-relaxed text-dim text-pretty">
            Every fine-tuning task Crucible is managing. The daemon watches each 48-hour
            acknowledgement window, retries every download path 0G offers, and escalates before
            the deadline rather than after it — so nothing here needs you polling a CLI.
          </p>
        </div>
        <Link href="/new" className="btn-primary no-underline">
          New run
          <ArrowIcon className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="mt-8">
        {error && !jobs ? (
          <ErrorState title="Could not load runs" body={error} onRetry={load} />
        ) : !jobs ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[4.5rem]" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Upload a dataset and Crucible handles funding, task creation, polling, the acknowledgement window and the passport."
            action={{ href: '/new', label: 'Start a run' }}
          />
        ) : (
          <ul className="space-y-px overflow-hidden rounded-lg border border-line bg-line">
            {jobs.map((job) => {
              const failed = job.state === 'Failed'
              const percent = failed ? 100 : progressPercent(job.state)

              return (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-panel px-4 py-4 no-underline transition-colors hover:bg-raised sm:px-5"
                  >
                    <IconTile tone={failed ? 'danger' : job.state === 'Finished' ? 'ok' : 'accent'}>
                      <AdapterIcon className="h-4 w-4" />
                    </IconTile>

                    <div className="min-w-0 flex-1 basis-48">
                      <div className="truncate font-mono text-sm text-fg">{job.name ?? job.id}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-2xs text-faint">
                        <span>{job.id}</span>
                        {job.model ? <span>{job.model}</span> : null}
                        <span>{formatRelative(job.createdAt)}</span>
                      </div>
                    </div>

                    <div className="hidden w-32 shrink-0 md:block">
                      <div className="h-px w-full bg-line">
                        <div
                          className={`h-px ${failed ? 'bg-danger' : 'bg-phosphor'}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="mt-1.5 font-mono text-2xs text-faint">
                        {failed ? 'halted' : `${percent}%`}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <NetworkBadge network={job.network} />
                      <StateBadge state={job.state} queued={job.queued} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
