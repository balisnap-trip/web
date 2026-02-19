import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { PrintOnLoad } from '@/app/print/components/PrintOnLoad'
import { PrintToolbar } from '@/app/print/components/PrintToolbar'

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

  const offsetMs = BALI_UTC_OFFSET_HOURS * 60 * 60 * 1000
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - offsetMs
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - offsetMs
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

export default async function DriverInvoicePrintPage({
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
  const monthParam = asString(sp.month) || 'all'
  const monthKey = normalizeMonthKey(monthParam) ? monthParam : 'all'
  const monthRange = monthKey !== 'all' ? monthKeyToUtcRange(monthKey) : null
  const includePaid = (asString(sp.includePaid) || '0') === '1'
  const autoPrint = (asString(sp.autoPrint) || '1') === '1'

  const driverIdRaw = asString(sp.driverId)
  const driverId = driverIdRaw ? Number(driverIdRaw) : NaN
  if (!Number.isFinite(driverId) || driverId <= 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Invalid driver</h1>
      </div>
    )
  }

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { id: true, name: true, phone: true },
  })

  if (!driver) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Driver not found</h1>
      </div>
    )
  }

  const whereBooking: any = {}
  if (monthRange) whereBooking.tourDate = { gte: monthRange.start, lt: monthRange.end }

  const items = await prisma.bookingFinanceItem.findMany({
    where: {
      driverId,
      ...(includePaid ? {} : { paid: false }),
      bookingFinance: {
        validatedAt: { not: null },
        isLocked: true,
        booking: whereBooking,
      },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      bookingFinance: {
        include: {
          booking: {
            select: { id: true, bookingRef: true, tourName: true, tourDate: true },
          },
        },
      },
    },
  })

  const groups = new Map<
    number,
    {
      bookingId: number
      bookingRef: string | null
      tourName: string
      tourDate: string
      items: {
        id: number
        direction: 'EXPENSE' | 'INCOME' | string
        isCommission: boolean
        nameSnapshot: string
        categoryName: string | null
        amount: number
        paid: boolean
      }[]
      payTotal: number
      payPaid: number
      payDue: number
      collectTotal: number
      collectPaid: number
      collectDue: number
    }
  >()

  let payTotal = 0
  let payPaid = 0
  let payDue = 0
  let collectTotal = 0
  let collectPaid = 0
  let collectDue = 0

  for (const item of items) {
    const booking = item.bookingFinance.booking
    const amount = Number(item.amount) || 0
    if (amount <= 0) continue

    const isPay = item.direction === 'EXPENSE'
    const isCollect = item.direction === 'INCOME'
    if (isPay) {
      payTotal += amount
      if (item.paid) payPaid += amount
      else payDue += amount
    } else if (isCollect) {
      collectTotal += amount
      if (item.paid) collectPaid += amount
      else collectDue += amount
    }

    if (!groups.has(booking.id)) {
      groups.set(booking.id, {
        bookingId: booking.id,
        bookingRef: booking.bookingRef ?? null,
        tourName: booking.tourName ?? '',
        tourDate: booking.tourDate.toISOString(),
        items: [],
        payTotal: 0,
        payPaid: 0,
        payDue: 0,
        collectTotal: 0,
        collectPaid: 0,
        collectDue: 0,
      })
    }
    const g = groups.get(booking.id)!
    g.items.push({
      id: item.id,
      direction: item.direction,
      isCommission: Boolean(item.isCommissionSnapshot),
      nameSnapshot: item.nameSnapshot,
      categoryName: item.tourItemCategoryNameSnapshot ?? null,
      amount,
      paid: Boolean(item.paid),
    })

    if (isPay) {
      g.payTotal += amount
      if (item.paid) g.payPaid += amount
      else g.payDue += amount
    } else if (isCollect) {
      g.collectTotal += amount
      if (item.paid) g.collectPaid += amount
      else g.collectDue += amount
    }
  }

  const bookings = [...groups.values()].sort((a, b) => +new Date(a.tourDate) - +new Date(b.tourDate))
  for (const b of bookings) {
    // Stable ordering inside a booking: PAY first, then COLLECT.
    b.items.sort((a, z) => {
      const aRank = a.direction === 'EXPENSE' ? 0 : 1
      const zRank = z.direction === 'EXPENSE' ? 0 : 1
      if (aRank !== zRank) return aRank - zRank
      return a.nameSnapshot.localeCompare(z.nameSnapshot)
    })
  }

  const netTotal = payTotal - collectTotal
  const netDue = payDue - collectDue

  const monthLabel = monthKey === 'all' ? 'All months' : monthKey
  const heading = `Invoice Driver - ${monthLabel}`
  const waNumber = normalizeWhatsappNumber(driver.phone)

  const netLabel = (n: number) => (n >= 0 ? `Pay ${formatCurrency(n, 'IDR')}` : `Collect ${formatCurrency(Math.abs(n), 'IDR')}`)

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
        subheading={driver.name}
        backHref="/finance/report"
        waHref={waNumber ? `https://wa.me/${waNumber}` : null}
      />

      <div className="page mx-auto max-w-5xl p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Bali Snap Trip</div>
            <div className="mt-1 text-2xl font-semibold">{heading}</div>
            <div className="mt-1 text-sm text-slate-600">
              Period: <span className="font-semibold">{monthLabel}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="text-xs font-semibold text-slate-500">Driver</div>
            <div className="mt-1 font-semibold">{driver.name}</div>
            {driver.phone ? <div className="text-slate-600">WA: {driver.phone}</div> : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Company pays (to driver)</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(payTotal, 'IDR')}</div>
            {includePaid ? (
              <div className="mt-1 text-xs text-slate-600">
                Paid {formatCurrency(payPaid, 'IDR')} | Due {formatCurrency(payDue, 'IDR')}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Company collects (from driver)</div>
            <div className="mt-1 text-lg font-semibold">{formatCurrency(collectTotal, 'IDR')}</div>
            {includePaid ? (
              <div className="mt-1 text-xs text-slate-600">
                Collected {formatCurrency(collectPaid, 'IDR')} | Due {formatCurrency(collectDue, 'IDR')}
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold text-slate-500">Net</div>
            <div className="mt-1 text-lg font-semibold">{netLabel(netTotal)}</div>
            <div className="mt-1 text-xs text-slate-600">Net due: {netLabel(netDue)}</div>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {bookings.map((b) => (
            <div key={b.bookingId} className="rounded-2xl border border-slate-200">
              <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {b.bookingRef || `#${b.bookingId}`} <span className="text-slate-500">|</span> {b.tourName || '-'}
                  </div>
                  <div className="text-xs text-slate-600">{formatDate(b.tourDate)}</div>
                </div>
                <div className="text-sm font-semibold">
                  {netLabel(b.payTotal - b.collectTotal)}
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      {includePaid ? <th className="px-4 py-2 text-right">Status</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {b.items.map((it) => {
                      const typeLabel = it.direction === 'EXPENSE' ? 'PAY' : it.direction === 'INCOME' ? 'COLLECT' : it.direction
                      const typeTone = it.direction === 'EXPENSE' ? 'text-emerald-700' : 'text-rose-700'
                      const desc = it.isCommission ? `${it.nameSnapshot} (Commission)` : it.nameSnapshot
                      return (
                        <tr key={it.id}>
                          <td className={`px-4 py-2 font-semibold ${typeTone}`}>{typeLabel}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium">{desc}</div>
                            <div className="text-xs text-slate-600">{it.categoryName || '-'}</div>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">{formatCurrency(it.amount, 'IDR')}</td>
                          {includePaid ? (
                            <td className="px-4 py-2 text-right">
                              <span className={it.paid ? 'text-emerald-700' : 'text-amber-700'}>
                                {it.paid ? 'PAID' : 'DUE'}
                              </span>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                    {b.items.length === 0 ? (
                      <tr>
                        <td colSpan={includePaid ? 4 : 3} className="px-4 py-10 text-center text-sm text-slate-500">
                          No items.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {bookings.length === 0 ? (
            <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              No invoice lines for this period.
            </div>
          ) : null}
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Generated at {new Date().toLocaleString('en-GB')}
        </div>
      </div>
    </div>
  )
}

