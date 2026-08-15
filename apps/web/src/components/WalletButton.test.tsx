import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The header's network indicator, tested for what it must *not* say.
 *
 * A visitor who has not connected a wallet is not in an error state — no wallet
 * is needed to read a passport — and the previous version told them, in the
 * highest-contrast element on the page, that the network was wrong. These tests
 * pin the graded behaviour so it cannot regress back into shouting.
 *
 * RainbowKit's `ConnectButton.Custom` is a render-prop that needs a full wagmi
 * provider tree, so it is faked here: the component under test is our branching,
 * not RainbowKit's.
 */

type RenderState = {
  account?: { address: string } | null
  chain?: { id: number; unsupported?: boolean } | null
  mounted?: boolean
}

let state: RenderState = { account: null, chain: null, mounted: true }

vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (args: Record<string, unknown>) => JSX.Element }) =>
      children({
        account: state.account ?? undefined,
        chain: state.chain ?? undefined,
        mounted: state.mounted ?? true,
        openAccountModal: vi.fn(),
        openChainModal: vi.fn(),
        openConnectModal: vi.fn(),
      }),
  },
}))

const { WalletButton } = await import('./WalletButton')

beforeEach(() => {
  state = { account: null, chain: null, mounted: true }
})

describe('<WalletButton>', () => {
  it('shows a quiet 0G Galileo chip when nothing is connected, and no alarm', async () => {
    render(<WalletButton />)

    const chip = await screen.findByTestId('network-chip')
    expect(chip).toHaveTextContent(/0G Galileo/i)
    // The condition is "not connected", which is not an error and must not be
    // dressed as one.
    expect(screen.queryByText(/wrong network/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('wrong-chain')).not.toBeInTheDocument()
    expect(chip.className).not.toContain('danger')
  })

  it('still offers Connect, because launching a run does need a wallet', async () => {
    render(<WalletButton />)
    expect(await screen.findByRole('button', { name: /connect/i })).toBeInTheDocument()
  })

  it('warns in amber, with a switch action, only once a wrong chain is actually connected', async () => {
    state = { account: { address: '0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF' }, chain: { id: 1, unsupported: true } }
    render(<WalletButton />)

    const button = await screen.findByTestId('wrong-chain')
    expect(button).toHaveTextContent(/switch to 0G/i)
    // Amber, not red: nothing is lost and a clock is not running.
    expect(button.className).toContain('warn')
    expect(button.className).not.toContain('danger')
  })

  it('shows the chain and a truncated address once connected correctly', async () => {
    state = {
      account: { address: '0xf4cEE5c1C4A1Bfe5AFD4bE3B223d85b1181FD3EF' },
      chain: { id: 16602, unsupported: false },
    }
    render(<WalletButton />)

    expect(await screen.findByText(/0xf4cE…D3EF/)).toBeInTheDocument()
    expect(screen.queryByTestId('wrong-chain')).not.toBeInTheDocument()
  })
})
