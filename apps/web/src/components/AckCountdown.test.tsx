import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AckCountdown } from './AckCountdown'

const HOUR = 3600_000
const DELIVERED = '2026-08-14T12:00:00.000Z'
const at = (offsetHours: number) => Date.parse(DELIVERED) + offsetHours * HOUR

describe('<AckCountdown>', () => {
  it('shows the full window immediately after delivery', () => {
    render(<AckCountdown deliveredAt={DELIVERED} now={at(0)} />)
    expect(screen.getByTestId('ack-remaining')).toHaveTextContent('48h 00m 00s')
  })

  it('counts down as the window is consumed', () => {
    render(<AckCountdown deliveredAt={DELIVERED} now={at(0.5) + 3000} />)
    expect(screen.getByTestId('ack-remaining')).toHaveTextContent('47h 29m 57s')
  })

  it('renders the absolute deadline as well as the countdown', () => {
    render(<AckCountdown deliveredAt={DELIVERED} now={at(1)} />)
    expect(screen.getByText(/deadline 2026-08-16 12:00:00Z/)).toBeInTheDocument()
  })

  it('never shows a negative clock once the window has closed', () => {
    render(<AckCountdown deliveredAt={DELIVERED} now={at(60)} />)
    expect(screen.getByTestId('ack-remaining')).toHaveTextContent('0s')
    expect(screen.getByText(/window closed/i)).toBeInTheDocument()
  })

  it('states when Crucible will act, not only when the deadline falls', () => {
    // "We handle this for you, here's when" is the product's core promise.
    render(
      <AckCountdown
        deliveredAt={DELIVERED}
        acknowledgeScheduledFor={'2026-08-14T12:02:00.000Z'}
        now={at(0)}
      />,
    )

    expect(screen.getByTestId('ack-scheduled')).toHaveTextContent('in 2m 00s')
    expect(screen.getByText(/2026-08-14 12:02:00Z/)).toBeInTheDocument()
    expect(screen.getByText(/daemon armed/i)).toBeInTheDocument()
  })

  it('reports an attempt in flight once the scheduled time has passed', () => {
    render(
      <AckCountdown
        deliveredAt={DELIVERED}
        acknowledgeScheduledFor={'2026-08-14T12:02:00.000Z'}
        now={at(1)}
      />,
    )
    expect(screen.getByTestId('ack-scheduled')).toHaveTextContent(/attempt in flight/i)
  })

  it('switches to a settled presentation once acknowledged', () => {
    render(
      <AckCountdown
        deliveredAt={DELIVERED}
        acknowledgeScheduledFor={'2026-08-14T12:02:00.000Z'}
        acknowledgedAt={'2026-08-14T12:02:11.000Z'}
        now={at(3)}
      />,
    )

    expect(screen.getByTestId('ack-remaining')).toHaveTextContent('Acknowledged')
    expect(screen.getByText(/handled by crucible/i)).toBeInTheDocument()
    // No point warning about a penalty that can no longer be incurred.
    expect(screen.queryByText(/if nobody acknowledges/i)).not.toBeInTheDocument()
  })

  it('states the penalty in 0G, not as an abstract percentage', () => {
    render(
      <AckCountdown deliveredAt={DELIVERED} totalNeuron={'1000000000000000000'} now={at(1)} />,
    )
    expect(screen.getByText(/0\.3 0G/)).toBeInTheDocument()
    expect(screen.getByText(/if nobody acknowledges/i)).toBeInTheDocument()
  })

  it('names the escalation point so the backstop is visible too', () => {
    render(<AckCountdown deliveredAt={DELIVERED} now={at(1)} />)
    // 48h window minus the 6h margin.
    expect(screen.getByText(/escalation at 2026-08-16 06:00:00Z/)).toBeInTheDocument()
  })

  it('shrinks the remaining-time bar as the window is consumed', () => {
    const { rerender } = render(<AckCountdown deliveredAt={DELIVERED} now={at(0)} />)
    expect(screen.getByTestId('ack-bar')).toHaveStyle({ width: '100%' })

    rerender(<AckCountdown deliveredAt={DELIVERED} now={at(24)} />)
    expect(screen.getByTestId('ack-bar')).toHaveStyle({ width: '50%' })
  })
})
