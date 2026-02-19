import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/drivers/[id]
 * Get a specific driver by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const driverId = parseInt(id)

    if (isNaN(driverId)) {
      return NextResponse.json(
        { error: 'Invalid driver ID' },
        { status: 400 }
      )
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    })

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver not found' },
        { status: 404 }
      )
    }

    const totals = await prisma.$queryRaw<Array<{ totalCount: number }>>`
      SELECT COUNT(*)::int AS "totalCount"
      FROM audit_logs
      WHERE action = 'ASSIGN_DRIVER'
        AND entity = 'Booking'
        AND (new_value->>'assignedDriverId')::int = ${driverId}
    `

    return NextResponse.json({
      driver: {
        ...driver,
        rating: driver.rating ? Number(driver.rating) : null,
        bookingCount: driver._count.bookings,
        monthlyAssignmentCount: driver.assignmentCount,
        totalAssignmentCount: Number(totals?.[0]?.totalCount || 0),
      },
    })
  } catch (error) {
    console.error('[API /drivers/[id]] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/drivers/[id]
 * Update a driver
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized - Admin only' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const driverId = parseInt(id)

    if (isNaN(driverId)) {
      return NextResponse.json(
        { error: 'Invalid driver ID' },
        { status: 400 }
      )
    }

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

    console.log('[PUT /api/drivers/[id]] Received data:', {
      driverId,
      name,
      phone,
      vehicleType,
      priorityLevel,
      priorityLevelType: typeof priorityLevel,
      status,
    })

    if (!name || !phone || !vehicleType) {
      return NextResponse.json(
        { error: 'Name, phone, and vehicle type are required' },
        { status: 400 }
      )
    }

    // Check if driver exists
    const existingDriver = await prisma.driver.findUnique({
      where: { id: driverId },
    })

    if (!existingDriver) {
      return NextResponse.json(
        { error: 'Driver not found' },
        { status: 404 }
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

    console.log('[PUT /api/drivers/[id]] Parsed priority level:', parsedPriorityLevel)

    // Update driver
    const driver = await prisma.driver.update({
      where: { id: driverId },
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

    console.log('[PUT /api/drivers/[id]] Driver updated successfully:', driver.id)

    return NextResponse.json({
      success: true,
      driver: {
        ...driver,
        rating: driver.rating ? Number(driver.rating) : null,
      },
    })
  } catch (error) {
    console.error('[API /drivers/[id]] Error updating driver:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/drivers/[id]
 * Delete a driver
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized - Admin only' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const driverId = parseInt(id)

    if (isNaN(driverId)) {
      return NextResponse.json(
        { error: 'Invalid driver ID' },
        { status: 400 }
      )
    }

    // Check if driver exists
    const existingDriver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    })

    if (!existingDriver) {
      return NextResponse.json(
        { error: 'Driver not found' },
        { status: 404 }
      )
    }

    // Optional: Prevent deletion if driver has bookings
    // Uncomment the lines below if you want to prevent deletion
    // if (existingDriver._count.bookings > 0) {
    //   return NextResponse.json(
    //     { 
    //       error: `Cannot delete driver with ${existingDriver._count.bookings} booking(s). Please reassign bookings first.` 
    //     },
    //     { status: 400 }
    //   )
    // }

    // Delete driver
    await prisma.driver.delete({
      where: { id: driverId },
    })

    return NextResponse.json({
      success: true,
      message: 'Driver deleted successfully',
    })
  } catch (error) {
    console.error('[API /drivers/[id]] Error deleting driver:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
