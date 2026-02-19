'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function PrintToolbar({
  heading,
  subheading,
  backHref,
  waHref,
}: {
  heading: string
  subheading: string
  backHref: string
  waHref?: string | null
}) {
  return (
    <div className="no-print border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{heading}</div>
          <div className="truncate text-xs text-slate-500">{subheading}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => window.print()}>
            Print / Save PDF
          </Button>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open WhatsApp
            </a>
          ) : null}
          <Link
            href={backHref}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>
    </div>
  )
}

