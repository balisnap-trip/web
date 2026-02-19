import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBookingSettlementStatus } from '@/lib/finance/sync-booking-settlement'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await prisma.bookingFinanceItem.findMany({
      where: {
        paid: false,
        OR: [{ driverId: { not: null } }, { partnerId: { not: null } }],
        bookingFinance: {
          validatedAt: { not: null },
          isLocked: true,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        bookingFinance: {
          include: {
            booking: {
              include: { package: { include: { tour: true } }, driver: true },
            },
          },
        },
        driver: true,
        partner: true,
      },
    })

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
        commissionAmount: Number(item.commissionAmount),
        commissionDriverAmount: Number(item.commissionDriverAmount),
      })),
    })
  } catch (error) {
    console.error('[API /finance/settlements] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { itemIds, paidBy, paidNote, paidAt } = body

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: 'itemIds is required' }, { status: 400 })
    }

    const resolvedPaidAt = paidAt ? new Date(paidAt) : new Date()
    const normalizedItemIds = itemIds
      .map((id: any) => Number(id))
      .filter((id: number) => Number.isFinite(id))

    if (normalizedItemIds.length === 0) {
      return NextResponse.json({ error: 'No valid item IDs provided' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedItems = await tx.bookingFinanceItem.findMany({
        where: { id: { in: normalizedItemIds }, paid: false },
        select: { id: true, bookingFinance: { select: { bookingId: true } } },
      })

      const updateResult = await tx.bookingFinanceItem.updateMany({
        where: { id: { in: updatedItems.map((item) => item.id) }, paid: false },
        data: {
          paid: true,
          paidAt: resolvedPaidAt,
          paidBy: paidBy ? String(paidBy).trim() : null,
          paidNote: paidNote ? String(paidNote).trim() : null,
        },
      })

      await syncBookingSettlementStatus(
        tx,
        updatedItems.map((item) => item.bookingFinance.bookingId),
        resolvedPaidAt
      )

      return updateResult
    })

    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    console.error('[API /finance/settlements] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
