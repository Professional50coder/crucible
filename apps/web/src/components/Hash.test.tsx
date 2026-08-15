import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Hash, HashRow, TypedRow, TypedRows } from './Hash'

const HASH = '0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7'

describe('<Hash>', () => {
  it('renders the value middle-truncated', () => {
    render(<Hash value={HASH} />)
    expect(screen.getByTestId('hash-value')).toHaveTextContent('0xb4f76a88…2c75a7')
  })

  it('exposes the full value in the title, so nothing is lost', () => {
    render(<Hash value={HASH} title="dataset root hash" />)
    expect(screen.getByTestId('hash-value')).toHaveAttribute(
      'title',
      `dataset root hash: ${HASH}`,
    )
  })

  it('renders the whole value when asked', () => {
    render(<Hash value={HASH} full />)
    expect(screen.getByTestId('hash-value')).toHaveTextContent(HASH)
  })

  it('copies the full value, not the truncated one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    render(<Hash value={HASH} title="dataset root hash" />)
    await userEvent.click(screen.getByRole('button', { name: /copy dataset root hash/i }))

    expect(writeText).toHaveBeenCalledWith(HASH)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copied dataset root hash/i })).toBeInTheDocument(),
    )
  })

  it('renders a verification link when a target exists', () => {
    render(
      <Hash
        value={HASH}
        href="https://storagescan-galileo.0g.ai/api/txs?skip=0&limit=10&rootHash=0xabc"
        hrefLabel="storagescan-galileo.0g.ai"
        title="dataset root hash"
      />,
    )

    const link = screen.getByRole('link', {
      name: /verify dataset root hash on storagescan-galileo\.0g\.ai/i,
    })
    expect(link).toHaveAttribute('href', 'https://storagescan-galileo.0g.ai/api/txs?skip=0&limit=10&rootHash=0xabc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('omits the link entirely when there is nothing to verify against', () => {
    render(<Hash value={HASH} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not throw when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })

    render(<Hash value={HASH} />)
    await userEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(screen.getByTestId('hash-value')).toBeInTheDocument()
  })
})

describe('<HashRow>', () => {
  it('labels the value and renders its note', () => {
    render(
      <HashRow
        label="Dataset root hash"
        value={HASH}
        href="https://storagescan.0g.ai/submission/146937"
        hrefLabel="storagescan.0g.ai"
        note="Retrievable from 0G Storage by anyone."
      />,
    )

    expect(screen.getByText('Dataset root hash')).toBeInTheDocument()
    expect(screen.getByText('Retrievable from 0G Storage by anyone.')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://storagescan.0g.ai/submission/146937')
  })

  it('prints the whole value when the row is the subject rather than a key', () => {
    render(<HashRow label="Anchored" value={HASH} full />)
    expect(screen.getByTestId('hash-value')).toHaveTextContent(HASH)
  })
})

describe('<TypedRow>', () => {
  it('names the type and the field beside the value', () => {
    render(
      <TypedRows>
        <TypedRow type="bytes32" name="datasetRootHash" value={HASH} hash />
      </TypedRows>,
    )

    expect(screen.getByText('bytes32')).toBeInTheDocument()
    expect(screen.getByText('datasetRootHash')).toBeInTheDocument()
    // Full, not truncated: this row is the record, not an index of it.
    expect(screen.getByTestId('hash-value')).toHaveTextContent(HASH)
  })

  it('renders a plain value with no copy affordance it does not need', () => {
    render(<TypedRow type="bool" name="tee.acknowledged" value="false" tone="warn" />)

    expect(screen.getByText('bool')).toBeInTheDocument()
    expect(screen.getByText('false')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('says a value is unverifiable rather than linking nowhere', () => {
    render(<TypedRow type="bytes32" name="datasetRootHash" value={HASH} unverifiable hash />)

    expect(screen.getByText(/nothing to open at this hash/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens an external value safely when there is one to open', () => {
    render(
      <TypedRow
        type="string"
        name="base.tokenizer"
        value="Qwen/Qwen2.5-0.5B-Instruct"
        href="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct"
      />,
    )

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    expect(link).toHaveAttribute('target', '_blank')
  })
})
