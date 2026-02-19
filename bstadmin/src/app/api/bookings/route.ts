import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/bookings
 * Get all bookings with filters
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const bookings = await prisma.booking.findMany({
      orderBy: {
        tourDate: 'asc',
      },
      include: {
        package: {
          select: {
            packageName: true,
          },
        },
        driver: {
          select: {
            name: true,
            phone: true,
            vehicleType: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      bookings: bookings.map(booking => ({
        ...booking,
        totalPrice: Number(booking.totalPrice),
        totalPriceUsd: booking.totalPriceUsd ? Number(booking.totalPriceUsd) : null,
        totalPriceIdr: booking.totalPriceIdr ? Number(booking.totalPriceIdr) : null,
        fxRate: booking.fxRate ? Number(booking.fxRate) : null,
      })),
    })
  } catch (error) {
    console.error('[API /bookings] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/bookings
 * Create a new booking (manual)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const {
      userEmail,
      userName,
      packageId,
      tourDate,
      numberOfAdult,
      numberOfChild,
      totalPrice,
      currency,
      mainContactName,
      mainContactEmail,
      phoneNumber,
      meetingPoint,
      note,
    } = body

    // Find or create user
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {
        name: userName,
      },
      create: {
        email: userEmail,
        name: userName,
        role: 'CUSTOMER',
      },
    })

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        packageId: packageId || null,
        bookingDate: new Date(),
        tourDate: new Date(tourDate),
        numberOfAdult,
        numberOfChild: numberOfChild || 0,
        totalPrice,
        currency: currency || 'USD',
        status: 'NEW',
        source: 'MANUAL',
        mainContactName: mainContactName || userName,
        mainContactEmail: mainContactEmail || userEmail,
        phoneNumber: phoneNumber || '',
        meetingPoint: meetingPoint || '',
        note: note || '',
        isPaid: false, // Manual bookings need payment confirmation
      },
      include: {
        package: true,
        user: true,
      },
    })

    return NextResponse.json({
      success: true,
      booking: {
        ...booking,
        totalPrice: Number(booking.totalPrice),
        totalPriceUsd: booking.totalPriceUsd ? Number(booking.totalPriceUsd) : null,
        totalPriceIdr: booking.totalPriceIdr ? Number(booking.totalPriceIdr) : null,
        fxRate: booking.fxRate ? Number(booking.fxRate) : null,
      },
    })
  } catch (error) {
    console.error('[API /bookings] Error creating booking:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
