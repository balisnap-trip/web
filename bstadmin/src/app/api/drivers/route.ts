import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/drivers
 * Get all drivers
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
    const totals = await prisma.$queryRaw<Array<{ driverId: number; totalCount: number }>>`
      SELECT
        (new_value->>'assignedDriverId')::int AS "driverId",
        COUNT(*)::int AS "totalCount"
      FROM audit_logs
      WHERE action = 'ASSIGN_DRIVER'
        AND entity = 'Booking'
        AND (new_value->>'assignedDriverId') IS NOT NULL
      GROUP BY 1
    `

    const totalByDriverId = new Map<number, number>(
      (totals || []).map((r) => [Number(r.driverId), Number(r.totalCount)])
    )

    const drivers = await prisma.driver.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    })

    return NextResponse.json({
      drivers: drivers.map(driver => ({
        ...driver,
        rating: driver.rating ? Number(driver.rating) : null,
        priorityLevel: driver.priorityLevel,
        bookingCount: driver._count.bookings,
        monthlyAssignmentCount: driver.assignmentCount,
        totalAssignmentCount: totalByDriverId.get(driver.id) || 0,
      })),
    })
  } catch (error) {
    console.error('[API /drivers] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/drivers
 * Create a new driver
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized - Admin only' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const {
      name,
      email,
      phone,
      vehicleType,
      vehiclePlate,
      licenseNumber,
      status,
      notes,
      priorityLevel,
    } = body

    if (!name || !phone || !vehicleType) {
      return NextResponse.json(
        { error: 'Name, phone, and vehicle type are required' },
        { status: 400 }
      )
    }

    // Parse priority level
    let parsedPriorityLevel: number | null = null
    if (priorityLevel !== null && priorityLevel !== undefined && priorityLevel !== '') {
      const parsed = typeof priorityLevel === 'number' ? priorityLevel : parseInt(priorityLevel)
      if (!isNaN(parsed)) {
        parsedPriorityLevel = parsed
      }
    }

    const driver = await prisma.driver.create({
      data: {
        name,
        email: email || null,
        phone,
        vehicleType,
        vehiclePlate: vehiclePlate || null,
        licenseNumber: licenseNumber || null,
        status: status || 'AVAILABLE',
        notes: notes || null,
        priorityLevel: parsedPriorityLevel,
      },
    })

    return NextResponse.json({
      success: true,
      driver: {
        ...driver,
        rating: driver.rating ? Number(driver.rating) : null,
      },
    })
  } catch (error) {
    console.error('[API /drivers] Error creating driver:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
