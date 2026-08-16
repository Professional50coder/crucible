import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SORT,
  PassportTable,
  paramsToView,
  sortPassports,
  viewToParams,
} from '@/components/PassportCard'
import type { PassportSummary } from '@/lib/types'
import GalleryPage from './page'

/**
 * Three records that differ in every sortable dimension, so a wrong comparator
 * cannot accidentally produce the right order.
 *
 * Ground truth applies here too: this app has one network, Galileo testnet, and
 * exactly two of its records came from real runs. The fixtures below mirror that
 * rather than inventing a mainnet record to test against.
 */
const HOUR = 3_600_000

const chainOne: PassportSummary = {
  id: 'p-000001',
  name: 'sentiment-lost-01',
  summary: 'The run that lost its model.',
  network: 'testnet',
  model: 'Qwen2.5-0.5B-Instruct',
  createdAt: new Date(Date.now() - 48 * HOUR).toISOString(),
  exampleCount: 61,
  tokenCount: 772,
  totalNeuron: '11852800000000000',
  mintStatus: 'minted',
  tokenId: '1',
  attestationVerified: false,
  provenance: 'chain',
  adapterKind: 'sentinel',
}

const chainTwo: PassportSummary = {
  ...chainOne,
  id: 'p-000002',
  name: 'sentiment-retrieved-02',
  createdAt: new Date(Date.now() - 2 * HOUR).toISOString(),
  tokenId: '2',
  tokenCount: 772,
  totalNeuron: '11852800000000000',
  adapterKind: 'retrieved',
}

const demo: PassportSummary = {
  ...chainOne,
  id: 'p-4c1f9a',
  name: 'invented-support-tone',
  model: 'Llama-3.2-1B-Instruct',
  createdAt: new Date(Date.now() - 24 * HOUR).toISOString(),
  tokenCount: 412_000,
  totalNeuron: '90000000000000000',
  tokenId: '17',
  provenance: 'demo',
  adapterKind: 'retrieved',
}

const ALL = [chainOne, chainTwo, demo]

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    listPassports: vi.fn(async () => ALL),
    // The gallery pulls the full record for its feature panel. Nothing under
    // test needs it, and returning null exercises the path where it is absent.
    getPassport: vi.fn(async () => null),
  }
})

const names = () =>
  screen.getAllByTestId('passport-row').map((row) => row.querySelector('a')?.textContent)

beforeEach(() => {
  window.history.replaceState(null, '', '/gallery')
})

// ---------------------------------------------------------------------------
// The pure half: URL <-> view
// ---------------------------------------------------------------------------

describe('gallery URL state', () => {
  it('leaves the default view out of the URL entirely', () => {
    expect(
      viewToParams({ network: 'all', model: 'all', query: '', sort: DEFAULT_SORT }),
    ).toBe('')
  })

  it('round-trips a filtered and sorted view', () => {
    const view = {
      network: 'testnet' as const,
      model: 'Qwen2.5-0.5B-Instruct',
      query: 'sentiment',
      sort: { key: 'fee' as const, direction: 'asc' as const },
    }

    expect(paramsToView(viewToParams(view))).toEqual(view)
  })

  it('falls back to the default rather than filtering everything away on junk input', () => {
    // The query string is attacker-controlled input. A reader who follows a
    // mangled link should get the gallery, not an unexplained empty table.
    const view = paramsToView('?network=solana&sort=vibes&dir=sideways')
    expect(view.network).toBe('all')
    expect(view.sort).toEqual(DEFAULT_SORT)
  })
})

describe('sortPassports', () => {
  it('defaults to newest first', () => {
    expect(sortPassports(ALL, DEFAULT_SORT).map((p) => p.id)).toEqual([
      'p-000002',
      'p-4c1f9a',
      'p-000001',
    ])
  })

  it('orders fee with BigInt, not Number', () => {
    // 9e16 vs 1.18528e16 neuron. Number() on these loses precision exactly where
    // two records would need to be told apart.
    const ordered = sortPassports(ALL, { key: 'fee', direction: 'desc' })
    expect(ordered[0].id).toBe('p-4c1f9a')
  })

  it('breaks ties by id so a shared link reproduces the same list', () => {
    // chainOne and chainTwo carry identical token counts.
    const a = sortPassports(ALL, { key: 'tokens', direction: 'asc' }).map((p) => p.id)
    const b = sortPassports([...ALL].reverse(), { key: 'tokens', direction: 'asc' }).map(
      (p) => p.id,
    )
    expect(a).toEqual(b)
  })

  it('does not mutate the array it was given', () => {
    const source = [...ALL]
    sortPassports(source, { key: 'tokens', direction: 'asc' })
    expect(source.map((p) => p.id)).toEqual(ALL.map((p) => p.id))
  })
})

// ---------------------------------------------------------------------------
// The table's sort controls
// ---------------------------------------------------------------------------

describe('<PassportTable> — sorting', () => {
  it('marks the active column with aria-sort so it is not communicated by arrow alone', () => {
    render(
      <PassportTable
        passports={ALL}
        sort={{ key: 'tokens', direction: 'desc' }}
        onSortChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('sort-tokens')).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByTestId('sort-age')).toHaveAttribute('aria-sort', 'none')
  })

  it('flips direction on the active column and adopts desc on a new one', async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <PassportTable
        passports={ALL}
        sort={{ key: 'age', direction: 'desc' }}
        onSortChange={onSortChange}
      />,
    )

    await user.click(within(screen.getByTestId('sort-age')).getByRole('button'))
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'age', direction: 'asc' })

    rerender(
      <PassportTable
        passports={ALL}
        sort={{ key: 'age', direction: 'desc' }}
        onSortChange={onSortChange}
      />,
    )
    await user.click(within(screen.getByTestId('sort-fee')).getByRole('button'))
    // A new column opens largest-first — nobody clicks "Fee" to find the cheapest.
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'fee', direction: 'desc' })
  })

  it('renders inert headers rather than dead buttons when no handler is given', () => {
    render(<PassportTable passports={ALL} />)
    expect(screen.queryByTestId('sort-age')).toBeNull()
    expect(screen.getByRole('columnheader', { name: /age/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

describe('<GalleryPage> — filters, sort and the URL', () => {
  it('opens on the view a shared link describes', async () => {
    window.history.replaceState(null, '', '/gallery?q=sentiment&sort=tokens&dir=asc')

    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(2))

    // The demo record does not match "sentiment", and the two that do are in
    // ascending token order.
    expect(names()).toEqual(['sentiment-lost-01', 'sentiment-retrieved-02'])
  })

  it('writes the active filter and sort into the URL', async () => {
    const user = userEvent.setup()
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    await user.click(screen.getByRole('button', { name: /galileo/i }))
    await waitFor(() => expect(window.location.search).toContain('network=testnet'))

    await user.click(within(screen.getByTestId('sort-fee')).getByRole('button'))
    await waitFor(() => expect(window.location.search).toContain('sort=fee'))
  })

  it('keeps the existing filter behaviour working', async () => {
    const user = userEvent.setup()
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    await user.type(screen.getByRole('searchbox', { name: /search passports/i }), 'invented')
    await waitFor(() => expect(screen.getAllByTestId('passport-row')).toHaveLength(1))
    expect(names()).toEqual(['invented-support-tone'])
  })

  it('returns to a bare /gallery when the view is back to its default', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/gallery?network=testnet')

    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    // Scoped to the Network group: the Model group has an "All" of its own.
    const networkGroup = screen.getByRole('group', { name: /network/i })
    await user.click(within(networkGroup).getByRole('button', { name: /^all$/i }))
    await waitFor(() => expect(window.location.search).toBe(''))
  })
})

// ---------------------------------------------------------------------------
// GATE 3 — honesty checks
// ---------------------------------------------------------------------------

describe('<GalleryPage> — honesty', () => {
  it('never renders a demo record as on-chain, at any sort order', async () => {
    const user = userEvent.setup()
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    // Sorting is the operation most likely to shuffle a badge onto the wrong
    // row, so the claim is checked after reordering as well as before.
    for (const column of ['sort-tokens', 'sort-fee', 'sort-age']) {
      await user.click(within(screen.getByTestId(column)).getByRole('button'))

      const row = screen
        .getAllByTestId('passport-row')
        .find((r) => r.textContent?.includes('invented-support-tone'))!

      expect(row).toHaveAttribute('data-provenance', 'demo')
      expect(within(row).getByText(/^demo$/i)).toBeInTheDocument()
      expect(within(row).queryByText(/on chain/i)).toBeNull()
    }
  })

  it('never prints "mainnet" for a testnet record', async () => {
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    // Scoped to the records themselves. The network *filter* legitimately offers
    // a mainnet option; no row may claim to be one, and none of these are.
    for (const row of screen.getAllByTestId('passport-row')) {
      expect(row.textContent ?? '').not.toMatch(/mainnet/i)
    }
  })

  it('never renders a record as attested', async () => {
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    // Ground truth: attestationVerified is false on every real passport, and
    // verifyService() is not called anywhere in this codebase.
    expect(ALL.every((p) => p.attestationVerified === false)).toBe(true)
    for (const row of screen.getAllByTestId('passport-row')) {
      expect(row.textContent ?? '').not.toMatch(/attest/i)
    }
  })

  it('says a run has no adapter even after the list is reordered', async () => {
    const user = userEvent.setup()
    render(<GalleryPage />)
    await waitFor(() => expect(screen.getAllByTestId('passport-row').length).toBe(3))

    await user.click(within(screen.getByTestId('sort-age')).getByRole('button'))

    const lost = screen
      .getAllByTestId('passport-row')
      .find((r) => r.textContent?.includes('sentiment-lost-01'))!
    expect(within(lost).getByText(/no adapter/i)).toBeInTheDocument()
  })
})
