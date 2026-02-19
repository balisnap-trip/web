import { prisma } from '@/lib/db'
import { GYGParser } from './parsers/gyg-parser'
import { BokunParser } from './parsers/bokun-parser'
import { TripDotComParser } from './parsers/tripdotcom-parser'
import { EmailParser, ParsedBooking } from '@/types/email'
import { notifyBookingCancelled, notifyBookingUpdated } from '@/lib/notifications/booking-status-notifications'
import { syncBookingStatus } from '@/lib/booking/status'
import { driverSuggestionService } from '@/lib/services/driver-suggestion'
import { BookingSource, RelationType } from '@prisma/client'

/**
 * Booking Fetch Service (v2 - New Architecture)
 * Parses isBookingEmail=true emails and creates/updates bookings with relations
 */
export type FetchProgressCallback = (progress: {
  current: number
  total: number
  percentage: number
  status: string
}) => void

export class BookingFetchService {
  private parsers: EmailParser[]
  private progressCallback?: FetchProgressCallback
  private adminUserId: string | null = null
  private autoReparsed = new Set<number>()

  constructor(progressCallback?: FetchProgressCallback) {
    this.parsers = [
      new GYGParser(),
      new BokunParser(),
      new TripDotComParser(),
    ]

    this.progressCallback = progressCallback
  }

  /**
   * Get or create admin user for auto-imported bookings
   */
  private async getAdminUserId(): Promise<string> {
    if (this.adminUserId) return this.adminUserId

    const adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    })

    if (!adminUser) {
      throw new Error('No admin user found in database')
    }

    this.adminUserId = adminUser.id
    return this.adminUserId
  }

  private emitProgress(current: number, total: number, status: string) {
    if (this.progressCallback && total > 0) {
      const percentage = Math.round((current / total) * 100)
      this.progressCallback({ current, total, percentage, status })
    }
  }

  private isPlaceholderName(name?: string | null) {
    if (!name) return true
    return /^(guest|customer|unknown|cancelled)$/i.test(name.trim())
  }

  private isPlaceholderEmail(email?: string | null) {
    if (!email) return true
    return /no-email@getyourguide\.com|cancelled@getyourguide\.com|no-email@unknown\.com/i.test(email.trim())
  }

  /**
   * If a booking was created/updated with placeholder customer info,
   * attempt a lightweight reparse from related emails to fill missing fields.
   */
  private async autoReparseIfPlaceholder(bookingId: number): Promise<void> {
    if (this.autoReparsed.has(bookingId)) return
    this.autoReparsed.add(bookingId)

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    })

    if (!booking?.bookingRef) return
    if (!this.isPlaceholderName(booking.mainContactName) && !this.isPlaceholderEmail(booking.mainContactEmail)) {
      return
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
    })

    for (const email of emails) {
      const parser = this.parsers.find((p) =>
        p.canHandle(email.subject, email.from, email.htmlBody || email.body || '')
      )
      if (!parser) continue

      const parseResult = await parser.parse(
        email.subject,
        email.from,
        email.htmlBody || '',
        email.body || ''
      )

      if (!parseResult.success || !parseResult.booking) continue
      const parsed = parseResult.booking

      if (parsed.bookingRef && parsed.bookingRef !== booking.bookingRef) continue

      const updateData: any = {}
      const changes: string[] = []

      if (parsed.mainContactName && !this.isPlaceholderName(parsed.mainContactName)) {
        updateData.mainContactName = parsed.mainContactName
        changes.push(`Contact name: ${booking.mainContactName} → ${parsed.mainContactName}`)
      }

      if (parsed.mainContactEmail && !this.isPlaceholderEmail(parsed.mainContactEmail)) {
        updateData.mainContactEmail = parsed.mainContactEmail
        changes.push(`Contact email updated`)
      }

      if (Object.keys(updateData).length > 0) {
        updateData.note = `${booking.note || ''}\n\n[AUTO-REPARSE ${new Date().toISOString()}]${changes.length > 0 ? '\nChanges:\n- ' + changes.join('\n- ') : ''}`
        await prisma.booking.update({
          where: { id: booking.id },
          data: updateData,
        })
        break
      }
    }
  }

  /**
   * Fetch bookings from isBookingEmail=true emails
   * - manual: process all unlinked booking emails
   * - cron: process window starting from last processed booking email
   */
  async fetchBookings(options?: { mode?: 'manual' | 'cron' }): Promise<{
    processed: number
    created: number
    updated: number
    cancelled: number
    skipped: number
    errors: number
  }> {
    const mode = options?.mode ?? 'manual'
    console.log(`[Booking Fetch] Starting booking fetch (mode: ${mode})...`)

    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      errors: 0,
    }

    let unprocessedEmails
    if (mode === 'cron') {
      const maxBatch = Math.max(
        1,
        Number(process.env.CRON_BOOKING_FETCH_LIMIT || 200)
      )
      const unprocessedTotal = await prisma.emailInbox.count({
        where: {
          isBookingEmail: true,
          bookingEmails: { none: {} },
        },
      })

      unprocessedEmails = await prisma.emailInbox.findMany({
        where: {
          isBookingEmail: true,
          bookingEmails: { none: {} },
        },
        orderBy: { receivedAt: 'asc' },
        take: maxBatch,
      })
      console.log(
        `[Booking Fetch] Cron queue: ${unprocessedTotal} pending, processing ${unprocessedEmails.length}`
      )
    } else {
      // Manual: process all unlinked booking emails
      unprocessedEmails = await prisma.emailInbox.findMany({
        where: {
          isBookingEmail: true,
          bookingEmails: { none: {} },  // Not yet linked to any booking
        },
        orderBy: { receivedAt: 'asc' },
      })
    }

    console.log(`[Booking Fetch] Found ${unprocessedEmails.length} unprocessed booking emails`)

    if (unprocessedEmails.length === 0) {
      console.log('[Booking Fetch] No emails to process')
      return stats
    }

    this.emitProgress(0, unprocessedEmails.length, `Processing ${unprocessedEmails.length} emails...`)

    // Process each email
    for (let i = 0; i < unprocessedEmails.length; i++) {
      const email = unprocessedEmails[i]

      try {
        // Double-check (race condition protection)
        const alreadyProcessed = await prisma.bookingEmail.findFirst({
          where: { emailId: email.id },
        })

        if (alreadyProcessed) {
          console.log(`[Booking Fetch] Email ${email.id} already processed, skipping`)
          stats.skipped++
          continue
        }

        const result = await this.processEmail(email)

        stats.processed++
        if (result === 'created') stats.created++
        else if (result === 'updated') stats.updated++
        else if (result === 'cancelled') stats.cancelled++
        else if (result === 'skipped') stats.skipped++
        else stats.errors++

        this.emitProgress(i + 1, unprocessedEmails.length, `Processing email ${i + 1}/${unprocessedEmails.length}`)

        if ((i + 1) % 50 === 0) {
          console.log(`[Booking Fetch] Progress: ${i + 1}/${unprocessedEmails.length}`)
        }
      } catch (error) {
        console.error(`[Booking Fetch] Error processing email ${email.id}:`, error)
        stats.errors++

        // Log error to email
        await prisma.emailInbox.update({
          where: { id: email.id },
          data: {
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        })
      }
    }

    console.log('[Booking Fetch] Completed:', stats)
    return stats
  }

  /**
   * Process a single email
   */
  private async processEmail(
    email: { id: string; subject: string; from: string; body: string | null; htmlBody: string | null; source: BookingSource; receivedAt: Date }
  ): Promise<'created' | 'updated' | 'cancelled' | 'skipped' | 'error'> {
    // Find suitable parser
    const parser = this.parsers.find(p =>
      p.canHandle(email.subject, email.from, email.htmlBody || email.body || '')
    )

    if (!parser) {
      console.log(`[Booking Fetch] No parser found for: ${email.subject}`)
      await prisma.emailInbox.update({
        where: { id: email.id },
        data: { errorMessage: 'No suitable parser found' },
      })
      return 'error'
    }

    // Parse email
    const parseResult = await parser.parse(
      email.subject,
      email.from,
      email.htmlBody || '',
      email.body || ''
    )

    if (!parseResult.success || !parseResult.booking) {
      console.error(`[Booking Fetch] Parse failed: ${parseResult.error}`)
      await prisma.emailInbox.update({
        where: { id: email.id },
        data: { errorMessage: parseResult.error || 'Parse failed' },
      })
      return 'error'
    }

    const parsedBooking = parseResult.booking

    // Detect email type (NEW/UPDATE/CANCEL)
    const emailType = this.detectEmailType(email.subject, parsedBooking)

    // Handle based on type
    if (emailType === 'CANCEL') {
      return await this.handleCancellation(parsedBooking, email)
    } else if (emailType === 'UPDATE') {
      return await this.handleUpdate(parsedBooking, email)
    } else {
      return await this.handleNewBooking(parsedBooking, email)
    }
  }

  /**
   * Detect email type based on subject and parsed data
   */
  private detectEmailType(subject: string, parsedBooking: ParsedBooking): 'NEW' | 'UPDATE' | 'CANCEL' {
    const subjectLower = subject.toLowerCase()

    // Check for cancellation
    if (
      subjectLower.includes('cancel') ||
      parsedBooking.tourName === 'CANCELLATION'
    ) {
      return 'CANCEL'
    }

    // Check for update
    if (
      subjectLower.includes('updated') ||
      subjectLower.includes('detail change') ||
      subjectLower.includes('modified') ||
      parsedBooking.note?.includes('[UPDATE]')
    ) {
      return 'UPDATE'
    }

    // Default: new booking
    return 'NEW'
  }

  /**
   * Handle new booking email
   */
  private async handleNewBooking(
    parsedBooking: ParsedBooking,
    email: { id: string; source: BookingSource; receivedAt: Date }
  ): Promise<'created' | 'skipped'> {
    try {
      // Check if booking already exists (by bookingRef)
      const existing = await prisma.booking.findFirst({
        where: {
          bookingRef: parsedBooking.bookingRef,
          source: parsedBooking.source,
        },
      })

      if (existing) {
        console.log(`[Booking Fetch] Booking ${parsedBooking.bookingRef} already exists, skipping`)
        return 'skipped'
      }

      // Create booking
      const adminUserId = await this.getAdminUserId()
      const booking = await prisma.booking.create({
        data: {
          bookingRef: parsedBooking.bookingRef,
          source: parsedBooking.source,
          userId: adminUserId,  // Auto-import with admin user
          bookingDate: email.receivedAt,
          tourName: parsedBooking.tourName,
          tourDate: parsedBooking.tourDate,
          tourTime: parsedBooking.tourTime,
          totalPrice: parsedBooking.totalPrice,
          currency: parsedBooking.currency,
          numberOfAdult: parsedBooking.numberOfAdult,
          numberOfChild: parsedBooking.numberOfChild,
          mainContactName: parsedBooking.mainContactName,
          mainContactEmail: parsedBooking.mainContactEmail,
          phoneNumber: parsedBooking.phoneNumber || '',
          pickupLocation: parsedBooking.pickupLocation,
          meetingPoint: parsedBooking.meetingPoint,
          note: parsedBooking.note,
          status: 'NEW',
        },
      })

      // Create CREATED relation
      await prisma.bookingEmail.create({
        data: {
          bookingId: booking.id,
          emailId: email.id,
          relationType: RelationType.CREATED,
        },
      })

      // Auto-reparse if placeholder name/email
      if (this.isPlaceholderName(booking.mainContactName) || this.isPlaceholderEmail(booking.mainContactEmail)) {
        await this.autoReparseIfPlaceholder(booking.id)
      }

      console.log(`[Booking Fetch] ✅ Created booking: ${booking.bookingRef}`)
      return 'created'
    } catch (error) {
      console.error('[Booking Fetch] Error creating booking:', error)
      throw error
    }
  }

  /**
   * Handle update email
   */
  private async handleUpdate(
    update: ParsedBooking,
    email: { id: string; source: BookingSource; receivedAt: Date }
  ): Promise<'updated' | 'skipped' | 'created'> {
    try {
      // Find existing booking
      const booking = await prisma.booking.findFirst({
        where: {
          bookingRef: update.bookingRef,
          source: update.source,
        },
      })

      if (!booking) {
        console.log(`[Booking Fetch] Booking ${update.bookingRef} not found for update, creating as new`)
        return await this.handleNewBooking(update, email)
      }

      // Prepare update data (but keep CANCELLED status if already cancelled)
      const updateData: any = {}
      const changes: string[] = []

      if (update.tourDate && update.tourDate.getTime() !== booking.tourDate.getTime()) {
        updateData.tourDate = update.tourDate
        changes.push(`Date: ${booking.tourDate.toISOString().split('T')[0]} → ${update.tourDate.toISOString().split('T')[0]}`)
      }

      if (update.tourTime && update.tourTime !== booking.tourTime) {
        updateData.tourTime = update.tourTime
        changes.push(`Time: ${booking.tourTime || 'N/A'} → ${update.tourTime}`)
      }

      if (typeof update.numberOfAdult === 'number' && update.numberOfAdult !== booking.numberOfAdult) {
        updateData.numberOfAdult = update.numberOfAdult
        changes.push(`Adults: ${booking.numberOfAdult} → ${update.numberOfAdult}`)
      }

      if (update.numberOfChild !== undefined && update.numberOfChild !== booking.numberOfChild) {
        updateData.numberOfChild = update.numberOfChild
        changes.push(`Children: ${booking.numberOfChild || 0} → ${update.numberOfChild}`)
      }

      if (update.mainContactName && !this.isPlaceholderName(update.mainContactName)) {
        if (this.isPlaceholderName(booking.mainContactName) || update.mainContactName !== booking.mainContactName) {
          updateData.mainContactName = update.mainContactName
          changes.push(`Contact name: ${booking.mainContactName} → ${update.mainContactName}`)
        }
      }

      if (update.mainContactEmail && !this.isPlaceholderEmail(update.mainContactEmail)) {
        if (this.isPlaceholderEmail(booking.mainContactEmail) || update.mainContactEmail !== booking.mainContactEmail) {
          updateData.mainContactEmail = update.mainContactEmail
          changes.push(`Contact email updated`)
        }
      }

      if (update.phoneNumber) {
        if (!booking.phoneNumber || update.phoneNumber !== booking.phoneNumber) {
          updateData.phoneNumber = update.phoneNumber
          changes.push(`Phone updated`)
        }
      }

      if (update.pickupLocation) {
        if (update.pickupLocation !== booking.pickupLocation) {
          updateData.pickupLocation = update.pickupLocation
          changes.push(`Pickup updated`)
        }
      }

      if (update.meetingPoint) {
        if (update.meetingPoint !== booking.meetingPoint) {
          updateData.meetingPoint = update.meetingPoint
          changes.push(`Meeting point updated`)
        }
      }

      // Only set status to UPDATED if not CANCELLED
      if (booking.status !== 'CANCELLED') {
        updateData.status = 'UPDATED'
      }

      // Track changes in note
      updateData.note = `${booking.note || ''}\n\n[UPDATE ${new Date().toISOString()}]${changes.length > 0 ? '\nChanges:\n- ' + changes.join('\n- ') : ''}`

      // Update booking
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: updateData,
      })

      // Create UPDATED relation
      await prisma.bookingEmail.create({
        data: {
          bookingId: booking.id,
          emailId: email.id,
          relationType: RelationType.UPDATED,
        },
      })

      // Auto-reparse if placeholder name/email
      if (this.isPlaceholderName(updatedBooking.mainContactName) || this.isPlaceholderEmail(updatedBooking.mainContactEmail)) {
        await this.autoReparseIfPlaceholder(updatedBooking.id)
      }

      await notifyBookingUpdated({
        bookingId: updatedBooking.id,
        bookingRef: updatedBooking.bookingRef,
        source: updatedBooking.source,
        tourDate: updatedBooking.tourDate,
      })
      await syncBookingStatus(prisma, updatedBooking.id)

      console.log(`[Booking Fetch] ✅ Updated booking: ${booking.bookingRef}`)
      return 'updated'
    } catch (error) {
      console.error('[Booking Fetch] Error updating booking:', error)
      throw error
    }
  }

  /**
   * Handle cancellation email
   */
  private async handleCancellation(
    cancellation: ParsedBooking,
    email: { id: string; source: BookingSource; receivedAt: Date }
  ): Promise<'cancelled' | 'skipped'> {
    try {
      // Find existing booking
      const booking = await prisma.booking.findFirst({
        where: {
          bookingRef: cancellation.bookingRef,
          source: cancellation.source,
        },
      })

      if (!booking) {
        // Cancel-before-booking scenario: Create booking directly as CANCELLED
        console.log(`[Booking Fetch] Booking ${cancellation.bookingRef} not found, creating as CANCELLED`)

        const adminUserId = await this.getAdminUserId()
        const cancelledBooking = await prisma.booking.create({
          data: {
            bookingRef: cancellation.bookingRef,
            source: cancellation.source,
            userId: adminUserId,
            bookingDate: email.receivedAt,
            tourName: cancellation.tourName || 'Cancelled Booking',
            tourDate: cancellation.tourDate || new Date(),
            totalPrice: 0,
            currency: cancellation.currency || 'USD',
            numberOfAdult: cancellation.numberOfAdult || 0,
            mainContactName: cancellation.mainContactName || 'Unknown',
            mainContactEmail: cancellation.mainContactEmail || 'no-email@unknown.com',
            status: 'CANCELLED',
            note: 'Booking created from cancellation email - booking email not received',
          },
        })

        await prisma.bookingEmail.create({
          data: {
            bookingId: cancelledBooking.id,
            emailId: email.id,
            relationType: RelationType.CANCELLED,
          },
        })

        // Auto-reparse if placeholder name/email
        if (this.isPlaceholderName(cancelledBooking.mainContactName) || this.isPlaceholderEmail(cancelledBooking.mainContactEmail)) {
          await this.autoReparseIfPlaceholder(cancelledBooking.id)
        }

        await notifyBookingCancelled({
          bookingId: cancelledBooking.id,
          bookingRef: cancelledBooking.bookingRef,
          source: cancelledBooking.source,
          tourDate: cancelledBooking.tourDate,
        })
        await syncBookingStatus(prisma, cancelledBooking.id)

        console.log(`[Booking Fetch] ✅ Created CANCELLED booking: ${cancelledBooking.bookingRef}`)
        return 'cancelled'
      }

      const updateData: any = {
        status: 'CANCELLED',
        assignedDriverId: null,  // Release driver
        assignedAt: null,
        note: `${booking.note || ''}\n\n[CANCELLED ${new Date().toISOString()}]`,
      }

      if (cancellation.mainContactName && !this.isPlaceholderName(cancellation.mainContactName)) {
        if (this.isPlaceholderName(booking.mainContactName)) {
          updateData.mainContactName = cancellation.mainContactName
        }
      }

      if (cancellation.mainContactEmail && !this.isPlaceholderEmail(cancellation.mainContactEmail)) {
        if (this.isPlaceholderEmail(booking.mainContactEmail)) {
          updateData.mainContactEmail = cancellation.mainContactEmail
        }
      }

      // Normal cancellation: Update existing booking
      const oldDriverId = booking.assignedDriverId
      const oldAssignedAt = booking.assignedAt
      if (oldDriverId) {
        await driverSuggestionService.revertDriverCountForCancellation({
          bookingId: booking.id,
          driverId: oldDriverId,
          assignedAt: oldAssignedAt,
          cancelledAt: email.receivedAt,
        })
      }

      const cancelledBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: updateData,
      })

      // Create CANCELLED relation
      await prisma.bookingEmail.create({
        data: {
          bookingId: booking.id,
          emailId: email.id,
          relationType: RelationType.CANCELLED,
        },
      })

      // Auto-reparse if placeholder name/email
      if (this.isPlaceholderName(cancelledBooking.mainContactName) || this.isPlaceholderEmail(cancelledBooking.mainContactEmail)) {
        await this.autoReparseIfPlaceholder(cancelledBooking.id)
      }

      await notifyBookingCancelled({
        bookingId: cancelledBooking.id,
        bookingRef: cancelledBooking.bookingRef,
        source: cancelledBooking.source,
        tourDate: cancelledBooking.tourDate,
      })
      await syncBookingStatus(prisma, cancelledBooking.id)

      console.log(`[Booking Fetch] ✅ Cancelled booking: ${booking.bookingRef}`)
      return 'cancelled'
    } catch (error) {
      console.error('[Booking Fetch] Error cancelling booking:', error)
      throw error
    }
  }
}

/**
 * Get singleton instance
 */
let fetchService: BookingFetchService | null = null

export function getBookingFetchService(progressCallback?: FetchProgressCallback): BookingFetchService {
  if (!fetchService || progressCallback) {
    fetchService = new BookingFetchService(progressCallback)
  }
  return fetchService
}
