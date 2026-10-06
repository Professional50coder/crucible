import { MOCK_MODE } from '@/lib/api'

/**
 * A plain statement, visible at every screen width, that part of what a visitor
 * is looking at is sample data.
 *
 * The header chip that says "mock data" is hidden below the `lg` breakpoint and
 * only explains itself on hover, so most visitors — on a phone, or following a
 * shared link — never saw it. This is the same disclosure in words a reader needs
 * rather than words an engineer uses, and it points at the one thing they can
 * check: the badge on each record.
 *
 * Rendered only when the app has no live backend. A connected deployment shows
 * nothing here, because nothing needs disclosing.
 */
export function SampleNotice({ show = MOCK_MODE }: { show?: boolean }) {
  if (!show) return null

  return (
    <div
      role="note"
      data-testid="sample-notice"
      className="no-print border-b border-warn/25 bg-warn/[0.04] px-4 py-2 text-center text-xs leading-relaxed text-warn/90 sm:px-6"
    >
      You are exploring Crucible without a live connection. Records badged{' '}
      <span className="font-mono uppercase tracking-widest2">on chain</span> are real and can be
      verified on the 0G explorer; records badged{' '}
      <span className="font-mono uppercase tracking-widest2">demo</span> are examples.
    </div>
  )
}
