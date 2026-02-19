import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const bookingId = parseInt(id)
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        driver: true,
        package: { include: { tour: true } },
        finance: {
          include: {
            pattern: true,
            items: {
              include: {
                serviceItem: true,
                driver: true,
                partner: true,
                relatedItem: true,
              },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    return NextResponse.json({
      booking: {
        ...booking,
        totalPrice: Number(booking.totalPrice),
        finance: booking.finance
          ? {
              ...booking.finance,
              items: booking.finance.items.map((item) => ({
                ...item,
                unitPrice: Number(item.unitPrice),
                amount: Number(item.amount),
                commissionAmount: Number(item.commissionAmount),
                commissionDriverAmount: Number(item.commissionDriverAmount),
              })),
            }
          : null,
      },
    })
  } catch (error) {
    console.error('[API /finance/booking/[id]] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
