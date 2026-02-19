import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBookingStatus } from '@/lib/booking/status'
import { safeRecordWriteCutoverAudit } from '@/lib/cutover/write-cutover'
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

  let writeCutoverAudit:
    | {
        userId: string
        actorRole: string
        bookingId: number
        operation: string
        coreAttempted: boolean
        coreSuccess: boolean | null
        coreStatus: number | null
        coreError: string | null
        strictMode: boolean
        fallbackUsed: boolean
        legacyAttempted: boolean
        legacySuccess: boolean | null
        legacyError: string | null
        metadata: Record<string, unknown>
        ipAddress: string
        userAgent: string
      }
    | null = null

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
    const writeCoreEnabled = isOpsWriteCoreEnabledForActor({
      id: session.user.id,
      email: session.user.email,
    })
    const strictMode = isOpsWriteCoreStrict()

    writeCutoverAudit = {
      userId: session.user.id,
      actorRole: session.user.role,
      bookingId,
      operation: 'BOOKING_PATCH',
      coreAttempted: false,
      coreSuccess: null,
      coreStatus: null,
      coreError: null,
      strictMode,
      fallbackUsed: false,
      legacyAttempted: false,
      legacySuccess: null,
      legacyError: null,
      metadata: { coreLookupId },
      ipAddress:
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    }

    const markCoreResult = (
      result: { ok: boolean; status: number; error: string | null },
      scope: string
    ) => {
      writeCutoverAudit!.coreAttempted = true
      if (result.ok) {
        if (writeCutoverAudit!.coreSuccess !== false) {
          writeCutoverAudit!.coreSuccess = true
          writeCutoverAudit!.coreStatus = result.status
        }
        return
      }

      writeCutoverAudit!.coreSuccess = false
      writeCutoverAudit!.coreStatus = result.status
      writeCutoverAudit!.coreError = `${scope}:${result.error || `CORE_API_HTTP_${result.status}`}`
    }

    if (writeCoreEnabled) {
      if (note !== undefined || meetingPoint !== undefined) {
        const corePatchResult = await patchCoreOpsBooking(coreLookupId, {
          note,
          meetingPoint,
        })
        markCoreResult(corePatchResult, 'patch')

        if (!corePatchResult.ok) {
          if (strictMode) {
            writeCutoverAudit.legacyAttempted = false
            writeCutoverAudit.legacySuccess = false
            writeCutoverAudit.legacyError = 'STRICT_MODE_ABORTED'
            await safeRecordWriteCutoverAudit(writeCutoverAudit)
            return NextResponse.json(
              {
                error: `core-api patch failed: ${corePatchResult.error}`,
              },
              { status: 502 }
            )
          }
          writeCutoverAudit.fallbackUsed = true
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
        markCoreResult(coreAssignResult, assignedDriverId ? 'assign' : 'unassign')

        if (!coreAssignResult.ok) {
          if (strictMode) {
            writeCutoverAudit.legacyAttempted = false
            writeCutoverAudit.legacySuccess = false
            writeCutoverAudit.legacyError = 'STRICT_MODE_ABORTED'
            await safeRecordWriteCutoverAudit(writeCutoverAudit)
            return NextResponse.json(
              {
                error: `core-api assignment failed: ${coreAssignResult.error}`,
              },
              { status: 502 }
            )
          }
          writeCutoverAudit.fallbackUsed = true
          console.warn(
            '[API /bookings/[id]] core-api assignment fallback:',
            coreAssignResult.status,
            coreAssignResult.error
          )
        } else {
          const coreSyncResult = await syncCoreOpsBookingStatus(coreLookupId)
          markCoreResult(coreSyncResult, 'status-sync')
          if (!coreSyncResult.ok) {
            if (strictMode) {
              writeCutoverAudit.legacyAttempted = false
              writeCutoverAudit.legacySuccess = false
              writeCutoverAudit.legacyError = 'STRICT_MODE_ABORTED'
              await safeRecordWriteCutoverAudit(writeCutoverAudit)
              return NextResponse.json(
                {
                  error: `core-api sync failed: ${coreSyncResult.error}`,
                },
                { status: 502 }
              )
            }
            writeCutoverAudit.fallbackUsed = true
            console.warn(
              '[API /bookings/[id]] core-api sync warning:',
              coreSyncResult.status,
              coreSyncResult.error
            )
          }
        }
      }
    }

    writeCutoverAudit.legacyAttempted = true
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

    writeCutoverAudit.legacySuccess = true
    if (writeCutoverAudit.coreAttempted) {
      await safeRecordWriteCutoverAudit(writeCutoverAudit)
    }

    return NextResponse.json({
      success: true,
      booking: {
        ...booking,
        totalPrice: Number(booking.totalPrice),
      },
    })
  } catch (error) {
    if (writeCutoverAudit?.coreAttempted) {
      writeCutoverAudit.legacySuccess = false
      writeCutoverAudit.legacyError =
        error instanceof Error ? error.message : String(error)
      await safeRecordWriteCutoverAudit(writeCutoverAudit)
    }
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
