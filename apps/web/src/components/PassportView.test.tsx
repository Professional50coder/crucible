import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildPassports } from '@/lib/mock/fixtures'
import type { PassportRecord } from '@/lib/types'
import { PassportView } from './PassportView'

const records = buildPassports(Date.parse('2026-08-20T00:00:00.000Z'))
const real = records.find((r) => r.provenance === 'chain')!
const demo = records.find((r) => r.provenance === 'demo' && r.mint.status === 'minted')!

describe('<PassportView> — the record that is real', () => {
  it('states which chain it is live on, and its token number', () => {
    render(<PassportView record={real} />)

    expect(screen.getByText(/live on 0G Galileo · token #1/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Token number 1')).toHaveTextContent('#1')
  })

  it('reproduces the anchored hash in the browser and says the check passed', () => {
    // The one verification a reader can perform without leaving the page. It has
    // to be a real computation over the document that was actually hashed, or
    // the seal is decoration.
    const { container } = render(<PassportView record={real} />)

    expect(
      screen.getByText(/matches the value anchored on chainscan-galileo\.0g\.ai/i),
    ).toBeInTheDocument()
    // The full value is carried in `title`, since the visible form is truncated.
    expect(
      container.querySelector(`[title*="${real.mint.manifestRootHash}"]`),
    ).not.toBeNull()
  })

  it('does not let a provider-reported Finished imply the model was retrieved', () => {
    // The provider's progress field reports on the provider's own work. Whether
    // the deliverable was acknowledged is a separate on-chain fact, and
    // conflating the two is the exact overstatement this page must not make.
    render(<PassportView record={real} />)

    expect(screen.getByText('Task state on 0G')).toBeInTheDocument()
    expect(screen.getAllByText(/deliverable never acknowledged/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Nobody here holds this model; it is gone/i)).toBeInTheDocument()
  })

  it('reports the settlement: unacknowledged, and the 30% that was taken', () => {
    render(<PassportView record={real} />)

    expect(screen.getByText(/model destroyed/i)).toBeInTheDocument()

    const acknowledged = screen.getByText('getDeliverables.acknowledged')
    expect(acknowledged.parentElement).toHaveTextContent('false')

    // 30% of 0.0118528 0G, read off the contract rather than inferred.
    expect(screen.getByText('0.00355584 0G')).toBeInTheDocument()
  })

  it('shows the adapter field as a sentinel, and proves it is one', () => {
    render(<PassportView record={real} />)

    expect(screen.getByText(/this is not an adapter root hash/i)).toBeInTheDocument()
    expect(
      screen.getByText(/0G destroyed the artifact and deducted 30% of the fee/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/reproduces the value anchored on chain, so the field provably holds a sentinel/i),
    ).toBeInTheDocument()
    // The preimage is published, so the reader can redo the hash themselves.
    expect(screen.getAllByText(/crucible:adapter-not-retrieved:/).length).toBeGreaterThan(0)
  })

  it('links its hashes at the explorers that verify them', () => {
    const { container } = render(<PassportView record={real} />)

    expect(
      container.querySelector(`a[href*="${real.mint.txHash}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`a[href*="${real.manifest.dataset.rootHash}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector('a[href*="0x27087B5bD124f2a570eb22B6B5bbe05F5d83C1c7"]'),
    ).not.toBeNull()
  })

  it('does not offer a 0G Storage link for an adapter that was never stored', () => {
    const { container } = render(<PassportView record={real} />)

    expect(
      container.querySelector(`a[href*="${real.manifest.adapter.rootHash}"]`),
    ).toBeNull()
  })
})

describe('<PassportView> — a demo record', () => {
  it('labels itself as one, at the top', () => {
    render(<PassportView record={demo} />)

    expect(screen.getAllByText(/demo record/i).length).toBeGreaterThan(0)
  })

  it('refuses to link an invented hash to a live explorer', () => {
    // A link that 404s teaches the reader that every link on the page is
    // decorative, which costs more than the missing link is worth.
    const { container } = render(<PassportView record={demo} />)

    expect(container.querySelector('a[href*="storagescan"]')).toBeNull()
    expect(container.querySelector(`a[href*="${demo.mint.txHash}"]`)).toBeNull()
    expect(container.querySelector(`a[href*="${demo.manifest.dataset.rootHash}"]`)).toBeNull()
  })

  it('still links the values that are genuine on every record', () => {
    // The provider address and the TEE signer are live 0G addresses regardless of
    // where the rest of the record came from, so they stay checkable.
    const { container } = render(<PassportView record={demo} />)

    expect(
      container.querySelector(`a[href*="${demo.manifest.task.provider}"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`a[href*="${demo.manifest.tee.signerAddress}"]`),
    ).not.toBeNull()
  })

  it('says plainly that there is nothing on chain to check against', () => {
    render(<PassportView record={demo} />)

    expect(screen.getByText(/there is no on-chain anchor to compare it against/i)).toBeInTheDocument()
  })
})

describe('<PassportView> — a tampered record', () => {
  it('refuses the seal when the document does not hash to the anchor', () => {
    const tampered: PassportRecord = {
      ...real,
      mint: { ...real.mint, manifestRootHash: `0x${'1'.repeat(64)}` },
    }

    render(<PassportView record={tampered} />)

    expect(screen.getByText(/does not hash to the anchored value/i)).toBeInTheDocument()
    expect(screen.getByText(/Do not trust this passport/i)).toBeInTheDocument()
  })
})
