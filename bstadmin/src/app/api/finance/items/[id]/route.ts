import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBookingSettlementStatus } from '@/lib/finance/sync-booking-settlement'
import { syncBookingStatus } from '@/lib/booking/status'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await req.json()
    const {
      paid,
      paidAt,
      paidBy,
      paidNote,
      driverId,
      partnerId,
      unitQty,
      unitPrice,
      nameSnapshot,
      direction,
      unitType,
      commissionAmount,
      commissionDriverAmount,
      notes,
    } = body

    const parsedQty = unitQty !== undefined ? Number(unitQty) : undefined
    const parsedPrice = unitPrice !== undefined ? Number(unitPrice) : undefined
    const amount =
      parsedQty !== undefined && parsedPrice !== undefined
        ? parsedQty * parsedPrice
        : undefined
    const parsedCommission =
      commissionAmount !== undefined && Number.isFinite(Number(commissionAmount))
        ? Math.max(0, Number(commissionAmount))
        : undefined
    const parsedCommissionDriver =
      commissionDriverAmount !== undefined && Number.isFinite(Number(commissionDriverAmount))
        ? Math.max(0, Number(commissionDriverAmount))
        : undefined

    const resolvedDriverId = driverId !== undefined ? (driverId ? parseInt(driverId) : null) : undefined
    const resolvedPartnerId = partnerId !== undefined ? (partnerId ? parseInt(partnerId) : null) : undefined
    const payeeType = resolvedDriverId
      ? 'DRIVER'
      : resolvedPartnerId
        ? 'PARTNER'
        : resolvedDriverId === null || resolvedPartnerId === null
          ? 'NONE'
          : undefined

    const itemId = parseInt(id)
    const resolvedPaidAt = paidAt ? new Date(paidAt) : undefined

    const item = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.bookingFinanceItem.update({
        where: { id: itemId },
        data: {
          paid: paid !== undefined ? Boolean(paid) : undefined,
          paidAt: resolvedPaidAt ? resolvedPaidAt : paid === false ? null : undefined,
          paidBy: paidBy !== undefined ? (paidBy ? String(paidBy).trim() : null) : undefined,
          paidNote: paidNote !== undefined ? (paidNote ? String(paidNote).trim() : null) : undefined,
          driverId: resolvedDriverId,
          partnerId: resolvedPartnerId,
          payeeType: payeeType !== undefined ? payeeType : undefined,
          unitQty: parsedQty !== undefined ? parsedQty : undefined,
          unitPrice: parsedPrice !== undefined ? parsedPrice : undefined,
          amount: amount !== undefined ? amount : undefined,
          commissionAmount: parsedCommission !== undefined ? parsedCommission : undefined,
          commissionDriverAmount: parsedCommissionDriver !== undefined
            ? parsedCommissionDriver
            : undefined,
          nameSnapshot: nameSnapshot !== undefined ? String(nameSnapshot) : undefined,
          direction: direction !== undefined ? direction : undefined,
          unitType: unitType !== undefined ? unitType : undefined,
          notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
        },
        include: {
          bookingFinance: { select: { bookingId: true } },
        },
      })

      await syncBookingSettlementStatus(tx, [updatedItem.bookingFinance.bookingId], resolvedPaidAt)

      return updatedItem
    })

    await syncBookingStatus(prisma, item.bookingFinance.bookingId)

    return NextResponse.json({
      success: true,
      item: {
        ...item,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      },
    })
  } catch (error) {
    console.error('[API /finance/items/[id]] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
