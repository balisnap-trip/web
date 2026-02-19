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

function getBookingPax(booking: { numberOfAdult: number | null; numberOfChild: number | null }) {
  const adult = Number(booking.numberOfAdult ?? 0)
  const child = Number(booking.numberOfChild ?? 0)
  const total = adult + child
  return Number.isFinite(total) && total > 0 ? total : 0
}

function sanitizeText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export default async function VendorInvoicePrintPage({
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
  const layout = (asString(sp.layout) || 'invoice').toLowerCase()
  const isSettlementLayout = layout === 'settlement'

  const partnerIdRaw = asString(sp.partnerId)
  const partnerId = partnerIdRaw ? Number(partnerIdRaw) : NaN
  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Invalid partner</h1>
      </div>
    )
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, picName: true, picWhatsapp: true },
  })

  if (!partner) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Partner not found</h1>
      </div>
    )
  }

  const whereBooking: { tourDate?: { gte: Date; lt: Date } } = {}
  if (monthRange) whereBooking.tourDate = { gte: monthRange.start, lt: monthRange.end }

  const items = await prisma.bookingFinanceItem.findMany({
    where: {
      partnerId,
      ...(isSettlementLayout ? {} : { direction: 'EXPENSE' }),
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
            select: {
              id: true,
              bookingRef: true,
              tourName: true,
              tourDate: true,
              mainContactName: true,
              numberOfAdult: true,
              numberOfChild: true,
            },
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
        guestName: string
        paxCount: number
        items: {
          id: number
          direction: string
          nameSnapshot: string
          categoryName: string | null
          unitQty: number
        unitPrice: number
        amount: number
          paid: boolean
        }[]
        paySubtotal: number
        payPaidSubtotal: number
        payDueSubtotal: number
        collectSubtotal: number
        collectPaidSubtotal: number
        collectDueSubtotal: number
        netSubtotal: number
        netDueSubtotal: number
      }
  >()

  let payTotal = 0
  let payPaid = 0
  let payDue = 0
  let collectTotal = 0
  let collectDue = 0

  for (const item of items) {
    const booking = item.bookingFinance.booking
    const amount = Number(item.amount) || 0
    if (amount <= 0) continue

    const isPay = item.direction === 'EXPENSE'
    const isCollect = item.direction === 'INCOME'
    if (!isPay && !isCollect) continue

    if (isPay) {
      payTotal += amount
      if (item.paid) payPaid += amount
      else payDue += amount
    } else if (isCollect) {
      collectTotal += amount
      if (!item.paid) collectDue += amount
    }

    if (!groups.has(booking.id)) {
      groups.set(booking.id, {
        bookingId: booking.id,
        bookingRef: booking.bookingRef ?? null,
        tourName: booking.tourName ?? '',
        tourDate: booking.tourDate.toISOString(),
        guestName: sanitizeText(booking.mainContactName) || '-',
        paxCount: getBookingPax(booking),
        items: [],
        paySubtotal: 0,
        payPaidSubtotal: 0,
        payDueSubtotal: 0,
        collectSubtotal: 0,
        collectPaidSubtotal: 0,
        collectDueSubtotal: 0,
        netSubtotal: 0,
        netDueSubtotal: 0,
      })
    }
    const g = groups.get(booking.id)!
    g.items.push({
      id: item.id,
      direction: item.direction,
      nameSnapshot: item.nameSnapshot,
      categoryName: item.tourItemCategoryNameSnapshot ?? null,
      unitQty: Number(item.unitQty) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      amount,
      paid: Boolean(item.paid),
    })

    if (isPay) {
      g.paySubtotal += amount
      if (item.paid) g.payPaidSubtotal += amount
      else g.payDueSubtotal += amount
    } else if (isCollect) {
      g.collectSubtotal += amount
      if (item.paid) g.collectPaidSubtotal += amount
      else g.collectDueSubtotal += amount
    }

    g.netSubtotal = g.paySubtotal - g.collectSubtotal
    g.netDueSubtotal = g.payDueSubtotal - g.collectDueSubtotal
  }

  const bookings = [...groups.values()].sort((a, b) => +new Date(a.tourDate) - +new Date(b.tourDate))
  const settlementRows = bookings.filter((b) =>
    Math.abs(includePaid ? b.netSubtotal : b.netDueSubtotal) > 0.0001
  )

  const monthLabel = monthKey === 'all' ? 'All months' : monthKey
  const heading = isSettlementLayout ? `Settlement Partner - ${monthLabel}` : `Invoice Vendor - ${monthLabel}`
  const waNumber = normalizeWhatsappNumber(partner.picWhatsapp)
  const settlementPayAmount = includePaid ? payTotal : payDue
  const settlementCollectAmount = includePaid ? collectTotal : collectDue
  const settlementNetAmount = settlementPayAmount - settlementCollectAmount

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
        subheading={partner.name}
        backHref={isSettlementLayout ? '/finance/settlements' : '/finance/report'}
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
            <div className="text-xs font-semibold text-slate-500">Vendor</div>
            <div className="mt-1 font-semibold">{partner.name}</div>
            {partner.picName ? <div className="text-slate-600">PIC: {partner.picName}</div> : null}
            {partner.picWhatsapp ? <div className="text-slate-600">WA: {partner.picWhatsapp}</div> : null}
          </div>
        </div>

        {isSettlementLayout ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">(Company Pay)</div>
                <div className="mt-1 text-lg font-semibold">{formatCurrency(settlementPayAmount, 'IDR')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">(Company Collect)</div>
                <div className="mt-1 text-lg font-semibold">{formatCurrency(settlementCollectAmount, 'IDR')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Net settlement</div>
                <div className="mt-1 text-lg font-semibold">
                  {settlementNetAmount >= 0
                    ? `Pay ${formatCurrency(settlementNetAmount, 'IDR')}`
                    : `Collect ${formatCurrency(Math.abs(settlementNetAmount), 'IDR')}`}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Total Bookings</div>
                <div className="mt-1 text-lg font-semibold">{settlementRows.length}</div>
              </div>
            </div>

            <div className="mt-8">
              <div className="text-sm font-semibold">Detail item:</div>
              <div className="mt-3 rounded-xl border border-slate-200 p-4">
                {settlementRows.map((row) => {
                  const amount = includePaid ? row.netSubtotal : row.netDueSubtotal
                  return (
                    <div key={row.bookingId} className="py-1 text-sm">
                      * {formatDate(row.tourDate)} | {row.guestName} | {row.paxCount} Pax | {formatCurrency(amount, 'IDR')}
                    </div>
                  )
                })}
                {settlementRows.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-500">No settlement lines for this period.</div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Total</div>
                <div className="mt-1 text-lg font-semibold">{formatCurrency(payTotal, 'IDR')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Paid</div>
                <div className="mt-1 text-lg font-semibold">{formatCurrency(payPaid, 'IDR')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold text-slate-500">Due</div>
                <div className="mt-1 text-lg font-semibold">{formatCurrency(payDue, 'IDR')}</div>
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
                      Subtotal: {formatCurrency(b.paySubtotal, 'IDR')}
                    </div>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-left">Item</th>
                          <th className="px-4 py-2 text-left">Category</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Unit</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          {includePaid ? <th className="px-4 py-2 text-right">Status</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {b.items.map((it) => (
                          <tr key={it.id}>
                            <td className="px-4 py-2">{it.nameSnapshot}</td>
                            <td className="px-4 py-2 text-slate-600">{it.categoryName || '-'}</td>
                            <td className="px-4 py-2 text-right">{it.unitQty}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(it.unitPrice, 'IDR')}</td>
                            <td className="px-4 py-2 text-right font-semibold">{formatCurrency(it.amount, 'IDR')}</td>
                            {includePaid ? (
                              <td className="px-4 py-2 text-right">
                                <span className={it.paid ? 'text-emerald-700' : 'text-amber-700'}>
                                  {it.paid ? 'PAID' : 'DUE'}
                                </span>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                        {b.items.length === 0 ? (
                          <tr>
                            <td colSpan={includePaid ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-500">
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
          </>
        )}

        <div className="mt-8 text-xs text-slate-500">
          Generated at {new Date().toLocaleString('en-GB')}
        </div>
      </div>
    </div>
  )
}
