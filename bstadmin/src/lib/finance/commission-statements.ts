import { prisma } from '@/lib/db'
import {
  type CommissionGroupByDriver,
  type CommissionGroupByVendor,
  type CommissionStatementLine,
  type CommissionStatementTotals,
  type CommissionStatementsPayload,
} from '@/lib/finance/commission-statements.types'

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

  // tourDate is stored in UTC. Month filter in Finance Report is based on Bali month.
  // Bali midnight is UTC-8h, so shift boundaries back by 8 hours.
  const offsetMs = BALI_UTC_OFFSET_HOURS * 60 * 60 * 1000
  const startUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0) - offsetMs
  const endUtcMs = Date.UTC(year, month, 1, 0, 0, 0) - offsetMs
  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

function parseNotesField(notes: string | null | undefined, key: string): string | null {
  const raw = String(notes ?? '').trim()
  if (!raw) return null

  const parts = raw.split('|').map((p) => p.trim())
  const prefix = `${key}:`
  for (const part of parts) {
    if (part.toLowerCase().startsWith(prefix.toLowerCase())) {
      const value = part.slice(prefix.length).trim()
      return value || null
    }
  }

  // Fallback: regex search in the whole string.
  const re = new RegExp(`${key}\\s*:\\s*([^|]+)`, 'i')
  const m = raw.match(re)
  if (!m?.[1]) return null
  const value = m[1].trim()
  return value || null
}

function toOptionalInt(value: string | null): number | null {
  if (!value) return null
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number.parseInt(digits, 10)
  if (!Number.isFinite(n)) return null
  return n
}

function vendorFromNameSnapshot(nameSnapshot: string | null | undefined): string | null {
  const s = String(nameSnapshot ?? '').trim()
  if (!s) return null
  const m = s.match(/^commission\s*-\s*(.+)$/i)
  if (!m?.[1]) return null
  const v = m[1].trim()
  return v || null
}

function computeTotals(lines: CommissionStatementLine[]): CommissionStatementTotals {
  let count = 0
  let grossTotalKnown = 0
  let companyTakesTotal = 0
  let driverGetsTotalKnown = 0
  let unknownGrossCount = 0

  for (const line of lines) {
    count += 1
    companyTakesTotal += Number(line.companyTakes) || 0
    if (line.gross === null || line.gross === undefined) {
      unknownGrossCount += 1
    } else {
      grossTotalKnown += Number(line.gross) || 0
    }
    if (line.driverGets !== null && line.driverGets !== undefined) {
      driverGetsTotalKnown += Number(line.driverGets) || 0
    }
  }

  return {
    count,
    grossTotalKnown,
    companyTakesTotal,
    driverGetsTotalKnown,
    unknownGrossCount,
  }
}

export async function getCommissionStatements(options?: {
  month?: string | null
}): Promise<CommissionStatementsPayload> {
  const monthRaw = options?.month ?? null
  const monthKey = normalizeMonthKey(monthRaw ?? '') || 'all'
  const monthRange = monthKey !== 'all' ? monthKeyToUtcRange(monthKey) : null

  const whereBooking: any = {
    status: 'DONE',
  }
  if (monthRange) {
    whereBooking.tourDate = { gte: monthRange.start, lt: monthRange.end }
  }

  const items = await prisma.bookingFinanceItem.findMany({
    where: {
      isCommissionSnapshot: true,
      bookingFinance: {
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
              assignedDriverId: true,
            },
          },
        },
      },
      driver: { select: { id: true, name: true, phone: true } },
    },
  })

  const lines: CommissionStatementLine[] = items.map((item) => {
    const booking = item.bookingFinance?.booking
    const vendor =
      parseNotesField(item.notes, 'Vendor') ||
      vendorFromNameSnapshot(item.nameSnapshot) ||
      null
    const gross = toOptionalInt(parseNotesField(item.notes, 'Gross'))
    const amount = Number(item.amount)
    const driverGets = gross !== null ? Math.max(0, gross - amount) : toOptionalInt(parseNotesField(item.notes, 'Driver gets'))

    return {
      financeItemId: item.id,
      bookingId: booking?.id ?? 0,
      bookingRef: booking?.bookingRef ?? null,
      tourName: booking?.tourName ?? '',
      tourDate: booking?.tourDate ? new Date(booking.tourDate).toISOString() : new Date(0).toISOString(),
      driverId: item.driverId ?? null,
      driverName: item.driver?.name ?? null,
      driverPhone: item.driver?.phone ?? null,
      vendor,
      gross,
      companyTakes: amount,
      driverGets,
      notes: item.notes ?? null,
    }
  })

  const byDriverMap = new Map<number | null, CommissionStatementLine[]>()
  for (const line of lines) {
    const key = line.driverId ?? null
    if (!byDriverMap.has(key)) byDriverMap.set(key, [])
    byDriverMap.get(key)!.push(line)
  }

  const byDriver: CommissionGroupByDriver[] = [...byDriverMap.entries()].map(([driverId, groupLines]) => {
    const driverName =
      groupLines.find((l) => l.driverName)?.driverName ||
      (driverId ? `Driver #${driverId}` : 'Unknown driver')
    const driverPhone = groupLines.find((l) => l.driverPhone)?.driverPhone || null

    const sortedLines = [...groupLines].sort((a, b) => {
      if (a.vendor && b.vendor && a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor)
      return +new Date(a.tourDate) - +new Date(b.tourDate)
    })

    return {
      driverId,
      driverName,
      driverPhone,
      totals: computeTotals(sortedLines),
      lines: sortedLines,
    }
  })

  byDriver.sort((a, b) => a.driverName.localeCompare(b.driverName))

  const byVendorMap = new Map<string, CommissionStatementLine[]>()
  for (const line of lines) {
    const vendorKey = (line.vendor || 'Unknown vendor').trim() || 'Unknown vendor'
    if (!byVendorMap.has(vendorKey)) byVendorMap.set(vendorKey, [])
    byVendorMap.get(vendorKey)!.push(line)
  }

  const byVendor: CommissionGroupByVendor[] = [...byVendorMap.entries()].map(([vendor, groupLines]) => {
    const sortedLines = [...groupLines].sort((a, b) => {
      if (a.driverName && b.driverName && a.driverName !== b.driverName) return a.driverName.localeCompare(b.driverName)
      return +new Date(a.tourDate) - +new Date(b.tourDate)
    })
    return {
      vendor,
      totals: computeTotals(sortedLines),
      lines: sortedLines,
    }
  })

  byVendor.sort((a, b) => a.vendor.localeCompare(b.vendor))

  return {
    month: monthKey,
    generatedAt: new Date().toISOString(),
    byDriver,
    byVendor,
  }
}

