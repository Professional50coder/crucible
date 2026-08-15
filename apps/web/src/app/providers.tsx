'use client'

import { useMemo, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { RainbowKitProvider, darkTheme, getDefaultConfig } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

import { zgGalileo, zgMainnet } from '@/lib/chains'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? ''

/**
 * Wallet connection is optional throughout this app — a visitor with no wallet
 * must be able to read and verify every passport. So the config is built to
 * never fail: with a real WalletConnect project id we use RainbowKit's full
 * connector set, and without one we fall back to injected wallets only rather
 * than initialising WalletConnect with a placeholder id, which logs errors and
 * breaks the connect modal.
 */
function buildConfig() {
  if (projectId !== '') {
    return getDefaultConfig({
      appName: 'Crucible',
      projectId,
      chains: [zgMainnet, zgGalileo],
      ssr: true,
    })
  }

  return createConfig({
    chains: [zgMainnet, zgGalileo],
    connectors: [injected()],
    transports: {
      [zgMainnet.id]: http(zgMainnet.rpcUrls.default.http[0]),
      [zgGalileo.id]: http(zgGalileo.rpcUrls.default.http[0]),
    },
    ssr: true,
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const config = useMemo(buildConfig, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: '#c8f050',
            accentColorForeground: '#070809',
            borderRadius: 'small',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
