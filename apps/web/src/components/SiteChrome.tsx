'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { MOCK_MODE } from '@/lib/api'
import { CommandPalette } from './CommandPalette'
import { CrucibleMark } from './icons'
import { WalletButton } from './WalletButton'

const NAV = [
  { href: '/gallery', label: 'Gallery' },
  { href: '/jobs', label: 'Runs' },
  { href: '/new', label: 'New run' },
]

export function SiteHeader() {
  const pathname = usePathname() ?? '/'

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 no-underline transition-opacity hover:opacity-80"
        >
          <CrucibleMark className="h-5 w-5 text-fg" />
          <span className="font-mono text-sm font-medium tracking-widest2 text-fg">CRUCIBLE</span>
        </Link>

        <nav
          aria-label="Primary"
          className="no-scrollbar ml-2 flex h-full min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto sm:ml-6"
        >
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center whitespace-nowrap px-2.5 font-mono text-xs no-underline transition-colors sm:px-3 ${
                  active ? 'text-fg' : 'text-dim hover:text-fg'
                }`}
              >
                {item.label}
                {/* The current section is marked by a rule under the label, not
                    a filled pill — the header stays a hairline instrument. */}
                <span
                  className={`absolute inset-x-2.5 bottom-0 h-px transition-colors sm:inset-x-3 ${
                    active ? 'bg-phosphor' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              </Link>
            )
          })}
        </nav>

        {MOCK_MODE ? (
          <span
            className="hidden shrink-0 rounded-sm border border-warn/35 px-2 py-0.5 font-mono text-2xs uppercase tracking-widest2 text-warn/90 lg:inline-block"
            title="No orchestrator configured — this app is running on fixture data. Set NEXT_PUBLIC_CRUCIBLE_API_URL to go live."
          >
            mock data
          </span>
        ) : null}

        <CommandPalette />
        <WalletButton />
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="no-print relative mt-24">
      {/* The hatched band is the page's last structural mark: content ends
          here, the colophon is below the cut. */}
      <div className="h-8 border-y border-line hatch" aria-hidden="true" />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-9 text-xs text-faint sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-lg">
          <div className="flex items-center gap-2">
            <CrucibleMark className="h-4 w-4 text-dim" />
            <span className="font-mono text-2xs uppercase tracking-widest2 text-dim">Crucible</span>
          </div>
          <p className="mt-3 leading-relaxed text-pretty">
            Crucible proves lineage, not honest training. It shows what model, what data, what
            configuration and what enclave — not that the provider ran the epochs it claimed.
          </p>
        </div>

        {/* The explorers named here are Galileo's, because Galileo is where
            Passport.sol is actually deployed. Pointing at the mainnet explorer
            would send anyone checking the contract to a page that has never
            heard of it. */}
        <div className="flex flex-col gap-2 font-mono md:items-end">
          <span className="label">Verify against</span>
          <a
            href="https://chainscan-galileo.0g.ai/address/0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline transition-colors hover:text-fg"
          >
            chainscan-galileo.0g.ai
          </a>
          <a
            href="https://storagescan-galileo.0g.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline transition-colors hover:text-fg"
          >
            storagescan-galileo.0g.ai
          </a>
          <span className="text-faint">Passport.sol on 0G Galileo · chain 16602</span>
        </div>
      </div>
    </footer>
  )
}
