import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { realPassport } from '@/lib/mock/fixtures'
import type { PassportRecord } from '@/lib/types'
import LineageGraph from './LineageGraph'

/** Passport #1 — the run that lost its model. Real, from the fixture. */
function passportOne(): PassportRecord {
  return realPassport()
}

/**
 * Passport #2 — the run that kept it. Same pipeline, one variable: a real
 * adapter root hash that was acknowledged on chain.
 */
function passportTwo(): PassportRecord {
  const record = structuredClone(realPassport()) as PassportRecord
  record.id = 'p-000002'
  record.manifest.task.id = '3e385c46-f5dc-4e93-b713-63ab7a987ae3'
  record.manifest.adapter = {
    rootHash: '0x40a5f256ff464106f6be38ef146614bd78d5ddfe07af16b156d3efcddb561b4d',
    sizeBytes: 93_642_469,
  }
  delete record.adapterOrigin
  delete record.caveat
  record.settlement = { acknowledged: true }
  record.mint.tokenId = '2'
  return record
}

function nodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll<SVGGElement>('[data-node]'))
}

describe('LineageGraph', () => {
  it('draws all eight nodes as buttons, in DOM order', () => {
    const { container } = render(<LineageGraph record={passportOne()} />)
    const drawn = nodes(container)

    expect(drawn).toHaveLength(8)
    expect(drawn.map((node) => node.getAttribute('data-node'))).toEqual([
      'base',
      'dataset',
      'config',
      'task',
      'adapter',
      'manifest',
      'anchor',
      'token',
    ])
    drawn.forEach((node) => {
      expect(node).toHaveAttribute('role', 'button')
      expect(node).toHaveAttribute('tabindex', '0')
    })
  })

  it('renders passport #1 with a lost adapter and passport #2 with a verified one', () => {
    const one = render(<LineageGraph record={passportOne()} />)
    expect(one.container.querySelector('[data-node="adapter"]')).toHaveAttribute(
      'data-state',
      'lost',
    )
    one.unmount()

    const two = render(<LineageGraph record={passportTwo()} />)
    expect(two.container.querySelector('[data-node="adapter"]')).toHaveAttribute(
      'data-state',
      'verified',
    )
  })

  it('keeps the task node provider-reported on both records', () => {
    const { container } = render(<LineageGraph record={passportTwo()} />)
    expect(container.querySelector('[data-node="task"]')).toHaveAttribute('data-state', 'provider')
  })

  it('severs the edge into the lost node, and only that one', () => {
    const { container } = render(<LineageGraph record={passportOne()} />)
    expect(container.querySelector('[data-edge="task-adapter"]')).toHaveAttribute(
      'data-state',
      'lost',
    )
    expect(container.querySelector('[data-edge="base-task"]')).not.toHaveAttribute(
      'data-state',
      'lost',
    )
  })

  it('opens a detail panel on click and closes it on a second click', () => {
    const { container } = render(<LineageGraph record={passportOne()} />)
    const adapter = container.querySelector('[data-node="adapter"]')!

    expect(screen.queryByText(/check it yourself/i)).not.toBeInTheDocument()

    fireEvent.click(adapter)
    expect(screen.getByText(/check it yourself/i)).toBeInTheDocument()
    expect(screen.getByText('adapter.rootHash — SENTINEL')).toBeInTheDocument()

    fireEvent.click(adapter)
    expect(screen.queryByText(/check it yourself/i)).not.toBeInTheDocument()
  })

  it('closes the detail panel on Escape', () => {
    const { container } = render(<LineageGraph record={passportOne()} />)
    const dataset = container.querySelector('[data-node="dataset"]')!

    fireEvent.click(dataset)
    expect(screen.getByText(/check it yourself/i)).toBeInTheDocument()

    fireEvent.keyDown(dataset, { key: 'Escape' })
    expect(screen.queryByText(/check it yourself/i)).not.toBeInTheDocument()
  })

  it('moves focus along the chain with the arrow keys', () => {
    const { container } = render(<LineageGraph record={passportOne()} />)
    const base = container.querySelector<SVGGElement>('[data-node="base"]')!
    act(() => base.focus())
    expect(document.activeElement).toBe(base)

    fireEvent.keyDown(base, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(container.querySelector('[data-node="dataset"]'))

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(base)
  })

  it('opens a node with Enter from the keyboard', () => {
    const { container } = render(<LineageGraph record={passportTwo()} />)
    const token = container.querySelector('[data-node="token"]')!

    fireEvent.keyDown(token, { key: 'Enter' })
    expect(screen.getByText(/check it yourself/i)).toBeInTheDocument()
  })

  it('offers a replayable trace control', () => {
    render(<LineageGraph record={passportOne()} />)
    const trace = screen.getByRole('button', { name: /trace this provenance/i })
    expect(trace).toBeInTheDocument()
    fireEvent.click(trace)
    expect(trace).toBeInTheDocument()
  })

  it('only offers compare mode when a second record is supplied', () => {
    const solo = render(<LineageGraph record={passportOne()} />)
    expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument()
    solo.unmount()

    const { container } = render(
      <LineageGraph record={passportOne()} compare={passportTwo()} />,
    )
    const toggle = screen.getByRole('button', { name: /compare/i })
    expect(container.querySelector('[data-node="adapter"]')).toHaveAttribute('data-state', 'lost')

    fireEvent.click(toggle)
    expect(container.querySelector('[data-node="adapter"]')).toHaveAttribute(
      'data-state',
      'verified',
    )
  })
})
