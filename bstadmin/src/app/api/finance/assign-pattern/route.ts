import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PayeeType, Prisma } from '@prisma/client'
import { syncBookingStatus } from '@/lib/booking/status'

const getQtyFromUnitType = (
  unitType: string,
  adult: number,
  child: number
) => {
  switch (unitType) {
    case 'PER_ADULT':
      return adult
    case 'PER_CHILD':
      return child
    case 'PER_PAX':
      return adult + child
    case 'PER_BOOKING':
    default:
      return 1
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { bookingId, patternId } = body

    if (!bookingId || !patternId) {
      return NextResponse.json({ error: 'bookingId and patternId are required' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { finance: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.finance?.isLocked) {
      return NextResponse.json({ error: 'Finance is locked for this booking' }, { status: 400 })
    }

    const pattern = await prisma.tourCostPattern.findUnique({
      where: { id: parseInt(patternId) },
      include: {
        items: {
          include: { serviceItem: { include: { tourItemCategoryRef: true } } },
          orderBy: { position: 'asc' },
        },
      },
    })

    if (!pattern) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const adult = booking.numberOfAdult
    const child = booking.numberOfChild ?? 0

    const financeItems: Prisma.BookingFinanceItemCreateManyBookingFinanceInput[] = pattern.items.map((item) => {
      const baseQty = getQtyFromUnitType(item.defaultUnitType, adult, child)
      const qty = baseQty * Number(item.defaultQty ?? 1)
      const price = Number(item.defaultPrice)
      const amount = qty * price
      const category = item.serviceItem.tourItemCategoryRef || null
      const direction = category?.defaultDirection || (category?.isCommission ? 'INCOME' : 'EXPENSE')
      const payeeMode = category?.payeeMode || 'PARTNER_ONLY'
      const canDriver = payeeMode === 'DRIVER_ONLY' || payeeMode === 'EITHER'
      const canPartner = payeeMode === 'PARTNER_ONLY' || payeeMode === 'EITHER'
      let driverId = canDriver && category?.autoDriverFromBooking ? booking.assignedDriverId ?? null : null
      const partnerId = canPartner ? (item.defaultPartnerId ?? item.serviceItem.defaultPartnerId ?? null) : null
      if (canDriver && !driverId && category?.autoDriverFromBooking) {
        driverId = booking.assignedDriverId ?? null
      }
      const payeeType: PayeeType = driverId
        ? PayeeType.DRIVER
        : partnerId
          ? PayeeType.PARTNER
          : PayeeType.NONE

      return {
        serviceItemId: item.serviceItemId,
        nameSnapshot: item.serviceItem.name,
        tourItemCategoryIdSnapshot: category?.id ?? null,
        tourItemCategoryNameSnapshot: category?.name || 'Uncategorized',
        isCommissionSnapshot: category?.isCommission ?? false,
        allowRelatedItemSnapshot: category?.allowRelatedItem ?? false,
        direction,
        isManual: false,
        unitType: item.defaultUnitType,
        unitQty: qty,
        unitPrice: price,
        amount,
        driverId,
        partnerId,
        payeeType,
        commissionAmount: 0,
        commissionDriverAmount: 0,
      }
    })

    const finance = await prisma.$transaction(async (tx) => {
      const existing = await tx.bookingFinance.findUnique({
        where: { bookingId: booking.id },
      })

      if (existing) {
        await tx.bookingFinanceItem.deleteMany({ where: { bookingFinanceId: existing.id } })
        return tx.bookingFinance.update({
          where: { id: existing.id },
          data: {
            patternId: pattern.id,
            assignedAt: new Date(),
            validatedAt: null,
            items: { createMany: { data: financeItems } },
          },
          include: { items: true, pattern: true },
        })
      }

      return tx.bookingFinance.create({
        data: {
          bookingId: booking.id,
          patternId: pattern.id,
          assignedAt: new Date(),
          items: { createMany: { data: financeItems } },
        },
        include: { items: true, pattern: true },
      })
    })

    await syncBookingStatus(prisma, booking.id)

    return NextResponse.json({ success: true, finance })
  } catch (error) {
    console.error('[API /finance/assign-pattern] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
