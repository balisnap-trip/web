import { prisma } from '@/lib/db'
import { toBaliDateKey } from '@/lib/booking/bali-date'
import type {
  FinanceReportCompany,
  FinanceReportPayload,
  ReportPeriodOption,
  PayeeBookingLine,
  PayeeSummary,
  PeriodValue,
  ReportPeriodMode,
} from '@/lib/finance/report.types'

type FinanceSummary = {
  expense: number
  commissionIn: number
  commissionOut: number
}

type PayeeAccumulator = {
  id: number
  name: string
  waPhone: string | null
  lines: {
    monthly: Map<number, PayeeBookingLine>
    yearly: Map<number, PayeeBookingLine>
    total: Map<number, PayeeBookingLine>
  }
}

function createPeriodValue(): PeriodValue {
  return { monthly: 0, yearly: 0, total: 0 }
}

function createCompany(): FinanceReportCompany {
  return {
    bookingCount: createPeriodValue(),
    income: createPeriodValue(),
    expense: createPeriodValue(),
    commissionIn: createPeriodValue(),
    commissionOut: createPeriodValue(),
    revenue: createPeriodValue(),
  }
}

function formatMonthLabel(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  const d = new Date(Date.UTC(year, month - 1, 1))
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function toMonthOption(key: string): ReportPeriodOption {
  return { key, label: formatMonthLabel(key) }
}

function toYearOption(key: string): ReportPeriodOption {
  return { key, label: key }
}

function uniqueSortedDesc(values: string[]) {
  return [...new Set(values)].sort((a, b) => (a < b ? 1 : -1))
}

function pickSelectedKey(keys: string[], requestedKey: string | null | undefined, fallback: string) {
  if (requestedKey && keys.includes(requestedKey)) return requestedKey
  return keys[0] || fallback
}

function bookingPeriodInfo(tourDate: Date, currentMonthKey: string, currentYearKey: string) {
  const dateKey = toBaliDateKey(new Date(tourDate))
  const monthKey = dateKey.slice(0, 7)
  const yearKey = dateKey.slice(0, 4)
  const matches: ReportPeriodMode[] = ['total']
  if (yearKey === currentYearKey) matches.push('yearly')
  if (monthKey === currentMonthKey) matches.push('monthly')
  return matches
}

function computeFinanceSummary(items: { direction: string; isCommissionSnapshot: boolean; amount: unknown }[]): FinanceSummary {
  let expense = 0
  let commissionIn = 0
  let commissionOut = 0

  for (const item of items) {
    const amount = Number(item.amount) || 0
    if (amount <= 0) continue

    if (item.direction === 'EXPENSE' && !item.isCommissionSnapshot) {
      expense += amount
      continue
    }

    if (item.direction === 'INCOME' && item.isCommissionSnapshot) {
      commissionIn += amount
      continue
    }

    if (item.direction === 'EXPENSE' && item.isCommissionSnapshot) {
      commissionOut += amount
    }
  }

  return { expense, commissionIn, commissionOut }
}

function ensurePayee(
  map: Map<number, PayeeAccumulator>,
  id: number,
  name: string,
  waPhone: string | null
) {
  const existing = map.get(id)
  if (existing) {
    if (!existing.waPhone && waPhone) existing.waPhone = waPhone
    return existing
  }

  const created: PayeeAccumulator = {
    id,
    name,
    waPhone: waPhone || null,
    lines: {
      monthly: new Map<number, PayeeBookingLine>(),
      yearly: new Map<number, PayeeBookingLine>(),
      total: new Map<number, PayeeBookingLine>(),
    },
  }
  map.set(id, created)
  return created
}

function addPayeeAmount(
  map: Map<number, PayeeBookingLine>,
  booking: { id: number; bookingRef: string | null; tourName: string; tourDate: Date },
  amount: number
) {
  const existing = map.get(booking.id)
  if (existing) {
    existing.amount += amount
    return
  }

  map.set(booking.id, {
    bookingId: booking.id,
    bookingRef: booking.bookingRef ?? null,
    tourName: booking.tourName ?? '',
    tourDate: booking.tourDate.toISOString(),
    amount,
  })
}

function sortLines(lines: PayeeBookingLine[]) {
  return [...lines].sort((a, b) => {
    const byDate = +new Date(a.tourDate) - +new Date(b.tourDate)
    if (byDate !== 0) return byDate
    return a.bookingId - b.bookingId
  })
}

function linesTotal(lines: PayeeBookingLine[]) {
  return lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
}

function finalizePayees(accMap: Map<number, PayeeAccumulator>): PayeeSummary[] {
  const result: PayeeSummary[] = []

  for (const payee of accMap.values()) {
    const monthly = sortLines([...payee.lines.monthly.values()])
    const yearly = sortLines([...payee.lines.yearly.values()])
    const total = sortLines([...payee.lines.total.values()])

    result.push({
      id: payee.id,
      name: payee.name,
      waPhone: payee.waPhone,
      lines: { monthly, yearly, total },
      totals: {
        monthly: linesTotal(monthly),
        yearly: linesTotal(yearly),
        total: linesTotal(total),
      },
      bookingCounts: {
        monthly: monthly.length,
        yearly: yearly.length,
        total: total.length,
      },
    })
  }

  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}

export async function getFinanceReportPayload(options?: {
  monthKey?: string | null
  yearKey?: string | null
}): Promise<FinanceReportPayload> {
  const [bookings, payeeItems] = await Promise.all([
    prisma.booking.findMany({
      where: {
        status: 'DONE',
        finance: { isNot: null },
      },
      orderBy: { tourDate: 'desc' },
      select: {
        id: true,
        bookingRef: true,
        tourName: true,
        tourDate: true,
        totalPrice: true,
        currency: true,
        totalPriceIdr: true,
        finance: {
          select: {
            items: {
              select: {
                direction: true,
                isCommissionSnapshot: true,
                amount: true,
              },
            },
          },
        },
      },
    }),
    prisma.bookingFinanceItem.findMany({
      where: {
        direction: 'EXPENSE',
        OR: [{ partnerId: { not: null } }, { driverId: { not: null } }],
        bookingFinance: {
          booking: { status: 'DONE' },
        },
      },
      select: {
        amount: true,
        partnerId: true,
        driverId: true,
        partner: { select: { id: true, name: true, picWhatsapp: true } },
        driver: { select: { id: true, name: true, phone: true } },
        bookingFinance: {
          select: {
            booking: {
              select: {
                id: true,
                bookingRef: true,
                tourName: true,
                tourDate: true,
              },
            },
          },
        },
      },
    }),
  ])

  // Use latest booking period as fallback anchor so Monthly/Yearly are not empty
  // when current calendar period has no booking data yet.
  const anchorDate = bookings.length > 0 ? bookings[0].tourDate : new Date()
  const anchorKey = toBaliDateKey(new Date(anchorDate))
  const fallbackMonthKey = anchorKey.slice(0, 7)
  const fallbackYearKey = anchorKey.slice(0, 4)

  const monthKeys = uniqueSortedDesc(
    bookings.map((booking) => toBaliDateKey(new Date(booking.tourDate)).slice(0, 7))
  )
  const yearKeys = uniqueSortedDesc(
    bookings.map((booking) => toBaliDateKey(new Date(booking.tourDate)).slice(0, 4))
  )

  const currentMonthKey = pickSelectedKey(monthKeys, options?.monthKey, fallbackMonthKey)
  const currentYearKey = pickSelectedKey(yearKeys, options?.yearKey, fallbackYearKey)

  const company = createCompany()

  for (const booking of bookings) {
    const gross =
      Number(booking.totalPriceIdr) ||
      (booking.currency === 'IDR' ? Number(booking.totalPrice) || 0 : 0)
    const summary = computeFinanceSummary(booking.finance?.items || [])
    const revenue = gross + summary.commissionIn - summary.expense - summary.commissionOut
    const periods = bookingPeriodInfo(booking.tourDate, currentMonthKey, currentYearKey)

    for (const mode of periods) {
      company.bookingCount[mode] += 1
      company.income[mode] += gross
      company.expense[mode] += summary.expense
      company.commissionIn[mode] += summary.commissionIn
      company.commissionOut[mode] += summary.commissionOut
      company.revenue[mode] += revenue
    }
  }

  const partnerAccMap = new Map<number, PayeeAccumulator>()
  const driverAccMap = new Map<number, PayeeAccumulator>()

  for (const item of payeeItems) {
    const amount = Number(item.amount) || 0
    if (amount <= 0) continue

    const booking = item.bookingFinance.booking
    const periods = bookingPeriodInfo(booking.tourDate, currentMonthKey, currentYearKey)

    if (item.partnerId && item.partner) {
      const payee = ensurePayee(partnerAccMap, item.partner.id, item.partner.name, item.partner.picWhatsapp)
      for (const mode of periods) {
        addPayeeAmount(payee.lines[mode], booking, amount)
      }
    }

    if (item.driverId && item.driver) {
      const payee = ensurePayee(driverAccMap, item.driver.id, item.driver.name, item.driver.phone)
      for (const mode of periods) {
        addPayeeAmount(payee.lines[mode], booking, amount)
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    period: {
      monthly: {
        key: currentMonthKey,
        label: formatMonthLabel(currentMonthKey),
        options: (monthKeys.length > 0 ? monthKeys : [currentMonthKey]).map(toMonthOption),
      },
      yearly: {
        key: currentYearKey,
        label: currentYearKey,
        options: (yearKeys.length > 0 ? yearKeys : [currentYearKey]).map(toYearOption),
      },
    },
    company,
    partners: finalizePayees(partnerAccMap),
    drivers: finalizePayees(driverAccMap),
  }
}
