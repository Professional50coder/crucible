import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SampleNotice } from './SampleNotice'

describe('<SampleNotice>', () => {
  it('discloses sample data in plain words when shown', () => {
    render(<SampleNotice show />)
    const note = screen.getByTestId('sample-notice')
    expect(note).toHaveAttribute('role', 'note')
    expect(note).toHaveTextContent(/on chain/i)
    expect(note).toHaveTextContent(/demo/i)
  })

  it('renders nothing on a live deployment', () => {
    render(<SampleNotice show={false} />)
    expect(screen.queryByTestId('sample-notice')).toBeNull()
  })

  it('shows no engineering internals', () => {
    render(<SampleNotice show />)
    const text = screen.getByTestId('sample-notice').textContent ?? ''
    expect(text).not.toMatch(/mock|fixture|NEXT_PUBLIC|latency|\bms\b/i)
  })
})
