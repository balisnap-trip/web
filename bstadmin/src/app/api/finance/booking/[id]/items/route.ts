import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FinanceRelationType, PayeeType } from '@prisma/client'
import { syncBookingStatus } from '@/lib/booking/status'
import { isTourDayOrPastBali } from '@/lib/booking/bali-date'
import { getUsdToIdrRateForDate, roundIdr, roundUsd } from '@/lib/finance/fx'

const isTourDayOrPast = (tourDate: Date) => isTourDayOrPastBali(tourDate, new Date())

const toOptionalPositiveInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const bookingId = parseInt(id)
    const body = await req.json()
    const { items, markValidated } = body

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { finance: true },
    })

    if (!booking || !booking.finance) {
      return NextResponse.json({ error: 'Finance not found for booking' }, { status: 404 })
    }

    if (booking.finance.isLocked) {
      return NextResponse.json({ error: 'Finance is locked for this booking' }, { status: 400 })
    }

    if (markValidated && !isTourDayOrPast(booking.tourDate)) {
      return NextResponse.json({ error: 'Cannot validate before tour date' }, { status: 400 })
    }

    let fxUpdate:
      | {
          totalPriceUsd: string
          totalPriceIdr: string
          fxRate: string
          fxDate: Date
        }
      | null = null

    if (markValidated) {
      const currency = (booking.currency || 'USD').toUpperCase()
      const totalPrice = Number(booking.totalPrice)
      if (!Number.isFinite(totalPrice)) {
        return NextResponse.json({ error: 'Invalid booking total price' }, { status: 400 })
      }

      if (currency !== 'USD' && currency !== 'IDR') {
        return NextResponse.json({ error: 'Unsupported booking currency for FX conversion' }, { status: 400 })
      }

      const fx = await getUsdToIdrRateForDate(booking.tourDate)
      const fxRate = Number(fx.rate)
      const usdAmount = currency === 'USD' ? totalPrice : totalPrice / fxRate
      const idrAmount = currency === 'IDR' ? totalPrice : totalPrice * fxRate
      const fxDate = new Date(`${fx.date}T00:00:00.000Z`)

      fxUpdate = {
        totalPriceUsd: roundUsd(usdAmount),
        totalPriceIdr: roundIdr(idrAmount),
        fxRate: fxRate.toFixed(6),
        fxDate,
      }
    }

    const financeId = booking.finance.id

    const incomingItems = Array.isArray(items) ? items : []
    const serviceItemIds = incomingItems
      .map((item: any) => item.serviceItemId)
      .filter((value: any) => value !== null && value !== undefined)
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value))
    const categoryIds = incomingItems
      .map((item: any) => item.tourItemCategoryIdSnapshot)
      .filter((value: any) => value !== null && value !== undefined)
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value))

    const result = await prisma.$transaction(async (tx) => {
      const [serviceItems, categories] = await Promise.all([
        serviceItemIds.length
          ? tx.serviceItem.findMany({
              where: { id: { in: serviceItemIds } },
              include: { tourItemCategoryRef: true },
            })
          : Promise.resolve([]),
        categoryIds.length
          ? tx.tourItemCategory.findMany({ where: { id: { in: categoryIds } } })
          : Promise.resolve([]),
      ])

      const serviceMap = new Map(serviceItems.map((item) => [item.id, item]))
      const categoryMap = new Map(categories.map((category) => [category.id, category]))

      const resolveCategory = (item: any) => {
        const serviceItemId = item.serviceItemId ? Number(item.serviceItemId) : null
        if (serviceItemId && serviceMap.has(serviceItemId)) {
          const serviceItem = serviceMap.get(serviceItemId)!
          return serviceItem.tourItemCategoryRef || null
        }
        const categoryId = item.tourItemCategoryIdSnapshot ? Number(item.tourItemCategoryIdSnapshot) : null
        if (categoryId && categoryMap.has(categoryId)) {
          return categoryMap.get(categoryId)!
        }
        return null
      }

      const existingIds = new Set(
        (await tx.bookingFinanceItem.findMany({
          where: { bookingFinanceId: financeId },
          select: { id: true },
        })).map((item) => item.id)
      )

      const incomingIdsRaw = new Set(
        incomingItems
          .map((item: any) => toOptionalPositiveInt(item?.id))
          .filter((idValue: any): idValue is number => typeof idValue === 'number')
      )

      // Only consider IDs that actually belong to this booking's finance record.
      const incomingIds = new Set<number>([...incomingIdsRaw].filter((idValue) => existingIds.has(idValue)))
      const allowedRelatedTargetIds = incomingIds

      const toDelete = [...existingIds].filter((existingId) => !incomingIds.has(existingId))

      const upserts = incomingItems.map((item: any) => {
        const itemId = toOptionalPositiveInt(item.id)
        const rawQty = Number(item.unitQty ?? 1)
        const unitQty = Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 1
        const rawAmount = Number(item.amount ?? NaN)
        const rawUnitPrice = Number(item.unitPrice ?? NaN)
        const safeAmount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : undefined
        const safeUnitPrice = Number.isFinite(rawUnitPrice) ? Math.max(0, rawUnitPrice) : undefined
        const amount = safeAmount !== undefined ? safeAmount : unitQty * (safeUnitPrice ?? 0)
        const unitPrice = unitQty > 0 ? amount / unitQty : amount

        const category = resolveCategory(item)
        const payeeMode = category?.payeeMode || 'PARTNER_ONLY'
        const canDriver = payeeMode === 'DRIVER_ONLY' || payeeMode === 'EITHER'
        const canPartner = payeeMode === 'PARTNER_ONLY' || payeeMode === 'EITHER'
        const resolvedDriverId = item.driverId ? parseInt(item.driverId) : null
        const resolvedPartnerId = item.partnerId ? parseInt(item.partnerId) : null
        let driverId = canDriver
          ? resolvedDriverId ?? (category?.autoDriverFromBooking ? booking.assignedDriverId ?? null : null)
          : null
        let partnerId = canPartner ? resolvedPartnerId : null

        const requiresDriverPayee = !partnerId && amount > 0
        if (requiresDriverPayee) {
          if (!booking.assignedDriverId && !resolvedDriverId) {
            throw new Error('Driver must be assigned when partner is No partner and amount > 0')
          }
          driverId = resolvedDriverId ?? booking.assignedDriverId ?? null
          partnerId = null
        }

        const payeeType: PayeeType = driverId
          ? PayeeType.DRIVER
          : partnerId
            ? PayeeType.PARTNER
            : PayeeType.NONE
        // Avoid FK errors when the referenced item is deleted or isn't part of this booking finance.
        let relatedItemId =
          category?.allowRelatedItem && item.relatedItemId ? toOptionalPositiveInt(item.relatedItemId) : null
        if (relatedItemId && (!allowedRelatedTargetIds.has(relatedItemId) || relatedItemId === itemId)) {
          relatedItemId = null
        }
        const relationType: FinanceRelationType | null = relatedItemId
          ? FinanceRelationType.COMMISSION_FOR
          : null

        const data = {
          serviceItemId: item.serviceItemId ? parseInt(item.serviceItemId) : null,
          nameSnapshot: String(item.nameSnapshot || ''),
          tourItemCategoryIdSnapshot: item.tourItemCategoryIdSnapshot
            ? parseInt(item.tourItemCategoryIdSnapshot)
            : category?.id ?? null,
          tourItemCategoryNameSnapshot: item.tourItemCategoryNameSnapshot
            ? String(item.tourItemCategoryNameSnapshot)
            : category?.name || 'Uncategorized',
          isCommissionSnapshot: item.isCommissionSnapshot ?? category?.isCommission ?? false,
          allowRelatedItemSnapshot: item.allowRelatedItemSnapshot ?? category?.allowRelatedItem ?? false,
          direction: item.direction || category?.defaultDirection || 'EXPENSE',
          isManual: Boolean(item.isManual),
          payeeType,
          unitType: item.unitType || 'PER_BOOKING',
          unitQty,
          unitPrice,
          amount,
          commissionAmount: 0,
          commissionDriverAmount: 0,
          driverId,
          partnerId,
          relatedItemId,
          relationType,
          notes: item.notes ? String(item.notes).trim() : null,
        }

        if (itemId && existingIds.has(itemId)) {
          return tx.bookingFinanceItem.update({
            where: { id: itemId },
            data,
          })
        }
        return tx.bookingFinanceItem.create({
          data: {
            bookingFinanceId: financeId,
            ...data,
          },
        })
      })

      await Promise.all(upserts)

      // Delete only after updates/creates so any stale relations can be cleared first.
      if (toDelete.length > 0) {
        await tx.bookingFinanceItem.deleteMany({
          where: { id: { in: toDelete } },
        })
      }

      const updatedFinance = await tx.bookingFinance.update({
        where: { id: financeId },
        data: {
          validatedAt: markValidated ? new Date() : booking.finance?.validatedAt,
          isLocked: markValidated ? true : booking.finance?.isLocked ?? false,
        },
        include: {
          items: true,
        },
      })

      if (markValidated && fxUpdate) {
        await tx.booking.update({
          where: { id: bookingId },
          data: fxUpdate,
        })
      }

      return updatedFinance
    })

    await syncBookingStatus(prisma, bookingId)

    return NextResponse.json({ success: true, finance: result })
  } catch (error) {
    console.error('[API /finance/booking/[id]/items] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
