'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { AckCountdown } from '@/components/AckCountdown'
import { Hash } from '@/components/Hash'
import { LogPanel } from '@/components/LogPanel'
import { StateMachine } from '@/components/StateMachine'
import {
  AdapterIcon,
  AlertIcon,
  ArrowIcon,
  DatasetIcon,
  EnclaveIcon,
  ModelIcon,
  SlidersIcon,
  TerminalIcon,
} from '@/components/icons'
import {
  Badge,
  EmptyState,
  ErrorState,
  NetworkBadge,
  Note,
  Panel,
  PanelHeader,
  Skeleton,
  StateBadge,
  Stat,
} from '@/components/ui'
import { getJob, getJobLogs, unlockJob } from '@/lib/api'
import { NETWORKS, addressUrl, storageScanHost, storageUrl } from '@/lib/chains'
import {
  formatBytes,
  formatCount,
  formatLearningRate,
  formatOg,
  formatRelative,
} from '@/lib/format'
import type { Job, LogLine, TaskState } from '@/lib/types'

const POLL_MS = 2000

type Status = 'loading' | 'ready' | 'missing' | 'error'

export default function JobPage({ params }: { params: { id: string } }) {
  const { id } = params

  const [job, setJob] = useState<Job | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockTx, setUnlockTx] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await getJob(id)
      if (result === null) {
        setStatus('missing')
        return
      }
      setJob(result)
      setStatus('ready')
      setLogs(await getJobLogs(id))
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unknown error')
      setStatus('error')
    }
  }, [id])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const onUnlock = useCallback(async () => {
    setUnlocking(true)
    try {
      const result = await unlockJob(id)
      setUnlockTx(result.txHash)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Unlock failed')
    } finally {
      setUnlocking(false)
    }
  }, [id])

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Skeleton className="mb-8 h-3 w-16" />
        <Skeleton className="h-24 w-full" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
        <p className="mt-4 font-mono text-2xs text-faint">Reading task state from 0G…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <ErrorState title="Could not load this run" body={message} onRetry={() => void load()} />
      </div>
    )
  }

  if (status === 'missing' || job === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          title={`No run with id "${id}"`}
          body="Run ids look like job_7f21c4. It may have been created in a different session — mock mode keeps runs in memory only."
          action={{ href: '/jobs', label: 'All runs' }}
        />
      </div>
    )
  }

  const network = NETWORKS[job.network]
  const failed = job.state === 'Failed'
  const failedAt = lastReached(job)
  const awaitingAck = job.deliveredAt !== null && job.state !== 'Failed'

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/jobs" className="mb-8 inline-block font-mono text-2xs text-faint no-underline hover:text-fg">
        ← runs
      </Link>

      {/* Head ---------------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div className="min-w-0">
          <p className="label">Fine-tuning run</p>
          <h1 className="mt-2 break-words font-mono text-xl text-fg sm:text-2xl">
            {job.name ?? job.id}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-faint">
            <span>{job.id}</span>
            {job.model ? <span>{job.model}</span> : null}
            <span>started {formatRelative(job.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NetworkBadge network={job.network} />
          <StateBadge state={job.state} queued={job.queued} />
          {job.passportId ? (
            <Link href={`/passport/${job.passportId}`} className="btn-primary no-underline">
              View passport
              <ArrowIcon className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </header>

      {/* The 48-hour promise, above everything else. -------------------- */}
      {awaitingAck && job.deliveredAt ? (
        <div className="mt-6">
          <AckCountdown
            deliveredAt={job.deliveredAt}
            acknowledgeScheduledFor={job.acknowledgeScheduledFor}
            acknowledgedAt={job.acknowledgedAt}
            totalNeuron={job.fee?.totalNeuron}
          />
        </div>
      ) : null}

      {/* Queued -------------------------------------------------------- */}
      {job.queued ? (
        <div className="mt-6">
          <Note tone="warn">
            <strong className="font-normal text-fg">Queued.</strong> {network.label} has exactly one
            fine-tuning provider and it takes one task at a time. This is a normal waiting state,
            not an error — Crucible holds the task and starts it the moment the provider frees up
            {job.queuePosition ? ` (position ${job.queuePosition})` : ''}.
          </Note>
        </div>
      ) : null}

      {/* Failure ------------------------------------------------------- */}
      {failed ? (
        <div className="mt-6 rounded-lg border border-danger/30 bg-danger/[0.05] px-5 py-5">
          <div className="flex items-start gap-3">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <h2 className="font-mono text-sm text-danger">{job.error ?? 'Task failed'}</h2>
              {job.errorHint ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-dim text-pretty">
                  {job.errorHint}
                </p>
              ) : null}
              <Link href="/new" className="btn-ghost mt-4 no-underline">
                Start a corrected run
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Body ---------------------------------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Task lifecycle"
              icon={<AdapterIcon className="h-3.5 w-3.5" />}
              aside={
                <span className="font-mono text-2xs text-faint">
                  0G reports ten states; all of them are shown
                </span>
              }
            />
            <div className="px-4 py-5 sm:px-5">
              <StateMachine
                state={job.state}
                failedAt={failedAt}
                history={job.history}
                queued={job.queued}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Provider log"
              icon={<TerminalIcon className="h-3.5 w-3.5" />}
              aside={<span className="font-mono text-2xs text-faint">{logs.length} lines</span>}
            />
            <LogPanel lines={logs} />
          </Panel>

          {/* Bug #4 escape hatch. Only meaningful once something is stuck. */}
          {(failed || (job.deliveredAt && !job.acknowledgedAt)) ? (
            <Panel>
              <PanelHeader title="Stuck deliverable queue" />
              <div className="px-4 py-5 sm:px-5">
                <p className="max-w-2xl text-xs leading-relaxed text-dim text-pretty">
                  If an earlier task on this account was retrieved the deprecated way and never
                  acknowledged, the artifact is eventually garbage-collected and every later task
                  reverts with <span className="font-mono text-fg">previous deliverable not acknowledged</span>.
                  That is 0G Bug #4. The escape hatch is{' '}
                  <span className="font-mono text-fg">acknowledgeDeliverable</span>, which is
                  documented only inside a TSDoc comment.
                </p>

                {unlockTx ? (
                  <div className="mt-4">
                    <Note tone="ok">
                      Queue unlocked. Transaction{' '}
                      <Hash value={unlockTx} className="align-middle" tone="accent" /> — later
                      tasks will now be accepted.
                    </Note>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onUnlock()}
                    disabled={unlocking}
                    className="btn-ghost mt-4"
                  >
                    {unlocking ? 'Sending…' : 'Unlock deliverable queue'}
                  </button>
                )}
              </div>
            </Panel>
          ) : null}
        </div>

        {/* Sidebar ----------------------------------------------------- */}
        <aside className="space-y-4">
          <Panel>
            <PanelHeader title="Run" icon={<ModelIcon className="h-3.5 w-3.5" />} />
            <div className="space-y-4 px-4 py-4 sm:px-5">
              {job.taskId ? (
                <div>
                  <div className="label">0G task id</div>
                  <div className="mt-1">
                    <Hash value={job.taskId} head={10} tail={6} title="task id" />
                  </div>
                </div>
              ) : (
                <Stat label="0G task id" value="not yet assigned" />
              )}

              <div>
                <div className="label">Provider</div>
                <div className="mt-1">
                  <Hash
                    value={job.provider}
                    href={addressUrl(job.network, job.provider)}
                    hrefLabel={network.explorerLabel}
                    title="provider"
                  />
                </div>
              </div>

              {job.datasetRootHash ? (
                <div>
                  <div className="label">Dataset root hash</div>
                  <div className="mt-1">
                    <Hash
                      value={job.datasetRootHash}
                      href={storageUrl(job.network, job.datasetRootHash)}
                      hrefLabel={storageScanHost(job.network)}
                      title="dataset root hash"
                    />
                  </div>
                </div>
              ) : null}

              {job.adapterRootHash ? (
                <div>
                  <div className="label">Adapter root hash</div>
                  <div className="mt-1">
                    <Hash
                      value={job.adapterRootHash}
                      href={storageUrl(job.network, job.adapterRootHash)}
                      hrefLabel={storageScanHost(job.network)}
                      title="adapter root hash"
                    />
                  </div>
                  {job.adapterSizeBytes ? (
                    <p className="mt-1 font-mono text-2xs text-faint">
                      {formatBytes(job.adapterSizeBytes)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {job.adapterPath ? (
                <Stat label="Local adapter" value={job.adapterPath} />
              ) : null}
            </div>
          </Panel>

          {job.dataset ? (
            <Panel>
              <PanelHeader title="Dataset" icon={<DatasetIcon className="h-3.5 w-3.5" />} />
              <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:px-5">
                <Stat label="File" value={job.dataset.filename ?? '—'} />
                <Stat label="Format" value={job.dataset.format ?? '—'} />
                <Stat
                  label="Examples"
                  value={job.dataset.exampleCount ? formatCount(job.dataset.exampleCount) : '—'}
                />
                <Stat
                  label="Tokens"
                  value={job.dataset.tokenCount ? formatCount(job.dataset.tokenCount) : '—'}
                />
              </div>
            </Panel>
          ) : null}

          {job.config ? (
            <Panel>
              <PanelHeader title="Config" icon={<SlidersIcon className="h-3.5 w-3.5" />} />
              <div className="px-4 py-3 sm:px-5">
                <table className="w-full">
                  <tbody className="divide-y divide-line">
                    {(
                      [
                        ['epochs', job.config.num_train_epochs],
                        ['batch', job.config.per_device_train_batch_size],
                        ['lr', formatLearningRate(job.config.learning_rate)],
                        ['neftune', job.config.neftune_noise_alpha],
                        [
                          'max_steps',
                          job.config.max_steps === -1 ? '-1' : job.config.max_steps,
                        ],
                      ] as Array<[string, string | number]>
                    ).map(([key, value]) => (
                      <tr key={key}>
                        <th
                          scope="row"
                          className="py-2 pr-3 text-left font-mono text-2xs font-normal uppercase tracking-widest2 text-faint"
                        >
                          {key}
                        </th>
                        <td className="py-2 text-right font-mono text-xs text-fg">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          {job.fee ? (
            <Panel>
              <PanelHeader title="Fee" />
              <div className="space-y-3 px-4 py-4 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label">Training</span>
                  <span className="font-mono text-xs text-fg">
                    {formatOg(job.fee.trainingNeuron)} 0G
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label">Storage reserve</span>
                  <span className="font-mono text-xs text-fg">
                    {formatOg(job.fee.storageReserveNeuron)} 0G
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <span className="label text-dim">Total</span>
                  <span className="font-mono text-sm text-phosphor">
                    {formatOg(job.fee.totalNeuron)} 0G
                  </span>
                </div>
              </div>
            </Panel>
          ) : null}

          {job.hardware ? (
            <Panel>
              <PanelHeader title="Hardware" icon={<EnclaveIcon className="h-3.5 w-3.5" />} />
              <div className="space-y-2 px-4 py-4 font-mono text-xs sm:px-5">
                <Row k="GPU" v={job.hardware.gpu} />
                <Row k="vCPU" v={String(job.hardware.vcpu)} />
                <Row k="Memory" v={`${job.hardware.memoryGb} GB`} />
                <Row k="Disk" v={`${job.hardware.storageGb} GB`} />
                <Row k="Enclave" v={job.hardware.tee} />
              </div>
            </Panel>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge>chain {job.chainId ?? network.chainId}</Badge>
            <Badge>polling {POLL_MS / 1000}s</Badge>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-faint">{k}</span>
      <span className="truncate text-right text-fg" title={v}>
        {v}
      </span>
    </div>
  )
}

/** The furthest state a job reached, used to place the failure on the timeline. */
function lastReached(job: Job): TaskState {
  const history = job.history ?? {}
  const order: TaskState[] = [
    'Init',
    'SettingUp',
    'SetUp',
    'Training',
    'Trained',
    'Delivering',
    'Delivered',
    'UserAcknowledged',
    'Finished',
  ]

  let furthest: TaskState = 'Init'
  for (const state of order) {
    if (history[state]) furthest = state
  }
  return furthest
}
