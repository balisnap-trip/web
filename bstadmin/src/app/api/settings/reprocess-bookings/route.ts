import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { GYGParser } from '@/lib/email/parsers/gyg-parser'
import { BokunParser } from '@/lib/email/parsers/bokun-parser'
import { TripDotComParser } from '@/lib/email/parsers/tripdotcom-parser'
import { EmailParser } from '@/types/email'
import { syncAllBookingStatuses } from '@/lib/booking/status'
import { driverSuggestionService } from '@/lib/services/driver-suggestion'

const parsers: EmailParser[] = [
  new GYGParser(),
  new BokunParser(),
  new TripDotComParser(),
]

const isPlaceholderName = (name?: string | null) => {
  if (!name) return true
  return /^(guest|customer|costumer|unknown|cancelled)$/i.test(name.trim())
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
 * POST /api/settings/reprocess-bookings
 * Reparse bookings from related emails (all sources) and update safe fields.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const limit = typeof body?.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : null
    const sinceDays = typeof body?.sinceDays === 'number' && body.sinceDays > 0 ? Math.floor(body.sinceDays) : null

    const where: any = {}
    if (sinceDays) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
      where.updatedAt = { gte: since }
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    })

    let processed = 0
    let updated = 0
    let skipped = 0
    let errors = 0

    for (const booking of bookings) {
      processed++
      if (!booking.bookingRef) {
        skipped++
        continue
      }

      // Track the "current" view so we don't create redundant updates when multiple emails are applied.
      let currentBooking: any = booking

      const emails = await prisma.emailInbox.findMany({
        where: {
          isBookingEmail: true,
          OR: [
            { subject: { contains: booking.bookingRef, mode: 'insensitive' } },
            { body: { contains: booking.bookingRef, mode: 'insensitive' } },
            { htmlBody: { contains: booking.bookingRef, mode: 'insensitive' } },
          ],
        },
        orderBy: { receivedAt: 'asc' },
      })

      if (emails.length === 0) {
        skipped++
        continue
      }

      let sawCancel = false
      let sawUpdate = false
      let firstCancelReceivedAt: Date | null = null
      let madeChanges = false

      for (const email of emails) {
        try {
          const rawText = `${email.subject}\n${email.body || ''}\n${email.htmlBody || ''}`
          if (!rawText.toLowerCase().includes(booking.bookingRef.toLowerCase())) {
            continue
          }

          const parser = parsers.find((p) =>
            p.canHandle(email.subject, email.from, email.htmlBody || email.body || '')
          )
          if (!parser) {
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

          if (parsed.bookingRef && parsed.bookingRef !== booking.bookingRef) {
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

          if (parsed.tourDate && parsed.tourDate.getTime() !== currentBooking.tourDate.getTime()) {
            updateData.tourDate = parsed.tourDate
            changes.push(`Date: ${currentBooking.tourDate.toISOString().split('T')[0]} → ${parsed.tourDate.toISOString().split('T')[0]}`)
          }

          if (parsed.tourTime && parsed.tourTime !== currentBooking.tourTime) {
            updateData.tourTime = parsed.tourTime
            changes.push(`Time: ${currentBooking.tourTime || 'N/A'} → ${parsed.tourTime}`)
          }

          if (typeof parsed.numberOfAdult === 'number' && parsed.numberOfAdult !== currentBooking.numberOfAdult) {
            updateData.numberOfAdult = parsed.numberOfAdult
            changes.push(`Adults: ${currentBooking.numberOfAdult} → ${parsed.numberOfAdult}`)
          }

          if (parsed.numberOfChild !== undefined && parsed.numberOfChild !== currentBooking.numberOfChild) {
            updateData.numberOfChild = parsed.numberOfChild
            changes.push(`Children: ${currentBooking.numberOfChild || 0} → ${parsed.numberOfChild}`)
          }

          if (parsed.mainContactName && !isPlaceholderName(parsed.mainContactName)) {
            if (isPlaceholderName(currentBooking.mainContactName) || parsed.mainContactName !== currentBooking.mainContactName) {
              updateData.mainContactName = parsed.mainContactName
              changes.push(`Contact name: ${currentBooking.mainContactName} → ${parsed.mainContactName}`)
            }
          }

          if (parsed.mainContactEmail && !isPlaceholderEmail(parsed.mainContactEmail)) {
            if (isPlaceholderEmail(currentBooking.mainContactEmail) || parsed.mainContactEmail !== currentBooking.mainContactEmail) {
              updateData.mainContactEmail = parsed.mainContactEmail
              changes.push(`Contact email updated`)
            }
          }

          if (parsed.phoneNumber && parsed.phoneNumber !== currentBooking.phoneNumber) {
            updateData.phoneNumber = parsed.phoneNumber
            changes.push(`Phone updated`)
          }

          if (parsed.pickupLocation && parsed.pickupLocation !== currentBooking.pickupLocation) {
            updateData.pickupLocation = parsed.pickupLocation
            changes.push(`Pickup updated`)
          }

          if (parsed.meetingPoint && parsed.meetingPoint !== currentBooking.meetingPoint) {
            updateData.meetingPoint = parsed.meetingPoint
            changes.push(`Meeting point updated`)
          }

          if (parsed.tourName && !isPlaceholderTourName(parsed.tourName, currentBooking.bookingRef)) {
            if (isPlaceholderTourName(currentBooking.tourName, currentBooking.bookingRef) || parsed.tourName !== currentBooking.tourName) {
              updateData.tourName = parsed.tourName
              changes.push(`Tour: ${currentBooking.tourName || 'N/A'} → ${parsed.tourName}`)
            }
          }

          // Merge useful "Tour:" and "Package:" lines into note (parsers include them there).
          let mergedNote = (currentBooking.note || '').trim()
          if (!mergedNote && parsed.note) {
            mergedNote = parsed.note.trim()
          } else if (parsed.note) {
            const parsedTourLine = extractNoteLine(parsed.note, 'Tour:')
            const parsedPackageLine = extractNoteLine(parsed.note, 'Package:')
            const additions: string[] = []
            if (parsedTourLine && !/^\s*Tour:/im.test(mergedNote)) additions.push(parsedTourLine)
            if (parsedPackageLine && !/^\s*Package:/im.test(mergedNote)) additions.push(parsedPackageLine)
            if (additions.length > 0) mergedNote = [mergedNote, ...additions].filter(Boolean).join('\n')
          }

          const nextNote = `${mergedNote}${mergedNote ? '\n\n' : ''}[REPROCESS ${new Date().toISOString()}]${changes.length > 0 ? '\nChanges:\n- ' + changes.join('\n- ') : ''}`
          if (nextNote !== (currentBooking.note || '')) {
            updateData.note = nextNote
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.booking.update({
              where: { id: booking.id },
              data: updateData,
            })
            currentBooking = { ...currentBooking, ...updateData }
            madeChanges = true
          }
        } catch (error) {
          console.error('[Reprocess] Error processing email:', error)
          errors++
        }
      }

      if (sawCancel) {
        const cancelledAt = firstCancelReceivedAt || new Date()
        const current = await prisma.booking.findUnique({
          where: { id: booking.id },
          select: { assignedDriverId: true, assignedAt: true },
        })

        const data: any = { status: 'CANCELLED' }
        if (current?.assignedDriverId) {
          await driverSuggestionService.revertDriverCountForCancellation({
            bookingId: booking.id,
            driverId: current.assignedDriverId,
            assignedAt: current.assignedAt,
            cancelledAt,
          })
          data.assignedDriverId = null
          data.assignedAt = null
        }

        await prisma.booking.update({ where: { id: booking.id }, data })
        madeChanges = true
      } else if (sawUpdate) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'UPDATED' },
        })
        madeChanges = true
      }

      if (madeChanges) {
        updated++
      } else {
        skipped++
      }
    }

    await syncAllBookingStatuses(prisma)

    return NextResponse.json({
      success: true,
      processed,
      updated,
      skipped,
      errors,
    })
  } catch (error) {
    console.error('[API /settings/reprocess-bookings] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
