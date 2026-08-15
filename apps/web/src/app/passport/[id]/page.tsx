'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { PassportView } from '@/components/PassportView'
import { EmptyState, ErrorState, LoadingPanel, Skeleton } from '@/components/ui'
import { getPassport } from '@/lib/api'
import type { PassportRecord } from '@/lib/types'

type Status = 'loading' | 'ready' | 'missing' | 'error'

export default function PassportPage({ params }: { params: { id: string } }) {
  const { id } = params

  const [record, setRecord] = useState<PassportRecord | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    setStatus('loading')

    getPassport(id)
      .then((result) => {
        if (result === null) {
          setStatus('missing')
          return
        }
        setRecord(result)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        setMessage(cause instanceof Error ? cause.message : 'Unknown error')
        setStatus('error')
      })
  }, [id])

  useEffect(load, [load])

  if (status === 'loading') {
    // The skeleton traces the certificate it is standing in for — ribbon, head,
    // four checks, chain of custody — so the page does not visibly reflow into a
    // different shape the moment the record lands.
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14" aria-busy="true">
        <Skeleton className="mb-8 h-3 w-20" />
        <Skeleton className="h-7 w-full rounded-b-none" />
        <Skeleton className="h-52 w-full rounded-none" />
        <Skeleton className="h-12 w-full rounded-t-none" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="mt-4">
          <LoadingPanel label="Reading manifest and recomputing its hash" />
        </div>
        <p className="mt-4 font-mono text-2xs text-faint" role="status">
          Nothing is trusted here: the anchored hash is recomputed in this browser.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorState title="Could not load this passport" body={message} onRetry={load} />
      </div>
    )
  }

  if (status === 'missing' || record === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          title={`No passport with id "${id}"`}
          body={
            <>
              Passport ids look like <span className="font-mono text-dim">p-000001</span> or{' '}
              <span className="font-mono text-dim">p-4c1f9a</span>. If you followed a link from a
              fine-tuning run, the passport may not have been minted yet.
            </>
          }
          action={{ href: '/gallery', label: 'Browse the gallery' }}
        />
        <p className="mt-6 text-center text-xs text-faint">
          <Link href="/" className="no-underline hover:text-fg">
            What is a Model Passport?
          </Link>
        </p>
      </div>
    )
  }

  return <PassportView record={record} />
}
