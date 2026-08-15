import type { Metadata } from 'next'

import { SiteFooter, SiteHeader } from '@/components/SiteChrome'
import { ColumnGuides } from '@/components/ui'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Crucible — verifiable fine-tuning on 0G',
    template: '%s — Crucible',
  },
  description:
    'Fine-tune on the 0G Compute Network in one upload, and get a permanent, public, independently verifiable Model Passport for the result.',
  openGraph: {
    title: 'Crucible — verifiable fine-tuning on 0G',
    description:
      'Every fine-tune on 0G already emits a complete cryptographic lineage. Crucible keeps it.',
    type: 'website',
  },
  icons: {
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="%23070809"/><path d="M3.5 5.5h13l-1.6 7.2a3.5 3.5 0 0 1-3.4 2.8H8.5a3.5 3.5 0 0 1-3.4-2.8Z" fill="none" stroke="%23eceef0" stroke-width="1.3"/><path d="M10 1.6v2.4" stroke="%23c8f050" stroke-width="1.8" stroke-linecap="round"/></svg>',
          ),
        type: 'image/svg+xml',
      },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:border-phosphor focus:bg-ink focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:text-phosphor focus:no-underline"
          >
            Skip to content
          </a>

          <ColumnGuides />

          <div className="relative z-10 flex min-h-screen flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  )
}
