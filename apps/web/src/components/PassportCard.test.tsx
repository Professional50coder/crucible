import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PassportTable } from './PassportCard'
import type { PassportSummary } from '@/lib/types'

const base: PassportSummary = {
  id: 'p-0001',
  name: 'support-tone-v1',
  summary: 'A fixture.',
  network: 'testnet',
  model: 'Qwen2.5-0.5B-Instruct',
  createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  exampleCount: 61,
  tokenCount: 772,
  totalNeuron: '11852800000000000',
  mintStatus: 'minted',
  tokenId: '1',
  attestationVerified: false,
  provenance: 'chain',
  adapterKind: 'sentinel',
}

const demo: PassportSummary = {
  ...base,
  id: 'p-0002',
  name: 'invented-run',
  tokenId: '17',
  tokenCount: 412_000,
  exampleCount: 1_200,
  provenance: 'demo',
  adapterKind: 'retrieved',
}

const rowFor = (name: string) =>
  screen.getByText(name).closest('tr') as HTMLTableRowElement

describe('<PassportTable>', () => {
  it('gives provenance its own column rather than leaving it to colour', () => {
    render(<PassportTable passports={[base, demo]} />)

    expect(screen.getByRole('columnheader', { name: /provenance/i })).toBeInTheDocument()
    expect(within(rowFor('support-tone-v1')).getByText(/on chain/i)).toBeInTheDocument()
    expect(within(rowFor('invented-run')).getByText(/^demo$/i)).toBeInTheDocument()
  })

  it('marks each row with its provenance in the DOM, so the distinction survives styling', () => {
    render(<PassportTable passports={[base, demo]} />)

    const rows = screen.getAllByTestId('passport-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-provenance', 'chain')
    expect(rows[1]).toHaveAttribute('data-provenance', 'demo')
  })

  it('exposes exactly one link per row, so the keyboard gets one stop per record', () => {
    render(<PassportTable passports={[base, demo]} />)

    const row = rowFor('support-tone-v1')
    const links = within(row).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/passport/p-0001')
  })

  it('encodes ids before they reach a route', () => {
    render(<PassportTable passports={[{ ...base, id: 'p/../evil', name: 'hostile-id' }]} />)

    expect(within(rowFor('hostile-id')).getByRole('link')).toHaveAttribute(
      'href',
      '/passport/p%2F..%2Fevil',
    )
  })

  it('leads each row with the token number and shows relative age', () => {
    render(<PassportTable passports={[base]} />)

    const row = rowFor('support-tone-v1')
    expect(within(row).getByText('#1')).toBeInTheDocument()
    expect(within(row).getByText(/hours ago/i)).toBeInTheDocument()
  })

  it('says a run has no adapter rather than leaving the field blank', () => {
    render(<PassportTable passports={[base]} />)
    expect(within(rowFor('support-tone-v1')).getByText(/no adapter/i)).toBeInTheDocument()
  })

  it('renders numeric columns as tabular figures so they compare down the column', () => {
    render(<PassportTable passports={[base, demo]} />)

    const cell = within(rowFor('invented-run')).getByText('412,000')
    expect(cell.className).toContain('tabular-nums')
  })
})
