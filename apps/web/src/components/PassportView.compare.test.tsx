import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getSiblingPassport } from '@/lib/api'
import { buildPassports } from '@/lib/mock/fixtures'
import { PassportView } from './PassportView'

const records = buildPassports(Date.parse('2026-08-20T00:00:00.000Z'))
const lost = records.find((r) => r.id === 'p-000001')!
const retrieved = records.find((r) => r.id === 'p-000002')!
const demo = records.find((r) => r.provenance === 'demo' && r.mint.status === 'minted')!

const COMPARE = /compare with the other run/i

describe('<PassportView> — the two real runs, reachable from each other', () => {
  it('offers the comparison when a sibling on-chain record exists', async () => {
    // Same code, same wallet, same task; the operating system was the only
    // variable. The switch is what makes that a demonstration rather than a
    // claim, so it has to be present on the page, not just implemented.
    render(<PassportView record={lost} compare={retrieved} />)

    const button = await screen.findByRole('button', { name: COMPARE })

    // The lost run's graph breaks; the retrieved one's does not. Flipping the
    // switch has to actually change which chain is drawn.
    expect(screen.getByText(/the chain breaks/i)).toBeInTheDocument()

    await userEvent.click(button)

    expect(screen.getByText(/eight nodes, one chain/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show this run/i })).toBeInTheDocument()
  })

  it('offers nothing to compare against when there is no sibling', () => {
    render(<PassportView record={retrieved} />)

    expect(screen.queryByRole('button', { name: COMPARE })).not.toBeInTheDocument()
  })
})

describe('getSiblingPassport', () => {
  it('pairs each on-chain passport with the other one', async () => {
    await expect(getSiblingPassport(lost)).resolves.toMatchObject({ id: 'p-000002' })
    await expect(getSiblingPassport(retrieved)).resolves.toMatchObject({ id: 'p-000001' })
  })

  it('gives a demo record no sibling to be compared against', async () => {
    // A demo record next to a real one, offered as a comparison, would suggest
    // the two carry the same weight. They do not.
    await expect(getSiblingPassport(demo)).resolves.toBeNull()
  })
})
