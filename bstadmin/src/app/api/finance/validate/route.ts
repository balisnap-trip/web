import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'unvalidated'

    const bookings = await prisma.booking.findMany({
      where: {
        finance: {
          isNot: null,
        },
      },
      orderBy: { tourDate: 'desc' },
      include: {
        driver: true,
        package: { include: { tour: true } },
        finance: { include: { items: true } },
      },
    })

    const filtered = status === 'unvalidated'
      ? bookings.filter((b) => !b.finance?.validatedAt)
      : status === 'validated'
        ? bookings.filter((b) => b.finance?.validatedAt)
        : bookings

    return NextResponse.json({
      bookings: filtered.map((booking) => {
        const items = booking.finance?.items || []
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
        return {
          id: booking.id,
          bookingRef: booking.bookingRef,
          status: booking.status,
          tourDate: booking.tourDate,
          numberOfAdult: booking.numberOfAdult,
          numberOfChild: booking.numberOfChild,
          mainContactName: booking.mainContactName,
          package: booking.package,
          driver: booking.driver,
          finance: booking.finance ? { id: booking.finance.id, validatedAt: booking.finance.validatedAt, isLocked: booking.finance.isLocked } : null,
          financeSummary: { expense, income, commissionIn, commissionOut, net },
        }
      }),
    })
  } catch (error) {
    console.error('[API /finance/validate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
