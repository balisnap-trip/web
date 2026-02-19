import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBookingStatus } from '@/lib/booking/status'
import {
  assignCoreOpsBooking,
  fetchCoreOpsBookingDetail,
  isOpsReadNewModelEnabledForActor,
  isOpsWriteCoreEnabledForActor,
  isOpsWriteCoreStrict,
  patchCoreOpsBooking,
  syncCoreOpsBookingStatus,
  unassignCoreOpsBooking,
} from '@/lib/integrations/core-api-ops'

/**
 * GET /api/bookings/[id]
 * Get single booking details
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
    const bookingId = parseInt(id)
    if (Number.isNaN(bookingId)) {
      return NextResponse.json(
        { error: 'Invalid booking id' },
        { status: 400 }
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        package: { include: { tour: true } },
        driver: true,
        user: true,
        reviews: true,
        bookingEmails: {
          include: {
            email: {
              select: {
                receivedAt: true,
              },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Prefer the email that CREATED the booking. If missing, fall back to earliest linked email.
    const createdReceivedAt =
      booking.bookingEmails
        .filter((be) => be.relationType === 'CREATED' && be.email?.receivedAt)
        .map((be) => be.email.receivedAt)
        .sort((a, b) => a.getTime() - b.getTime())[0] ||
      booking.bookingEmails
        .filter((be) => be.email?.receivedAt)
        .map((be) => be.email.receivedAt)
        .sort((a, b) => a.getTime() - b.getTime())[0] ||
      null

    let mergedBooking: any = {
      ...booking,
      totalPrice: Number(booking.totalPrice),
      otaReceivedAt: createdReceivedAt,
    }

    if (
      isOpsReadNewModelEnabledForActor({
        id: session.user.id,
        email: session.user.email,
      })
    ) {
      const coreLookupId = booking.bookingRef?.trim() || String(booking.id)
      const coreResult = await fetchCoreOpsBookingDetail(coreLookupId)

      if (coreResult.ok && coreResult.data) {
        mergedBooking = {
          ...mergedBooking,
          source: coreResult.data.channelCode || mergedBooking.source,
          status: coreResult.data.opsFulfillmentStatus || mergedBooking.status,
          meetingPoint: coreResult.data.meetingPoint ?? mergedBooking.meetingPoint,
          note: coreResult.data.note ?? mergedBooking.note,
          assignedDriverId:
            coreResult.data.assignedDriverId === undefined
              ? mergedBooking.assignedDriverId
              : coreResult.data.assignedDriverId,
        }
      } else if (coreResult.status !== 404) {
        console.warn(
          '[API /bookings/[id]] core-api read fallback:',
          coreResult.status,
          coreResult.error
        )
      }
    }

    return NextResponse.json({
      booking: mergedBooking,
    })
  } catch (error) {
    console.error('[API /bookings/[id]] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/bookings/[id]
 * Update booking (status, assignment, etc.)
 */
export async function PATCH(
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
    if (Number.isNaN(bookingId)) {
      return NextResponse.json(
        { error: 'Invalid booking id' },
        { status: 400 }
      )
    }

    const existingBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, bookingRef: true, assignedDriverId: true },
    })
    if (!existingBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const { assignedDriverId, note, meetingPoint, packageId } = body

    const updateData: any = {}
    
    if (note !== undefined) updateData.note = note
    if (meetingPoint !== undefined) updateData.meetingPoint = meetingPoint
    if (packageId !== undefined) {
      updateData.packageId = packageId ? parseInt(packageId) : null
    }
    
    // Handle driver assignment
    if (assignedDriverId !== undefined) {
      updateData.assignedDriverId = assignedDriverId || null
      updateData.assignedAt = assignedDriverId ? new Date() : null
    }

    const coreLookupId = existingBooking.bookingRef?.trim() || String(existingBooking.id)
    if (
      isOpsWriteCoreEnabledForActor({
        id: session.user.id,
        email: session.user.email,
      })
    ) {
      if (note !== undefined || meetingPoint !== undefined) {
        const corePatchResult = await patchCoreOpsBooking(coreLookupId, {
          note,
          meetingPoint,
        })

        if (!corePatchResult.ok) {
          if (isOpsWriteCoreStrict()) {
            return NextResponse.json(
              {
                error: `core-api patch failed: ${corePatchResult.error}`,
              },
              { status: 502 }
            )
          }
          console.warn(
            '[API /bookings/[id]] core-api patch fallback:',
            corePatchResult.status,
            corePatchResult.error
          )
        }
      }

      if (assignedDriverId !== undefined) {
        const coreAssignResult =
          assignedDriverId
            ? await assignCoreOpsBooking(coreLookupId, Number(assignedDriverId))
            : await unassignCoreOpsBooking(coreLookupId)

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
            '[API /bookings/[id]] core-api assignment fallback:',
            coreAssignResult.status,
            coreAssignResult.error
          )
        } else {
          const coreSyncResult = await syncCoreOpsBookingStatus(coreLookupId)
          if (!coreSyncResult.ok) {
            console.warn(
              '[API /bookings/[id]] core-api sync warning:',
              coreSyncResult.status,
              coreSyncResult.error
            )
          }
        }
      }
    }

    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        package: { include: { tour: true } },
        driver: true,
        user: true,
      },
    })

    if (assignedDriverId !== undefined) {
      await syncBookingStatus(prisma, booking.id)
    }

    return NextResponse.json({
      success: true,
      booking: {
        ...booking,
        totalPrice: Number(booking.totalPrice),
      },
    })
  } catch (error) {
    console.error('[API /bookings/[id]] Error updating booking:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/bookings/[id]
 * Delete/Cancel booking
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
    const bookingId = parseInt(id)

    if (isNaN(bookingId)) {
      return NextResponse.json(
        { error: 'Invalid booking ID' },
        { status: 400 }
      )
    }

    const existingBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    })

    if (!existingBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    await prisma.booking.delete({
      where: { id: bookingId },
    })

    return NextResponse.json({
      success: true,
      message: 'Booking deleted successfully',
    })
  } catch (error) {
    console.error('[API /bookings/[id]] Error deleting booking:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
