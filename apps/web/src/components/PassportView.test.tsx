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

  it('prints the full anchored hash under the title, untruncated', () => {
    // On a certificate the complete hash *is* the content. Truncation belongs in
    // tables, where the value is a row key rather than the subject.
    render(<PassportView record={real} />)

    const printed = screen
      .getAllByTestId('hash-value')
      .filter((el) => el.textContent === real.mint.manifestRootHash)

    expect(printed.length).toBeGreaterThan(0)
  })

  it('carries a metadata quad: minted, block, network, token', () => {
    render(<PassportView record={real} />)

    for (const label of ['Minted', 'Block', 'Network', 'Token']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText('49,597,171').length).toBeGreaterThan(0)
    expect(screen.getByText('chain 16602')).toBeInTheDocument()
  })

  it('does not let a provider-reported Finished imply the model was retrieved', () => {
    // The provider's progress field reports on the provider's own work. Whether
    // the deliverable was acknowledged is a separate on-chain fact, and
    // conflating the two is the exact overstatement this page must not make.
    render(<PassportView record={real} />)

    expect(screen.getByText('Task state on 0G')).toBeInTheDocument()
    expect(screen.getAllByText(/deliverable never acknowledged/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Nobody here holds this model; it is gone/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Provider-reported and off-chain\./i),
    ).toBeInTheDocument()
  })

  it('reports the settlement: unacknowledged, empty secret, and the 30% that was taken', () => {
    render(<PassportView record={real} />)

    expect(screen.getByText(/model destroyed/i)).toBeInTheDocument()

    const acknowledged = screen.getByText('getDeliverables.acknowledged')
    expect(acknowledged.parentElement).toHaveTextContent('false')

    const secret = screen.getByText('encryptedSecret')
    expect(secret.parentElement).toHaveTextContent('0x')

    // 30% of 0.0118528 0G, read off the contract rather than inferred — and the
    // percentage is computed from the two amounts, not restated as a constant.
    expect(screen.getByText('0.00355584 0G')).toBeInTheDocument()
    expect(screen.getAllByText(/30\.0000% of the fee/i).length).toBeGreaterThan(0)
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

  it('does not render the unverified attestation as verified', () => {
    // verifyService() is never called, so the manifest carries
    // attestationVerified: false. The page must say so, in the field's own terms.
    render(<PassportView record={real} />)

    const field = screen.getByText('tee.attestationVerified')
    expect(field.closest('.grid')).toHaveTextContent('false')
    expect(screen.getByText(/verifyService\(\) is not called anywhere in this codebase/i))
      .toBeInTheDocument()
  })

  it('decodes the manifest into typed field rows', () => {
    // A coloured type cell beside the field name is what turns a column of
    // hashes into a legible record format.
    render(<PassportView record={real} />)

    expect(screen.getByText('dataset.rootHash')).toBeInTheDocument()
    expect(screen.getByText('task.provider')).toBeInTheDocument()
    expect(screen.getByText('adapter.rootHash — SENTINEL')).toBeInTheDocument()
    expect(screen.getAllByText('bytes32').length).toBeGreaterThan(3)
    expect(screen.getAllByText('address').length).toBeGreaterThan(1)
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

  it('gives every external link a safe rel', () => {
    const { container } = render(<PassportView record={real} />)

    const external = Array.from(container.querySelectorAll('a[target="_blank"]'))
    expect(external.length).toBeGreaterThan(0)
    for (const link of external) {
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
    }
  })
})

describe('<PassportView> — the verification hero', () => {
  it('passes through checking before it will say match', async () => {
    // The verdict is withheld until the panel has visibly done the work. A green
    // tick that was already there when the page painted teaches nothing.
    const { container } = render(<PassportView record={real} />)

    expect(container.querySelector('[data-state="checking"]')).not.toBeNull()
    expect(screen.getByText(/Recomputing the anchored hash…/i)).toBeInTheDocument()

    expect(
      await screen.findByText(/matches the value anchored on chainscan-galileo\.0g\.ai/i),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-state="match"]')).not.toBeNull()
  })

  it('stacks the anchored and recomputed hashes so the eye can compare them', async () => {
    render(<PassportView record={real} />)
    await screen.findByText(/matches the value anchored/i)

    const stacked = screen.getAllByTestId('aligned-hash')
    expect(stacked).toHaveLength(2)
    // Character-aligned means identical: same length, same value, same column.
    expect(stacked[0]!.textContent).toBe(real.mint.manifestRootHash)
    expect(stacked[1]!.textContent).toBe(real.mint.manifestRootHash)
  })

  it('presents verifyManifest’s true as a returned value, not as our claim', async () => {
    render(<PassportView record={real} />)
    await screen.findByText(/matches the value anchored/i)

    expect(screen.getByText('Returned by the contract')).toBeInTheDocument()
    expect(screen.getByTestId('verify-manifest-return')).toHaveTextContent('true')
    expect(
      screen.getByText(/a value read back, not\s+a claim made here/i),
    ).toBeInTheDocument()
  })

  it('carries the exact commands a stranger would run instead', async () => {
    render(<PassportView record={real} />)
    await screen.findByText(/matches the value anchored/i)

    expect(
      screen.getByText(
        'curl -s "https://indexer-storage-testnet-turbo.0g.ai/file?root=0xc757a7e66c1c5bf4d642e4fbf246b5c228e2ccbf070de2669b98e0e3b98e1140"',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('node tools/verify-manifest.mjs')).toBeInTheDocument()
  })

  it('says which document it hashed when that is not the manifest on the page', async () => {
    // Token #1 anchored a smaller record than today's v1 manifest. Hashing the
    // v1 shape would not reproduce the anchor, and glossing over that would make
    // the whole check theatre.
    render(<PassportView record={real} />)
    await screen.findByText(/matches the value anchored/i)

    expect(
      screen.getByText(/the smaller record this token was minted against, carried\s+verbatim/i),
    ).toBeInTheDocument()
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

  it('says plainly that there is nothing on chain to check against', async () => {
    const { container } = render(<PassportView record={demo} />)

    expect(
      await screen.findByText(/there is no on-chain anchor to compare it against/i),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-state="demo"]')).not.toBeNull()
    // No contract return value is offered for a record no contract has seen.
    expect(screen.queryByText('Returned by the contract')).not.toBeInTheDocument()
  })

  it('offers no curl for a document that was never stored', async () => {
    render(<PassportView record={demo} />)
    await screen.findByText(/there is no on-chain anchor to compare it against/i)

    expect(screen.queryByText(/^curl -s/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/no document on 0G Storage to fetch/i),
    ).toBeInTheDocument()
  })
})

describe('<PassportView> — a tampered record', () => {
  it('refuses the verdict when the document does not hash to the anchor', async () => {
    const tampered: PassportRecord = {
      ...real,
      mint: { ...real.mint, manifestRootHash: `0x${'1'.repeat(64)}` },
    }

    const { container } = render(<PassportView record={tampered} />)

    expect(
      await screen.findByText(/does not hash to the anchored value/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Do not trust this passport/i)).toBeInTheDocument()
    expect(container.querySelector('[data-state="mismatch"]')).not.toBeNull()
    // The contract's answer for this hash is false, and is shown as false.
    expect(screen.getByTestId('verify-manifest-return')).toHaveTextContent('false')
  })
})
