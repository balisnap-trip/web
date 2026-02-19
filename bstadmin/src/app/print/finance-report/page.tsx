import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { toBaliDateKey } from '@/lib/booking/bali-date'
import { PrintOnLoad } from '@/app/print/components/PrintOnLoad'
import { PrintToolbar } from '@/app/print/components/PrintToolbar'

type FinanceSummary = {
  expense: number
  income: number
  commissionIn: number
  commissionOut: number
  net: number
}

type BookingReport = {
  id: number
  bookingRef: string | null
  tourName: string
  tourDate: string
  driverName: string | null
  totalPriceUsd: number | null
  totalPriceIdr: number | null
  currency: string
  financeSummary: FinanceSummary
}

type MonthlyReport = {
  month: string
  bookingCount: number
  totalUsd: number
  totalIdr: number
  summary: FinanceSummary
}

type View = 'booking' | 'month'

type SortKey =
  | 'tourDate_desc'
  | 'tourDate_asc'
  | 'net_desc'
  | 'usd_desc'
  | 'idr_desc'

const SORT_KEYS: SortKey[] = [
  'tourDate_desc',
  'tourDate_asc',
  'net_desc',
  'usd_desc',
  'idr_desc',
]

const BALI_UTC_OFFSET_HOURS = 8

function asString(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

function normalizeMonthKey(input: string): string | null {
  const v = String(input ?? '').trim()
  if (!v || v === 'all') return null
  if (!/^\d{4}-\d{2}$/.test(v)) return null
  return v
}

function monthKeyToUtcRange(monthKey: string): { start: Date; end: Date } | null {
  const mk = normalizeMonthKey(monthKey)
  if (!mk) return null
  const [yearRaw, monthRaw] = mk.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null

  // tourDate is stored in UTC. Month filter is based on Bali month.
  const offsetMs = BALI_UTC_OFFSET_HOURS * 60 * 60 * 1000
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - offsetMs
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - offsetMs
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

const computeSummary = (items: { direction: string; isCommissionSnapshot: boolean; amount: any }[]): FinanceSummary => {
  const expense = items
    .filter((item) => item.direction === 'EXPENSE' && !item.isCommissionSnapshot)
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const income = items
    .filter((item) => item.direction === 'INCOME' && !item.isCommissionSnapshot)
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const commissionIn = items
    .filter((item) => item.direction === 'INCOME' && item.isCommissionSnapshot)
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const commissionOut = items
    .filter((item) => item.direction === 'EXPENSE' && item.isCommissionSnapshot)
    .reduce((sum, item) => sum + Number(item.amount), 0)
  const net = expense + commissionOut - income - commissionIn
  return { expense, income, commissionIn, commissionOut, net }
}

function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as readonly string[]).includes(v)
}

export default async function FinanceReportPrintPage({
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

  const viewRaw = (asString(sp.view) || 'booking').toLowerCase()
  const view: View = viewRaw === 'month' ? 'month' : 'booking'

  const monthParam = asString(sp.month) || 'all'
  const monthKey = normalizeMonthKey(monthParam) ? monthParam : 'all'
  const monthRange = monthKey !== 'all' ? monthKeyToUtcRange(monthKey) : null

  const query = (asString(sp.q) || '').trim().toLowerCase()

  const sortRaw = asString(sp.sort) || 'tourDate_desc'
  const sortKey: SortKey = isSortKey(sortRaw) ? sortRaw : 'tourDate_desc'

  const autoPrint = (asString(sp.autoPrint) || '1') === '1'

  const whereBooking: any = {
    status: 'DONE',
    finance: { isNot: null },
  }
  if (monthRange) {
    whereBooking.tourDate = { gte: monthRange.start, lt: monthRange.end }
  }

  const bookings = await prisma.booking.findMany({
    where: whereBooking,
    orderBy: { tourDate: 'desc' },
    include: {
      driver: { select: { name: true } },
      finance: { include: { items: true } },
    },
  })

  const bookingReports: BookingReport[] = bookings.map((booking) => {
    const items = booking.finance?.items || []
    const summary = computeSummary(items)

    // Keep parity with existing /api/finance/report behaviour.
    const derivedIncome = summary.net - summary.expense + summary.commissionIn

    return {
      id: booking.id,
      bookingRef: booking.bookingRef,
      tourName: booking.tourName,
      tourDate: booking.tourDate.toISOString(),
      driverName: booking.driver?.name || null,
      totalPriceUsd: booking.totalPriceUsd ? Number(booking.totalPriceUsd) : null,
      totalPriceIdr: booking.totalPriceIdr ? Number(booking.totalPriceIdr) : null,
      currency: booking.currency || 'USD',
      financeSummary: { ...summary, income: derivedIncome },
    }
  })

  let filtered = bookingReports
  if (query) {
    filtered = filtered.filter((b) => {
      const hay = [b.bookingRef || '', b.tourName || '', b.driverName || '', b.currency || '']
        .join(' ')
        .toLowerCase()
      return hay.includes(query)
    })
  }

  const sorted = [...filtered]
  sorted.sort((a, b) => {
    if (sortKey === 'tourDate_asc') return +new Date(a.tourDate) - +new Date(b.tourDate)
    if (sortKey === 'tourDate_desc') return +new Date(b.tourDate) - +new Date(a.tourDate)
    if (sortKey === 'net_desc') return (b.financeSummary.net || 0) - (a.financeSummary.net || 0)
    if (sortKey === 'usd_desc') return (b.totalPriceUsd || 0) - (a.totalPriceUsd || 0)
    if (sortKey === 'idr_desc') return (b.totalPriceIdr || 0) - (a.totalPriceIdr || 0)
    return 0
  })

  const totals = sorted.reduce(
    (acc, b) => {
      acc.count += 1
      acc.usd += b.totalPriceUsd || 0
      acc.idr += b.totalPriceIdr || 0
      acc.expense += b.financeSummary.expense || 0
      acc.income += b.financeSummary.income || 0
      acc.commissionIn += b.financeSummary.commissionIn || 0
      acc.commissionOut += b.financeSummary.commissionOut || 0
      acc.net += b.financeSummary.net || 0
      return acc
    },
    { count: 0, usd: 0, idr: 0, expense: 0, income: 0, commissionIn: 0, commissionOut: 0, net: 0 }
  )

  const dateRange = (() => {
    if (sorted.length === 0) return null
    const dates = sorted.map((b) => +new Date(b.tourDate))
    const min = new Date(Math.min(...dates))
    const max = new Date(Math.max(...dates))
    return { min, max }
  })()

  const monthlyMap = new Map<string, MonthlyReport>()
  for (const booking of bookingReports) {
    const mk = toBaliDateKey(new Date(booking.tourDate)).slice(0, 7)
    if (!monthlyMap.has(mk)) {
      monthlyMap.set(mk, {
        month: mk,
        bookingCount: 0,
        totalUsd: 0,
        totalIdr: 0,
        summary: { expense: 0, income: 0, commissionIn: 0, commissionOut: 0, net: 0 },
      })
    }
    const entry = monthlyMap.get(mk)!
    entry.bookingCount += 1
    entry.totalUsd += booking.totalPriceUsd || 0
    entry.totalIdr += booking.totalPriceIdr || 0
    entry.summary.expense += booking.financeSummary.expense || 0
    entry.summary.income += booking.financeSummary.income || 0
    entry.summary.commissionIn += booking.financeSummary.commissionIn || 0
    entry.summary.commissionOut += booking.financeSummary.commissionOut || 0
    entry.summary.net += booking.financeSummary.net || 0
  }

  let monthly = Array.from(monthlyMap.values()).sort((a, b) => (a.month < b.month ? 1 : -1))
  if (monthKey !== 'all') monthly = monthly.filter((m) => m.month === monthKey)

  const monthlyTotals = monthly.reduce(
    (acc, m) => {
      acc.bookingCount += m.bookingCount || 0
      acc.totalUsd += m.totalUsd || 0
      acc.totalIdr += m.totalIdr || 0
      acc.summary.expense += m.summary.expense || 0
      acc.summary.income += m.summary.income || 0
      acc.summary.commissionIn += m.summary.commissionIn || 0
      acc.summary.commissionOut += m.summary.commissionOut || 0
      acc.summary.net += m.summary.net || 0
      return acc
    },
    {
      bookingCount: 0,
      totalUsd: 0,
      totalIdr: 0,
      summary: { expense: 0, income: 0, commissionIn: 0, commissionOut: 0, net: 0 },
    }
  )

  const titleMonth = monthKey === 'all' ? 'All months' : monthKey
  const heading = view === 'booking' ? `Finance Report (Per Booking) - ${titleMonth}` : `Finance Report (Monthly) - ${titleMonth}`
  const subheading = query ? `Search: "${query}"` : dateRange ? `${formatDate(dateRange.min)} to ${formatDate(dateRange.max)}` : 'No bookings'

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
      <PrintToolbar heading={heading} subheading={subheading} backHref="/finance/report" />

      <div className="page mx-auto max-w-5xl p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Finance Report</h1>
          <div className="text-sm text-slate-600">
            Month: <span className="font-semibold">{titleMonth}</span>
            {query ? (
              <>
                {' '}
                | Search: <span className="font-semibold">&quot;{query}&quot;</span>
              </>
            ) : null}
          </div>
          <div className="text-xs text-slate-500">Net = Expense + Commission Out - Income - Commission In</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Bookings</div>
            <div className="mt-1 text-lg font-semibold">{totals.count}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Gross Total (USD)</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.usd, 'USD')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Gross Total (IDR)</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.idr, 'IDR')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Net Cost (IDR)</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.net, 'IDR')}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Expense</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.expense, 'IDR')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Income</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.income, 'IDR')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Commission Out</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.commissionOut, 'IDR')}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Commission In</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(totals.commissionIn, 'IDR')}</div>
          </div>
        </div>

        {view === 'booking' ? (
          <div className="mt-8">
            <div className="text-sm font-semibold">Per booking</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Booking</th>
                    <th className="px-3 py-2 text-left">Tour date</th>
                    <th className="px-3 py-2 text-left">Driver</th>
                    <th className="px-3 py-2 text-right">Gross (USD)</th>
                    <th className="px-3 py-2 text-right">Gross (IDR)</th>
                    <th className="px-3 py-2 text-right">Expense</th>
                    <th className="px-3 py-2 text-right">Income</th>
                    <th className="px-3 py-2 text-right">Comm out</th>
                    <th className="px-3 py-2 text-right">Comm in</th>
                    <th className="px-3 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sorted.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{b.bookingRef || `#${b.id}`}</div>
                        <div className="text-xs text-slate-500">{b.tourName || '-'}</div>
                      </td>
                      <td className="px-3 py-2">{formatDate(b.tourDate)}</td>
                      <td className="px-3 py-2">{b.driverName || '-'}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.totalPriceUsd || 0, 'USD')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.totalPriceIdr || 0, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.financeSummary.expense, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.financeSummary.income, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.financeSummary.commissionOut, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(b.financeSummary.commissionIn, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(b.financeSummary.net, 'IDR')}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-sm text-slate-500">
                        No bookings.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <div className="text-sm font-semibold">Per month</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Month</th>
                    <th className="px-3 py-2 text-right">Bookings</th>
                    <th className="px-3 py-2 text-right">USD</th>
                    <th className="px-3 py-2 text-right">IDR</th>
                    <th className="px-3 py-2 text-right">Expense</th>
                    <th className="px-3 py-2 text-right">Income</th>
                    <th className="px-3 py-2 text-right">Comm out</th>
                    <th className="px-3 py-2 text-right">Comm in</th>
                    <th className="px-3 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {monthly.map((m) => (
                    <tr key={m.month}>
                      <td className="px-3 py-2 font-medium">{m.month}</td>
                      <td className="px-3 py-2 text-right">{m.bookingCount}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.totalUsd, 'USD')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.totalIdr, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.summary.expense, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.summary.income, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.summary.commissionOut, 'IDR')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.summary.commissionIn, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(m.summary.net, 'IDR')}</td>
                    </tr>
                  ))}
                  {monthly.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                        No monthly data.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {monthly.length > 0 ? (
                  <tfoot className="bg-slate-50">
                    <tr className="border-t border-slate-200">
                      <td className="px-3 py-2 font-semibold">Total</td>
                      <td className="px-3 py-2 text-right font-semibold">{monthlyTotals.bookingCount}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.totalUsd, 'USD')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.totalIdr, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.summary.expense, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.summary.income, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.summary.commissionOut, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.summary.commissionIn, 'IDR')}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(monthlyTotals.summary.net, 'IDR')}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        )}

        <div className="mt-6 text-xs text-slate-500">Generated at {new Date().toLocaleString('en-GB')}</div>
      </div>
    </div>
  )
}
