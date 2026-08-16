import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { realPassport, realPassport2 } from '@/lib/mock/fixtures'
import type { PassportRecord } from '@/lib/types'
import { EvidenceTrail } from './EvidenceTrail'

/**
 * A fixture record, built from passport #1 and then made honest about being a
 * fixture: `provenance: 'demo'` with no settlement and no mint block. This is
 * the shape the seven invented records in the gallery have, and the trail must
 * never dress it as a log of real events.
 */
function demoRecord(): PassportRecord {
  const real = realPassport()
  return {
    ...real,
    id: 'p-demo01',
    provenance: 'demo',
    mint: { ...real.mint, txHash: '0x' + 'ab'.repeat(32) },
  }
}

const trail = () => screen.getByTestId('evidence-trail')

describe('<EvidenceTrail> — the record it renders', () => {
  it('puts a timestamp on every entry, because an entry without one is not evidence', () => {
    render(<EvidenceTrail record={realPassport()} />)

    const entries = within(trail()).getAllByTestId('trail-entry')
    expect(entries.length).toBeGreaterThan(0)

    for (const entry of entries) {
      const time = entry.querySelector('time')
      expect(time).not.toBeNull()
      // A `datetime` that does not parse is a timestamp nobody can machine-read.
      expect(Number.isNaN(new Date(time!.getAttribute('datetime')!).getTime())).toBe(false)
    }
  })

  it('shows the 48-hour window as arithmetic over the recorded delivery instant', () => {
    render(<EvidenceTrail record={realPassport()} />)

    const deadline = within(trail()).getByTestId('trail-deadline')
    expect(deadline).toHaveTextContent(/48-hour acknowledgement window/i)
    // Stated as delivery + 48h rather than as a bare date, so a reader can
    // redo the sum instead of trusting it.
    expect(deadline).toHaveTextContent(/\+ 48h/)
  })

  it('renders the acknowledgement transaction where the record carries one', () => {
    // Passport #2 states its acknowledge transaction in the settlement note.
    render(<EvidenceTrail record={realPassport2()} />)

    const tx = within(trail()).getByTestId('trail-tx')
    const link = within(tx).getByRole('link')
    expect(link.getAttribute('href')).toMatch(/0x0911a1326338fc260a237c3c27baf8a697ffa193f2/)
  })

  it('shows no acknowledgement transaction for a run that never acknowledged', () => {
    // Passport #1's deliverable was force-settled unacknowledged. There is no
    // such transaction, so there must be no link pretending otherwise.
    render(<EvidenceTrail record={realPassport()} />)
    expect(within(trail()).queryByTestId('trail-tx')).toBeNull()
  })
})

describe('<EvidenceTrail> — degrading honestly', () => {
  it('says nothing was recorded rather than drawing an empty box', () => {
    const bare = realPassport()
    const record: PassportRecord = {
      ...bare,
      deliveredAt: undefined,
      settlement: undefined,
      adapterOrigin: undefined,
      mint: { status: 'unminted', manifestRootHash: bare.mint.manifestRootHash },
    }

    render(<EvidenceTrail record={record} />)

    expect(within(trail()).queryByTestId('trail-entries')).toBeNull()
    expect(trail()).toHaveTextContent(/No state history was recorded for this run/i)
    // And explicitly refuses to invent one from the timestamps it does hold.
    expect(trail()).toHaveTextContent(/would be a guess dressed as a record/i)
  })

  it('omits the deadline marker when no delivery instant was ever recorded', () => {
    const record: PassportRecord = { ...realPassport(), deliveredAt: undefined }
    render(<EvidenceTrail record={record} />)

    // The window is arithmetic over `deliveredAt`. With no delivery instant
    // there is no sum to show, and a deadline shown without one would be made up.
    expect(within(trail()).queryByTestId('trail-deadline')).toBeNull()
  })

  it('prefers the orchestrator’s own transitions over anything derived', () => {
    render(
      <EvidenceTrail
        record={realPassport()}
        transitions={[
          { state: 'Delivered', at: '2026-08-14T11:18:56.000Z' },
          { state: 'Failed', at: '2026-08-16T11:18:56.000Z' },
        ]}
      />,
    )

    const entries = within(trail()).getAllByTestId('trail-entry')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('Delivered')
    expect(entries[1]).toHaveTextContent('Failed')
    // The gap between two recorded instants is stated, because "how long did
    // this sit at Delivered" is the question the trail exists to answer.
    expect(entries[1]).toHaveTextContent(/\+48h/)
  })
})

// ---------------------------------------------------------------------------
// GATE 3 — honesty checks
// ---------------------------------------------------------------------------

describe('<EvidenceTrail> — honesty', () => {
  it('never renders a demo record as on-chain', () => {
    render(<EvidenceTrail record={demoRecord()} />)

    expect(trail()).toHaveAttribute('data-provenance', 'demo')
    expect(within(trail()).getByTestId('trail-provenance')).toHaveTextContent(
      /demo — invented timestamps/i,
    )
    expect(within(trail()).getByTestId('trail-provenance')).not.toHaveTextContent(/on chain/i)
  })

  it('offers a demo record no outbound explorer link, because it would 404', () => {
    const record = demoRecord()
    // Give the fixture a settlement that names a transaction, so the only reason
    // no link appears is provenance rather than an absent value.
    record.settlement = {
      acknowledged: true,
      note: 'Acknowledge transaction 0x' + 'cd'.repeat(32) + '.',
    }

    render(<EvidenceTrail record={record} />)

    const tx = within(trail()).getByTestId('trail-tx')
    // The hash is still shown — it is what the fixture holds — but it is not a
    // link, so nobody is invited to check an invented value on a live explorer.
    expect(within(tx).queryByRole('link')).toBeNull()
  })

  it('makes clear that passport #1 lost its model rather than showing a clean run', () => {
    render(<EvidenceTrail record={realPassport()} />)

    const verdict = within(trail()).getByTestId('trail-verdict')
    expect(verdict).toHaveTextContent(/did not keep its model/i)
    expect(verdict).toHaveTextContent(/30% penalty/i)
    expect(verdict).toHaveTextContent(/sentinel rather than an artifact/i)

    // And the entry itself is the failure, not a neutral "settled".
    expect(trail()).toHaveTextContent(/Acknowledgement never completed — the model was lost/i)
    expect(trail()).not.toHaveTextContent(/Deliverable acknowledged on chain/i)
  })

  it('shows no verdict banner for the run that kept its model', () => {
    // The counter-case: the banner must be driven by the settlement, not printed
    // on every passport, or it stops meaning anything.
    render(<EvidenceTrail record={realPassport2()} />)
    expect(within(trail()).queryByTestId('trail-verdict')).toBeNull()
    expect(trail()).toHaveTextContent(/Deliverable acknowledged on chain/i)
  })

  it('never claims an attestation was verified', () => {
    for (const record of [realPassport(), realPassport2()]) {
      // Ground truth: tee.attestationVerified is false on every real passport.
      expect(record.manifest.tee.attestationVerified).toBe(false)

      const { unmount } = render(<EvidenceTrail record={record} />)
      expect(trail()).not.toHaveTextContent(/attested/i)
      expect(trail()).not.toHaveTextContent(/attestation verified/i)
      unmount()
    }
  })

  it('never prints "mainnet" for a testnet record', () => {
    for (const record of [realPassport(), realPassport2(), demoRecord()]) {
      // Ground truth: Galileo testnet only. Nothing in this app ran on mainnet.
      expect(record.manifest.network).toBe('testnet')

      const { unmount } = render(<EvidenceTrail record={record} />)
      expect(trail().textContent ?? '').not.toMatch(/mainnet/i)
      unmount()
    }
  })
})
