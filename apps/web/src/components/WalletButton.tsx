'use client'

/**
 * Wallet connection, rendered in Crucible's own style rather than RainbowKit's.
 *
 * Connecting is optional everywhere except launching a job and minting. Nothing
 * on a passport page requires it — that is the point of a passport — so this
 * button stays quiet and never blocks the interface.
 */

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'

import { truncateHash } from '@/lib/format'
import { Dot } from './ui'

export function WalletButton() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-8 w-[7.5rem] rounded border border-line" aria-hidden="true" />
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted: rkMounted }) => {
        const ready = rkMounted
        const connected = ready && account && chain

        if (!ready) {
          return <div className="h-8 w-[7.5rem] rounded border border-line" aria-hidden="true" />
        }

        if (!connected) {
          return (
            <button type="button" onClick={openConnectModal} className="btn-ghost h-8 px-3 py-0">
              Connect
            </button>
          )
        }

        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className="btn h-8 border-danger/50 px-3 py-0 text-danger">
              <Dot tone="danger" />
              Wrong network
            </button>
          )
        }

        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openChainModal}
              className="btn-quiet hidden h-8 px-2 py-0 sm:inline-flex"
              title="Switch network"
            >
              <Dot tone={chain.id === 16661 ? 'accent' : 'info'} />
              {chain.id === 16661 ? 'mainnet' : 'galileo'}
            </button>
            <button type="button" onClick={openAccountModal} className="btn-ghost h-8 px-3 py-0">
              {truncateHash(account.address, 4, 4)}
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
