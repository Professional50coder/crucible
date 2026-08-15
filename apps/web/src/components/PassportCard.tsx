'use client'

import Link from 'next/link'

import { formatBytes, formatCount, formatElapsed, formatOg, formatRelative } from '@/lib/format'
import type { PassportSummary } from '@/lib/types'
import { AdapterIcon, AlertIcon, ArrowIcon, CheckIcon, ShieldIcon } from './icons'
import { Badge, Dot, IconTile, NetworkBadge } from './ui'

export function PassportCard({ passport }: { passport: PassportSummary }) {
  const onChain = passport.provenance === 'chain'
  const sentinel = passport.adapterKind === 'sentinel'

  return (
    <Link
      href={`/passport/${passport.id}`}
      className={`group flex h-full flex-col rounded-lg border bg-panel no-underline transition-colors hover:bg-raised ${
        onChain
          ? 'border-phosphor/35 hover:border-phosphor/60'
          : 'border-line hover:border-line-bright'
      }`}
    >
      {/* The provenance strip. On a wall of cards this is the first thing that
          separates a record you can check from one that only shows the shape. */}
      <div
        className={`flex items-center gap-2 rounded-t-lg px-4 py-1.5 ${
          onChain ? 'bg-phosphor/[0.07]' : 'bg-sub'
        }`}
      >
        <Dot tone={onChain ? 'accent' : 'neutral'} />
        <span
          className={`font-mono text-2xs uppercase tracking-widest2 ${
            onChain ? 'text-phosphor' : 'text-faint'
          }`}
        >
          {onChain ? 'verified on chain' : 'demo record'}
        </span>
      </div>

      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <IconTile tone={onChain ? 'accent' : 'default'}>
          <AdapterIcon className="h-4 w-4" />
        </IconTile>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm text-fg transition-colors group-hover:text-phosphor">
            {passport.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-2xs text-faint">
            {passport.id} · {passport.model}
          </p>
        </div>

        <ArrowIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-phosphor" />
      </div>

      <div className="flex-1 px-4 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <NetworkBadge network={passport.network} />
          {passport.attestationVerified ? (
            <Badge tone="ok">
              <ShieldIcon className="h-3 w-3" />
              TEE verified
            </Badge>
          ) : (
            <Badge tone="warn">TEE unverified</Badge>
          )}
          {sentinel ? (
            <Badge tone="danger">
              <AlertIcon className="h-3 w-3" />
              no adapter
            </Badge>
          ) : null}
        </div>

        <p className="mt-3.5 line-clamp-3 text-xs leading-relaxed text-dim text-pretty">
          {passport.summary}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
          <div className="min-w-0">
            <dt className="label">Examples</dt>
            <dd className="mt-0.5 font-mono text-xs text-fg">
              {formatCount(passport.exampleCount)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Tokens</dt>
            <dd className="mt-0.5 font-mono text-xs text-fg">{formatCount(passport.tokenCount)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Adapter</dt>
            <dd
              className={`mt-0.5 font-mono text-xs ${sentinel ? 'text-danger' : 'text-fg'}`}
              title={sentinel ? 'No adapter was ever retrieved for this run' : undefined}
            >
              {sentinel
                ? 'not retrieved'
                : passport.adapterSizeBytes
                  ? formatBytes(passport.adapterSizeBytes)
                  : '—'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Fee</dt>
            <dd className="mt-0.5 font-mono text-xs text-fg">
              {formatOg(passport.totalNeuron)} 0G
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
        {passport.mintStatus === 'minted' ? (
          <Badge tone={onChain ? 'accent' : 'neutral'}>
            {onChain ? <CheckIcon className="h-3 w-3" /> : null}
            anchored · #{passport.tokenId}
          </Badge>
        ) : passport.mintStatus === 'pending' ? (
          <Badge tone="warn">
            <Dot tone="warn" pulse />
            minting
          </Badge>
        ) : (
          <Badge>unminted</Badge>
        )}

        <span className="font-mono text-2xs text-faint">
          {passport.durationSeconds ? `${formatElapsed(passport.durationSeconds)} · ` : ''}
          {formatRelative(passport.createdAt)}
        </span>
      </div>
    </Link>
  )
}
