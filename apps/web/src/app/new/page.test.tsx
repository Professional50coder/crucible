import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { KNOWN_DEPLOYMENTS } from '@/lib/passport-contract'
import NewRunPage from './page'

// The launcher pushes to the job page on success; nothing here gets that far.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

function networkButton(label: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(label, 'i') })
}

describe('<NewRunPage> — the network the page starts on', () => {
  it('pre-selects testnet, the only network Passport.sol is deployed to', async () => {
    // The fixture this assertion rests on: mainnet has no deployment recorded,
    // so a page that opened on mainnet would be offering a run that cannot end
    // in a checkable passport.
    expect(KNOWN_DEPLOYMENTS.mainnet).toBe('')

    render(<NewRunPage />)

    await waitFor(() => expect(networkButton('0G Galileo')).toHaveAttribute('aria-pressed', 'true'))
    expect(networkButton('0G mainnet')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('no-deployment-note')).not.toBeInTheDocument()
  })

  it('says plainly, on mainnet, that there is no contract to anchor a passport in', async () => {
    render(<NewRunPage />)

    await userEvent.click(networkButton('0G mainnet'))

    const note = await screen.findByTestId('no-deployment-note')
    expect(note).toHaveTextContent(/Passport\.sol/)
    expect(note).toHaveTextContent(/cannot produce a passport anyone could check/i)
  })

  it('drops the note again once the reader goes back to the deployed network', async () => {
    // Derived from `isDeployed`, not written twice: the note tracks the
    // deployment record rather than being toggled by hand per network.
    expect(KNOWN_DEPLOYMENTS.testnet).not.toBe('')

    render(<NewRunPage />)

    await userEvent.click(networkButton('0G mainnet'))
    expect(await screen.findByTestId('no-deployment-note')).toBeInTheDocument()

    await userEvent.click(networkButton('0G Galileo'))
    await waitFor(() =>
      expect(screen.queryByTestId('no-deployment-note')).not.toBeInTheDocument(),
    )
  })
})
