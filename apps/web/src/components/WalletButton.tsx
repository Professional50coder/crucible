'use client'

/**
 * Wallet connection, rendered in Crucible's own style rather than RainbowKit's.
 *
 * Connecting is optional everywhere except launching a job and minting. Nothing
 * on a passport page requires it — that is the point of a passport — so this
 * control stays quiet and never blocks the interface.
 *
 * The network indicator is deliberately graded, because the previous version was
 * not. A visitor who has simply not connected a wallet was shown a red `WRONG
 * NETWORK` pill — the highest-contrast element on the page — for a condition
 * that is not an error and that no reader needs to resolve. Red on arrival reads
 * as "this site is broken", and it costs more credibility than the warning could
 * ever earn back. So:
 *
 *   disconnected      neutral chip naming the chain the app reads from. No
 *                     alarm, because nothing is wrong: passports are public.
 *   wrong chain       amber, with a switch action. This one *is* actionable, and
 *                     only someone who has already connected can see it.
 *   connected         the chain, then the address. Quiet.
 *
 * Red is reserved, here as everywhere in Crucible, for a value that was lost or
 * a hash that did not match.
 */

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect, useState } from 'react'

import { NETWORKS } from '@/lib/chains'
import { truncateHash } from '@/lib/format'
import { AlertIcon } from './icons'
import { Dot } from './ui'

/** The chain a reader is looking at when they have not connected anything. */
const READ_NETWORK = NETWORKS.testnet

/** Matches the rendered control's footprint so the header never reflows. */
function Placeholder() {
  return <div className="h-8 w-[11.5rem] rounded border border-line/60" aria-hidden="true" />
}

/**
 * The quiet state: name the chain, claim nothing else.
 *
 * Rendered as a static chip rather than a button because there is no action to
 * take — offering one would imply the reader is missing something.
 */
function NetworkChip() {
  return (
    <span
      className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 font-mono text-2xs uppercase tracking-widest2 text-dim sm:inline-flex"
      title="Passports are public. Crucible reads this chain without a wallet; connect only to launch a run or mint."
      data-testid="network-chip"
    >
      <Dot tone="info" />
      {READ_NETWORK.label}
    </span>
  )
}

export function WalletButton() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <Placeholder />

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted: rkMounted }) => {
        if (!rkMounted) return <Placeholder />

        const connected = Boolean(account && chain)

        // ---- Disconnected. Not an error state, and not styled as one. ----
        if (!connected) {
          return (
            <div className="flex shrink-0 items-center gap-1.5">
              <NetworkChip />
              <button type="button" onClick={openConnectModal} className="btn-ghost h-8 px-3 py-0">
                Connect
              </button>
            </div>
          )
        }

        // ---- Connected, but to a chain Crucible does not serve. ----
        // Amber, because a clock is not running and nothing is lost — there is
        // simply one thing to change, and the button says what it is.
        if (chain!.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="btn h-8 shrink-0 border-warn/45 px-3 py-0 text-warn hover:border-warn/70 hover:bg-warn/[0.06]"
              title={`Connected to an unsupported chain. Crucible runs on ${READ_NETWORK.label} (${READ_NETWORK.chainId}) and 0G mainnet (${NETWORKS.mainnet.chainId}).`}
              data-testid="wrong-chain"
            >
              <AlertIcon className="h-3.5 w-3.5" />
              Switch to 0G
            </button>
          )
        }

        const onMainnet = chain!.id === NETWORKS.mainnet.chainId

        return (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={openChainModal}
              className="btn-quiet hidden h-8 px-2 py-0 font-mono text-2xs uppercase tracking-widest2 sm:inline-flex"
              title="Switch network"
            >
              <Dot tone={onMainnet ? 'accent' : 'info'} />
              {onMainnet ? NETWORKS.mainnet.label : READ_NETWORK.label}
            </button>
            <button type="button" onClick={openAccountModal} className="btn-ghost h-8 px-3 py-0">
              {truncateHash(account!.address, 4, 4)}
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
