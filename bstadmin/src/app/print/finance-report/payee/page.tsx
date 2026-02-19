import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { getFinanceReportPayload } from '@/lib/finance/report'
import type { ReportPeriodMode } from '@/lib/finance/report.types'
import { PrintOnLoad } from '@/app/print/components/PrintOnLoad'
import { PrintToolbar } from '@/app/print/components/PrintToolbar'

type PayeeType = 'partner' | 'driver'

function asString(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function parsePayeeType(value: string | null): PayeeType {
  return value === 'driver' ? 'driver' : 'partner'
}

function parsePeriod(value: string | null): ReportPeriodMode {
  if (value === 'yearly') return 'yearly'
  if (value === 'total') return 'total'
  return 'monthly'
}

function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

export default async function FinanceReportPayeePrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  if (session.user.role === 'CUSTOMER') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Unauthorized</h1>
      </div>
    )
  }

  const sp = await searchParams
  const type = parsePayeeType(asString(sp.type))
  const period = parsePeriod(asString(sp.period))
  const monthKey = asString(sp.month)
  const yearKey = asString(sp.year)
  const autoPrint = (asString(sp.autoPrint) || '1') === '1'

  const idRaw = asString(sp.id)
  const payeeId = idRaw ? Number(idRaw) : NaN
  if (!Number.isFinite(payeeId) || payeeId <= 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Invalid payee ID</h1>
      </div>
    )
  }

  const report = await getFinanceReportPayload({ monthKey, yearKey })
  const payees = type === 'partner' ? report.partners : report.drivers
  const payee = payees.find((entry) => entry.id === payeeId)

  if (!payee) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Statement not found</h1>
      </div>
    )
  }

  const roleLabel = type === 'partner' ? 'Partner' : 'Driver'
  const periodLabel =
    period === 'monthly'
      ? report.period.monthly.label
      : period === 'yearly'
        ? report.period.yearly.label
        : 'All Time'
  const modeLabel =
    period === 'monthly'
      ? 'Monthly'
      : period === 'yearly'
        ? 'Yearly'
        : 'Total'

  const lines = payee.lines[period]
  const gross = payee.totals[period]
  const bookingCount = payee.bookingCounts[period]
  const waNumber = normalizeWhatsappNumber(payee.waPhone)

  const heading = `${roleLabel} Statement - ${modeLabel}`
  const subheading = `${payee.name} | ${periodLabel}`

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page { padding: 0 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

      <PrintOnLoad enabled={autoPrint} />
      <PrintToolbar
        heading={heading}
        subheading={subheading}
        backHref="/finance/report"
        waHref={waNumber ? `https://wa.me/${waNumber}` : null}
      />

      <div className="page mx-auto max-w-5xl p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Bali Snap Trip</div>
            <div className="mt-1 text-2xl font-semibold">{heading}</div>
            <div className="mt-1 text-sm text-slate-600">
              Period: <span className="font-semibold">{periodLabel}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="text-xs font-semibold text-slate-500">{roleLabel}</div>
            <div className="mt-1 font-semibold">{payee.name}</div>
            {payee.waPhone ? <div className="text-slate-600">WA: {payee.waPhone}</div> : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">{modeLabel} Gross</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(gross, 'IDR')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Booking Count</div>
            <div className="mt-1 text-lg font-semibold">{bookingCount}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-sm font-semibold">Detail per booking</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Booking</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((line) => (
                  <tr key={`${line.bookingId}-${line.tourDate}`}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(line.tourDate)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{line.bookingRef || `#${line.bookingId}`}</div>
                      <div className="text-xs text-slate-500">{line.tourName || '-'}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                      {formatCurrency(line.amount, 'IDR')}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-sm text-slate-500">
                      No booking lines for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Generated at {new Date(report.generatedAt).toLocaleString('en-GB')}
        </div>
      </div>
    </div>
  )
}
