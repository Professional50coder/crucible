import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DatasetInput } from './DatasetInput'

describe('<DatasetInput>', () => {
  it('accepts the bundled sample and reports the detected format', async () => {
    const onChange = vi.fn()
    render(<DatasetInput onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /use the sample/i }))

    const analysis = await screen.findByTestId('dataset-analysis')
    expect(analysis).toHaveTextContent('chat-messages')
    expect(analysis).toHaveTextContent('30 examples')

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sample-support-tone.jsonl',
        analysis: expect.objectContaining({ valid: true, format: 'chat' }),
      }),
    )
  })

  it('surfaces every validation error inline, with line numbers and fixes', async () => {
    render(<DatasetInput onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /try a broken one/i }))
    await screen.findByTestId('dataset-analysis')

    // Unparseable line, blank line, unrecognised format, mixed formats.
    expect(screen.getByText(/Not valid JSON/i)).toBeInTheDocument()
    expect(screen.getByText(/Blank line inside the file/i)).toBeInTheDocument()
    expect(screen.getByText(/none of 0G’s three formats/i)).toBeInTheDocument()
    expect(screen.getByText(/mixes formats/i)).toBeInTheDocument()

    // Line references so the user can go and look.
    expect(screen.getByText('L3')).toBeInTheDocument()
    expect(screen.getByText('L4')).toBeInTheDocument()

    // A fix, not just a complaint.
    expect(screen.getByText(/one complete JSON object/i)).toBeInTheDocument()
  })

  it('reports a dataset below 0G’s minimum as invalid', async () => {
    const onChange = vi.fn()
    render(<DatasetInput onChange={onChange} />)

    await userEvent.click(screen.getByText(/or paste JSONL directly/i))
    const textarea = screen.getByLabelText(/dataset jsonl/i)

    const twoRecords = [
      '{"text":"one"}',
      '{"text":"two"}',
    ].join('\n')
    await userEvent.click(textarea)
    await userEvent.paste(twoRecords)

    await screen.findByTestId('dataset-analysis')
    expect(screen.getByText(/0G requires at least 10/i)).toBeInTheDocument()
    expect(screen.getByText(/Add 8 more/i)).toBeInTheDocument()

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ analysis: expect.objectContaining({ valid: false }) }),
      ),
    )
  })

  it('warns without blocking when a dataset is small but legal', async () => {
    render(<DatasetInput onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /use the sample/i }))
    await screen.findByTestId('dataset-analysis')

    expect(screen.getByText(/above 0G’s minimum/i)).toBeInTheDocument()
    // A warning, not an error: the run would still succeed.
    expect(screen.queryByText(/0G requires at least/i)).not.toBeInTheDocument()
  })

  it('reports nothing until a dataset is provided', () => {
    render(<DatasetInput onChange={vi.fn()} />)
    expect(screen.queryByTestId('dataset-analysis')).not.toBeInTheDocument()
  })

  it('names the three accepted formats up front', () => {
    render(<DatasetInput onChange={vi.fn()} />)
    expect(screen.getByText(/at least 10 examples/i)).toBeInTheDocument()
  })
})
