import { prisma } from '@/lib/db'
import type {
  DriverInvoiceBookingSummary,
  DriverInvoiceSummary,
  DriverInvoiceTotals,
  InvoiceStatementsPayload,
  InvoiceTotalsBasic,
  VendorInvoiceBookingSummary,
  VendorInvoiceSummary,
} from '@/lib/finance/invoice-statements.types'

const BALI_UTC_OFFSET_HOURS = 8

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

function initBasicTotals(): InvoiceTotalsBasic {
  return { itemCount: 0, bookingCount: 0, total: 0, paid: 0, due: 0 }
}

function initDriverTotals(): DriverInvoiceTotals {
  return {
    itemCount: 0,
    bookingCount: 0,
    payTotal: 0,
    payPaid: 0,
    payDue: 0,
    collectTotal: 0,
    collectPaid: 0,
    collectDue: 0,
    netTotal: 0,
    netDue: 0,
  }
}

export async function getInvoiceStatements(options: {
  month?: string | null
  includePaid?: boolean
}): Promise<InvoiceStatementsPayload> {
  const monthRaw = options.month ?? null
  const monthKey = normalizeMonthKey(monthRaw ?? '') || 'all'
  const monthRange = monthKey !== 'all' ? monthKeyToUtcRange(monthKey) : null
  const includePaid = Boolean(options.includePaid)

  const whereBooking: any = {}
  if (monthRange) {
    whereBooking.tourDate = { gte: monthRange.start, lt: monthRange.end }
  }

  const items = await prisma.bookingFinanceItem.findMany({
    where: {
      ...(includePaid ? {} : { paid: false }),
      OR: [{ driverId: { not: null } }, { partnerId: { not: null } }],
      bookingFinance: {
        validatedAt: { not: null },
        isLocked: true,
        booking: whereBooking,
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      bookingFinance: {
        include: {
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
      driver: { select: { id: true, name: true, phone: true } },
      partner: { select: { id: true, name: true, picName: true, picWhatsapp: true } },
    },
  })

  const vendorMap = new Map<number, VendorInvoiceSummary>()
  const vendorBookingMap = new Map<number, Map<number, VendorInvoiceBookingSummary>>()

  const driverMap = new Map<number, DriverInvoiceSummary>()
  const driverBookingMap = new Map<number, Map<number, DriverInvoiceBookingSummary>>()

  for (const item of items) {
    const booking = item.bookingFinance.booking
    const amount = Number(item.amount) || 0
    if (amount <= 0) continue

    // Vendor invoice lines: partner expenses only.
    if (item.partnerId && item.direction === 'EXPENSE') {
      const partner = item.partner
      if (!partner) continue
      if (!vendorMap.has(partner.id)) {
        vendorMap.set(partner.id, {
          partnerId: partner.id,
          partnerName: partner.name,
          picName: partner.picName ?? null,
          picWhatsapp: partner.picWhatsapp ?? null,
          totals: initBasicTotals(),
          bookings: [],
        })
        vendorBookingMap.set(partner.id, new Map())
      }

      const group = vendorMap.get(partner.id)!
      const bMap = vendorBookingMap.get(partner.id)!

      group.totals.itemCount += 1
      group.totals.total += amount
      if (item.paid) group.totals.paid += amount
      else group.totals.due += amount

      if (!bMap.has(booking.id)) {
        bMap.set(booking.id, {
          bookingId: booking.id,
          bookingRef: booking.bookingRef ?? null,
          tourName: booking.tourName ?? '',
          tourDate: booking.tourDate.toISOString(),
          total: 0,
          paid: 0,
          due: 0,
        })
      }
      const b = bMap.get(booking.id)!
      b.total += amount
      if (item.paid) b.paid += amount
      else b.due += amount
    }

    // Driver invoice lines: both expenses and incomes for this driver.
    if (item.driverId) {
      const driver = item.driver
      if (!driver) continue

      if (!driverMap.has(driver.id)) {
        driverMap.set(driver.id, {
          driverId: driver.id,
          driverName: driver.name,
          driverPhone: driver.phone ?? null,
          totals: initDriverTotals(),
          bookings: [],
        })
        driverBookingMap.set(driver.id, new Map())
      }

      const group = driverMap.get(driver.id)!
      const bMap = driverBookingMap.get(driver.id)!

      group.totals.itemCount += 1

      const isPay = item.direction === 'EXPENSE'
      const isCollect = item.direction === 'INCOME'

      if (isPay) {
        group.totals.payTotal += amount
        if (item.paid) group.totals.payPaid += amount
        else group.totals.payDue += amount
      } else if (isCollect) {
        group.totals.collectTotal += amount
        if (item.paid) group.totals.collectPaid += amount
        else group.totals.collectDue += amount
      }

      if (!bMap.has(booking.id)) {
        bMap.set(booking.id, {
          bookingId: booking.id,
          bookingRef: booking.bookingRef ?? null,
          tourName: booking.tourName ?? '',
          tourDate: booking.tourDate.toISOString(),
          payTotal: 0,
          payPaid: 0,
          payDue: 0,
          collectTotal: 0,
          collectPaid: 0,
          collectDue: 0,
          netTotal: 0,
          netDue: 0,
        })
      }
      const b = bMap.get(booking.id)!

      if (isPay) {
        b.payTotal += amount
        if (item.paid) b.payPaid += amount
        else b.payDue += amount
      } else if (isCollect) {
        b.collectTotal += amount
        if (item.paid) b.collectPaid += amount
        else b.collectDue += amount
      }
    }
  }

  const vendors: VendorInvoiceSummary[] = []
  for (const [partnerId, group] of vendorMap.entries()) {
    const bMap = vendorBookingMap.get(partnerId) || new Map<number, VendorInvoiceBookingSummary>()
    const bookings = [...bMap.values()]
    bookings.sort((a, b) => +new Date(a.tourDate) - +new Date(b.tourDate))
    group.bookings = bookings
    group.totals.bookingCount = bookings.length
    vendors.push(group)
  }
  vendors.sort((a, b) => a.partnerName.localeCompare(b.partnerName))

  const drivers: DriverInvoiceSummary[] = []
  for (const [driverId, group] of driverMap.entries()) {
    const bMap = driverBookingMap.get(driverId) || new Map<number, DriverInvoiceBookingSummary>()
    const bookings = [...bMap.values()]
    bookings.sort((a, b) => +new Date(a.tourDate) - +new Date(b.tourDate))
    group.bookings = bookings
    group.totals.bookingCount = bookings.length

    group.totals.netTotal = group.totals.payTotal - group.totals.collectTotal
    group.totals.netDue = group.totals.payDue - group.totals.collectDue

    for (const b of group.bookings) {
      b.netTotal = b.payTotal - b.collectTotal
      b.netDue = b.payDue - b.collectDue
    }

    drivers.push(group)
  }
  drivers.sort((a, b) => a.driverName.localeCompare(b.driverName))

  return {
    month: monthKey,
    includePaid,
    generatedAt: new Date().toISOString(),
    vendors,
    drivers,
  }
}

