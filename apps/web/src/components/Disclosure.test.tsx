import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Disclosure, disclosureStorageKey } from './Disclosure'

function setup(props: Partial<Parameters<typeof Disclosure>[0]> = {}) {
  return render(
    <Disclosure
      id="decoded-manifest"
      title="Decoded manifest"
      verdict="16 fields, all consistent"
      {...props}
    >
      <p>keccak256 of the canonical document</p>
    </Disclosure>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  window.sessionStorage.clear()
})

describe('<Disclosure>', () => {
  it('is a native details/summary, so it works with JavaScript disabled', () => {
    const { container } = setup()

    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details!.querySelector('summary')).not.toBeNull()
    expect(details!.open).toBe(false)
  })

  it('keeps its content in the DOM while closed, so in-page search still finds it', () => {
    // The body is hidden by the browser, not unmounted by React. Unmounting it
    // would defeat both find-in-page and the no-JS fallback.
    setup()

    expect(screen.getByText('keccak256 of the canonical document')).toBeInTheDocument()
  })

  it('states what is inside and its verdict while closed', () => {
    // A closed section should still teach something. "Decoded manifest" alone
    // teaches nothing; the verdict is the part worth reading.
    const { container } = setup()

    const summary = container.querySelector('summary')!
    expect(summary.textContent).toContain('Decoded manifest')
    expect(summary.textContent).toContain('16 fields, all consistent')
  })

  it('says so on the summary when the section carries bad news', () => {
    const { container } = setup({
      title: 'Chain of custody',
      verdict: 'six links — the fifth is broken: no adapter was retrieved',
      tone: 'danger',
    })

    const summary = container.querySelector('summary')!
    expect(summary.textContent).toContain('no adapter was retrieved')
  })

  it('opens and closes on click', async () => {
    const user = userEvent.setup()
    const { container } = setup()

    const details = container.querySelector('details')!
    await user.click(container.querySelector('summary')!)

    await waitFor(() => expect(details.dataset.open).toBe('true'))
    expect(details.open).toBe(true)

    await user.click(container.querySelector('summary')!)
    await waitFor(() => expect(details.dataset.open).toBe('false'))
    // The element stays open until the body has finished animating shut.
    await waitFor(() => expect(details.open).toBe(false))
  })

  it('remembers its state per section id in sessionStorage', async () => {
    const user = userEvent.setup()
    const { container } = setup()

    await user.click(container.querySelector('summary')!)

    await waitFor(() =>
      expect(window.sessionStorage.getItem(disclosureStorageKey('decoded-manifest'))).toBe('open'),
    )
  })

  it('restores a remembered section, so a reader who follows a link keeps their place', async () => {
    window.sessionStorage.setItem(disclosureStorageKey('decoded-manifest'), 'open')

    const { container } = setup()

    await waitFor(() => expect(container.querySelector('details')!.open).toBe(true))
  })

  it('does not confuse two sections with different ids', async () => {
    const user = userEvent.setup()
    const { container } = setup({ id: 'raw-document' })

    await user.click(container.querySelector('summary')!)

    await waitFor(() =>
      expect(window.sessionStorage.getItem(disclosureStorageKey('raw-document'))).toBe('open'),
    )
    expect(window.sessionStorage.getItem(disclosureStorageKey('decoded-manifest'))).toBeNull()
  })

  it('survives a sessionStorage that throws rather than failing to render', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => setup()).not.toThrow()
    expect(screen.getByText('Decoded manifest')).toBeInTheDocument()

    spy.mockRestore()
  })

  it('resolves instantly under prefers-reduced-motion instead of moving slower', async () => {
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })

    const user = userEvent.setup()
    const { container } = setup({ id: 'reduced-motion-section', defaultOpen: true })
    const details = container.querySelector('details')!

    await user.click(container.querySelector('summary')!)

    // No shortened animation, no degraded version: the element is shut on the
    // next tick rather than after the 160ms collapse.
    await waitFor(() => expect(details.open).toBe(false), { timeout: 120 })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: original,
    })
  })

  it('opens by default when the section is meant to start open', async () => {
    const { container } = setup({ id: 'starts-open', defaultOpen: true })

    expect(container.querySelector('details')!.open).toBe(true)
  })
})
