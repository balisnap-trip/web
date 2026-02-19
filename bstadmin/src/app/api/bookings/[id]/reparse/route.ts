import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GYGParser } from '@/lib/email/parsers/gyg-parser'
import { BokunParser } from '@/lib/email/parsers/bokun-parser'
import { TripDotComParser } from '@/lib/email/parsers/tripdotcom-parser'
import { EmailParser, ParsedBooking } from '@/types/email'
import { syncBookingStatus } from '@/lib/booking/status'
import { driverSuggestionService } from '@/lib/services/driver-suggestion'

const parsers: EmailParser[] = [
  new GYGParser(),
  new BokunParser(),
  new TripDotComParser(),
]

const isPlaceholderName = (name?: string | null) => {
  if (!name) return true
  return /^(guest|customer|unknown|cancelled)$/i.test(name.trim())
}

const isPlaceholderEmail = (email?: string | null) => {
  if (!email) return true
  return /no-email@getyourguide\.com|cancelled@getyourguide\.com|no-email@unknown\.com/i.test(email.trim())
}

const isPlaceholderTourName = (name?: string | null, bookingRef?: string | null) => {
  if (!name) return true
  const cleaned = name.trim()
  if (!cleaned || cleaned.length < 3) return true
  if (bookingRef && cleaned.toLowerCase() === bookingRef.toLowerCase()) return true
  if (/^gyg[A-Z0-9]+$/i.test(cleaned)) return true
  if (/^S\d{4,}$/i.test(cleaned)) return true
  if (/getyourguide tour/i.test(cleaned)) return true
  if (/cancell?ation/i.test(cleaned)) return true
  if (/^(tour\s+language|language:)/i.test(cleaned)) return true
  return false
}

const extractNoteLine = (note: string | null | undefined, prefix: string) => {
  if (!note) return ''
  const lower = prefix.toLowerCase()
  const line = note.split('\n').find((entry) => entry.trim().toLowerCase().startsWith(lower))
  return line ? line.trim() : ''
}

/**
 * GET /api/bookings/[id]/reparse
 * Returns isBookingEmail=true emails that match the bookingRef
 */
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
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { bookingRef: true },
    })

    if (!booking?.bookingRef) {
      return NextResponse.json({ error: 'Booking reference not found' }, { status: 404 })
    }

    const emails = await prisma.emailInbox.findMany({
      where: {
        isBookingEmail: true,
        OR: [
          { subject: { contains: booking.bookingRef, mode: 'insensitive' } },
          { body: { contains: booking.bookingRef, mode: 'insensitive' } },
          { htmlBody: { contains: booking.bookingRef, mode: 'insensitive' } },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        errorMessage: true,
        bookingEmails: { select: { id: true } },
      },
    })

    return NextResponse.json({
      success: true,
      emails: emails.map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        receivedAt: e.receivedAt,
        errorMessage: e.errorMessage || null,
        bookingLinked: e.bookingEmails.length > 0,
      })),
    })
  } catch (error) {
    console.error('[API /bookings/[id]/reparse] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/bookings/[id]/reparse
 * Reparse selected emails and update booking details
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const bookingId = parseInt(id)
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    })

    if (!booking?.bookingRef) {
      return NextResponse.json({ error: 'Booking reference not found' }, { status: 404 })
    }

    const body = await req.json()
    const emailIds: string[] = Array.isArray(body?.emailIds) ? body.emailIds : []

    if (emailIds.length === 0) {
      return NextResponse.json({ error: 'No emails selected' }, { status: 400 })
    }

    const emails = await prisma.emailInbox.findMany({
      where: {
        id: { in: emailIds },
      },
      orderBy: { receivedAt: 'asc' },
    })

    let updated = 0
    let skipped = 0
    let errors = 0
    let sawCancel = false
    let sawUpdate = false
    let firstCancelReceivedAt: Date | null = null

    for (const email of emails) {
      try {
        // Hard guard: must contain bookingRef
        const rawText = `${email.subject}\n${email.body || ''}\n${email.htmlBody || ''}`
        if (!rawText.toLowerCase().includes(booking.bookingRef.toLowerCase())) {
          skipped++
          continue
        }

        const parser = parsers.find((p) =>
          p.canHandle(email.subject, email.from, email.htmlBody || email.body || '')
        )

        if (!parser) {
          skipped++
          continue
        }

        const parseResult = await parser.parse(
          email.subject,
          email.from,
          email.htmlBody || '',
          email.body || ''
        )

        if (!parseResult.success || !parseResult.booking) {
          errors++
          continue
        }

        const parsed = parseResult.booking

        // Ensure bookingRef matches the target booking
        if (parsed.bookingRef && parsed.bookingRef !== booking.bookingRef) {
          skipped++
          continue
        }

        const subjectLower = email.subject.toLowerCase()
        const isCancel =
          subjectLower.includes('cancel') ||
          parsed.tourName === 'CANCELLATION'
        const isUpdate =
          subjectLower.includes('detail change') ||
          subjectLower.includes('updated') ||
          subjectLower.includes('modified') ||
          subjectLower.includes('booking change') ||
          parsed.note?.includes('[UPDATE]')

        if (isCancel) sawCancel = true
        if (isUpdate) sawUpdate = true
        if (isCancel && !firstCancelReceivedAt) firstCancelReceivedAt = email.receivedAt

        const updateData: any = {}
        const changes: string[] = []

        // Allowed updates (safe mode)
        if (parsed.tourDate && parsed.tourDate.getTime() !== booking.tourDate.getTime()) {
          updateData.tourDate = parsed.tourDate
          changes.push(`Date: ${booking.tourDate.toISOString().split('T')[0]} → ${parsed.tourDate.toISOString().split('T')[0]}`)
        }

        if (parsed.tourTime && parsed.tourTime !== booking.tourTime) {
          updateData.tourTime = parsed.tourTime
          changes.push(`Time: ${booking.tourTime || 'N/A'} → ${parsed.tourTime}`)
        }

        if (typeof parsed.numberOfAdult === 'number' && parsed.numberOfAdult !== booking.numberOfAdult) {
          updateData.numberOfAdult = parsed.numberOfAdult
          changes.push(`Adults: ${booking.numberOfAdult} → ${parsed.numberOfAdult}`)
        }

        if (parsed.numberOfChild !== undefined && parsed.numberOfChild !== booking.numberOfChild) {
          updateData.numberOfChild = parsed.numberOfChild
          changes.push(`Children: ${booking.numberOfChild || 0} → ${parsed.numberOfChild}`)
        }

        if (parsed.mainContactName && !isPlaceholderName(parsed.mainContactName)) {
          if (isPlaceholderName(booking.mainContactName) || parsed.mainContactName !== booking.mainContactName) {
            updateData.mainContactName = parsed.mainContactName
            changes.push(`Contact name: ${booking.mainContactName} → ${parsed.mainContactName}`)
          }
        }

        if (parsed.mainContactEmail && !isPlaceholderEmail(parsed.mainContactEmail)) {
          if (isPlaceholderEmail(booking.mainContactEmail) || parsed.mainContactEmail !== booking.mainContactEmail) {
            updateData.mainContactEmail = parsed.mainContactEmail
            changes.push(`Contact email updated`)
          }
        }

        if (parsed.phoneNumber && parsed.phoneNumber !== booking.phoneNumber) {
          updateData.phoneNumber = parsed.phoneNumber
          changes.push(`Phone updated`)
        }

        if (parsed.pickupLocation && parsed.pickupLocation !== booking.pickupLocation) {
          updateData.pickupLocation = parsed.pickupLocation
          changes.push(`Pickup updated`)
        }

        if (parsed.meetingPoint && parsed.meetingPoint !== booking.meetingPoint) {
          updateData.meetingPoint = parsed.meetingPoint
          changes.push(`Meeting point updated`)
        }

        if (parsed.tourName && !isPlaceholderTourName(parsed.tourName, booking.bookingRef)) {
          if (isPlaceholderTourName(booking.tourName, booking.bookingRef) || parsed.tourName !== booking.tourName) {
            updateData.tourName = parsed.tourName
            changes.push(`Tour: ${booking.tourName || 'N/A'} → ${parsed.tourName}`)
          }
        }

        let mergedNote = (booking.note || '').trim()
        if (!mergedNote && parsed.note) {
          mergedNote = parsed.note.trim()
        } else if (parsed.note) {
          const parsedTourLine = extractNoteLine(parsed.note, 'Tour:')
          const parsedPackageLine = extractNoteLine(parsed.note, 'Package:')
          const additions: string[] = []
          if (parsedTourLine && !/^\s*Tour:/im.test(mergedNote)) {
            additions.push(parsedTourLine)
          }
          if (parsedPackageLine && !/^\s*Package:/im.test(mergedNote)) {
            additions.push(parsedPackageLine)
          }
          if (additions.length > 0) {
            mergedNote = [mergedNote, ...additions].filter(Boolean).join('\n')
          }
        }

        updateData.note = `${mergedNote}${mergedNote ? '\n\n' : ''}[REPARSE ${new Date().toISOString()}]${changes.length > 0 ? '\nChanges:\n- ' + changes.join('\n- ') : ''}`

        // Status handling
        if (isCancel) {
          updateData.status = 'CANCELLED'
          // Release driver + revert monthly rotation count (idempotent via audit log).
          if (booking.assignedDriverId) {
            await driverSuggestionService.revertDriverCountForCancellation({
              bookingId: booking.id,
              driverId: booking.assignedDriverId,
              assignedAt: booking.assignedAt,
              cancelledAt: email.receivedAt,
            })
            updateData.assignedDriverId = null
            updateData.assignedAt = null
          }
        } else if (isUpdate) {
          updateData.status = 'UPDATED'
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: updateData,
          })
          updated++
        } else {
          skipped++
        }
      } catch (error) {
        console.error('[Reparse] Error processing email:', error)
        errors++
      }
    }

    // Ensure final status if any update/cancel seen
    if (sawCancel) {
      const cancelledAt = firstCancelReceivedAt || new Date()
      const data: any = { status: 'CANCELLED' }
      if (booking.assignedDriverId) {
        await driverSuggestionService.revertDriverCountForCancellation({
          bookingId: booking.id,
          driverId: booking.assignedDriverId,
          assignedAt: booking.assignedAt,
          cancelledAt,
        })
        data.assignedDriverId = null
        data.assignedAt = null
      }
      await prisma.booking.update({ where: { id: booking.id }, data })
    } else if (sawUpdate) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'UPDATED' },
      })
    }

    await syncBookingStatus(prisma, booking.id)

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors,
    })
  } catch (error) {
    console.error('[API /bookings/[id]/reparse] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
