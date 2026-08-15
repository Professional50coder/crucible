import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StateMachine } from './StateMachine'
import { TASK_STATES } from '@/lib/task-states'

describe('<StateMachine>', () => {
  it('shows every state 0G reports, not just the ones reached', () => {
    render(<StateMachine state="Training" />)

    for (const state of TASK_STATES) {
      expect(screen.getByTestId(`state-step-${state}`)).toBeInTheDocument()
    }
  })

  it('marks earlier states complete, the current one active, and later ones pending', () => {
    render(<StateMachine state="Training" />)

    expect(screen.getByTestId('state-step-Init')).toHaveAttribute('data-phase', 'complete')
    expect(screen.getByTestId('state-step-SetUp')).toHaveAttribute('data-phase', 'complete')
    expect(screen.getByTestId('state-step-Training')).toHaveAttribute('data-phase', 'active')
    expect(screen.getByTestId('state-step-Delivered')).toHaveAttribute('data-phase', 'pending')
    expect(screen.getByTestId('state-step-Finished')).toHaveAttribute('data-phase', 'pending')
  })

  it('renders progress as a percentage and on the progressbar', () => {
    render(<StateMachine state="Delivered" />)

    expect(screen.getByTestId('progress-percent')).toHaveTextContent('75%')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })

  it('reaches 100% only at Finished', () => {
    const { rerender } = render(<StateMachine state="UserAcknowledged" />)
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('88%')

    rerender(<StateMachine state="Finished" />)
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('100%')
    expect(screen.getByTestId('state-step-Finished')).toHaveAttribute('data-phase', 'complete')
  })

  it('places a failure on the step where it happened and leaves earlier steps complete', () => {
    render(<StateMachine state="Failed" failedAt="Training" />)

    expect(screen.getByTestId('state-step-SetUp')).toHaveAttribute('data-phase', 'complete')
    expect(screen.getByTestId('state-step-Training')).toHaveAttribute('data-phase', 'failed')
    expect(screen.getByTestId('state-step-Delivered')).toHaveAttribute('data-phase', 'pending')
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('—')
  })

  it('renders history timestamps for states that have been entered', () => {
    render(
      <StateMachine
        state="Training"
        history={{
          Init: '2026-08-14T12:00:00.000Z',
          SettingUp: '2026-08-14T12:01:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('2026-08-14 12:00:00Z')).toBeInTheDocument()
    expect(screen.getByText('2026-08-14 12:01:00Z')).toBeInTheDocument()
  })

  it('explains what the active state is actually doing', () => {
    render(<StateMachine state="Delivering" />)
    const machine = screen.getByTestId('state-machine')
    expect(within(machine).getByText(/written to 0G Storage/i)).toBeInTheDocument()
  })

  it('says the provider is busy rather than showing a misleading state when queued', () => {
    render(<StateMachine state="Init" queued />)
    expect(screen.getByText(/queued — provider busy/i)).toBeInTheDocument()
  })
})
