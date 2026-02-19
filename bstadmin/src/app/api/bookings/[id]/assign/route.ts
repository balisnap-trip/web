import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { driverSuggestionService } from '@/lib/services/driver-suggestion'
import { syncBookingStatus } from '@/lib/booking/status'
import {
  assignCoreOpsBooking,
  isOpsWriteCoreEnabledForActor,
  isOpsWriteCoreStrict,
  syncCoreOpsBookingStatus,
  unassignCoreOpsBooking,
} from '@/lib/integrations/core-api-ops'

/**
 * POST /api/bookings/[id]/assign
 * Assign driver to booking
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { driverId } = body

    if (!driverId) {
      return NextResponse.json(
        { error: 'Driver ID is required' },
        { status: 400 }
      )
    }

    const bookingId = parseInt(id)

    // Get booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        package: true,
        user: true,
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Get driver details
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    })

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver not found' },
        { status: 404 }
      )
    }

    const coreLookupId = booking.bookingRef?.trim() || String(booking.id)
    if (
      isOpsWriteCoreEnabledForActor({
        id: session.user.id,
        email: session.user.email,
      })
    ) {
      const coreAssignResult = await assignCoreOpsBooking(coreLookupId, Number(driverId))
      if (!coreAssignResult.ok) {
        if (isOpsWriteCoreStrict()) {
          return NextResponse.json(
            {
              error: `core-api assignment failed: ${coreAssignResult.error}`,
            },
            { status: 502 }
          )
        }
        console.warn(
          '[API /bookings/[id]/assign] core-api assignment fallback:',
          coreAssignResult.status,
          coreAssignResult.error
        )
      } else {
        const coreSyncResult = await syncCoreOpsBookingStatus(coreLookupId)
        if (!coreSyncResult.ok) {
          console.warn(
            '[API /bookings/[id]/assign] core-api sync warning:',
            coreSyncResult.status,
            coreSyncResult.error
          )
        }
      }
    }

    // Update booking with driver assignment
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignedDriverId: driverId,
        assignedAt: new Date(),
      },
      include: {
        package: true,
        driver: true,
        user: true,
      },
    })

    // NEW: Increment driver assignment counter (for rotation system)
    await driverSuggestionService.incrementDriverCount(driverId)
    console.log(`[Assignment API] Incremented assignment count for driver ID ${driverId}`)

    await syncBookingStatus(prisma, bookingId)

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ASSIGN_DRIVER',
        entity: 'Booking',
        entityId: bookingId.toString(),
        oldValue: { assignedDriverId: booking.assignedDriverId },
        newValue: { assignedDriverId: driverId, driverName: driver.name },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      message: `Driver ${driver.name} assigned successfully.`,
      booking: {
        ...updatedBooking,
        totalPrice: Number(updatedBooking.totalPrice),
      },
    })
  } catch (error) {
    console.error('[API /bookings/[id]/assign] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/bookings/[id]/assign
 * Unassign driver from booking
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const bookingId = parseInt(id)

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { driver: true },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    const oldDriver = booking.driver

    const coreLookupId = booking.bookingRef?.trim() || String(booking.id)
    if (
      isOpsWriteCoreEnabledForActor({
        id: session.user.id,
        email: session.user.email,
      })
    ) {
      const coreUnassignResult = await unassignCoreOpsBooking(coreLookupId)
      if (!coreUnassignResult.ok) {
        if (isOpsWriteCoreStrict()) {
          return NextResponse.json(
            {
              error: `core-api unassign failed: ${coreUnassignResult.error}`,
            },
            { status: 502 }
          )
        }
        console.warn(
          '[API /bookings/[id]/assign] core-api unassign fallback:',
          coreUnassignResult.status,
          coreUnassignResult.error
        )
      } else {
        const coreSyncResult = await syncCoreOpsBookingStatus(coreLookupId)
        if (!coreSyncResult.ok) {
          console.warn(
            '[API /bookings/[id]/assign] core-api sync warning:',
            coreSyncResult.status,
            coreSyncResult.error
          )
        }
      }
    }

    // Unassign driver
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignedDriverId: null,
        assignedAt: null,
      },
      include: {
        package: true,
        user: true,
      },
    })

    await syncBookingStatus(prisma, bookingId)

    return NextResponse.json({
      success: true,
      message: 'Driver unassigned successfully',
      booking: {
        ...updatedBooking,
        totalPrice: Number(updatedBooking.totalPrice),
      },
    })
  } catch (error) {
    console.error('[API /bookings/[id]/assign] Error unassigning:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
