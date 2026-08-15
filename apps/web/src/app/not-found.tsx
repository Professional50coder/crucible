import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <p className="label">404</p>
      <h1 className="mt-3 text-title font-medium text-fg">Nothing at this address</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-dim text-pretty">
        Passport pages live at <span className="font-mono text-fg">/passport/&lt;id&gt;</span> and
        runs at <span className="font-mono text-fg">/jobs/&lt;id&gt;</span>.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/gallery" className="btn-primary no-underline">
          Gallery
        </Link>
        <Link href="/" className="btn-ghost no-underline">
          Home
        </Link>
      </div>
    </div>
  )
}
