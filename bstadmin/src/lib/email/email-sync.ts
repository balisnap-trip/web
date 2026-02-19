import { prisma } from '@/lib/db'
import { ImapEmailClient, RawEmail, createGYGClient, createOTAClient } from './imap-client'
import { BookingSource } from '@prisma/client'

/**
 * Email Synchronization Service
 * Pulls emails from IMAP and stores them in database (no parsing)
 */
export type SyncProgressCallback = (progress: {
  current: number
  total: number
  percentage: number
  account: string
  status: string
}) => void

export class EmailSyncService {
  private progressCallback?: SyncProgressCallback

  constructor(progressCallback?: SyncProgressCallback) {
    this.progressCallback = progressCallback
  }

  private emitProgress(current: number, total: number, account: string, status: string) {
    if (this.progressCallback && total > 0) {
      const percentage = Math.round((current / total) * 100)
      this.progressCallback({ current, total, percentage, account, status })
    }
  }

  /**
   * Synchronize emails from IMAP to database
   * - manual: fetch ALL emails in inbox (full sync)
   * - cron: fetch only new emails since last sync (incremental)
   */
  async syncEmails(options?: { mode?: 'manual' | 'cron' }): Promise<{
    fetched: number
    stored: number
    skipped: number
    failed: number
  }> {
    const mode = options?.mode ?? 'manual'
    console.log(`[Email Sync] Starting email synchronization (mode: ${mode})...`)

    const stats = {
      fetched: 0,
      stored: 0,
      skipped: 0,
      failed: 0,
    }

    let since: Date | undefined
    if (mode === 'cron') {
      const last = await prisma.emailInbox.findFirst({
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      })
      since = last?.receivedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
      console.log(`[Email Sync] Cron mode - fetching emails since: ${since.toISOString()}`)
    } else {
      console.log(`[Email Sync] Manual mode - fetching ALL emails (no limit)`)
    }

    // Sync GYG account
    try {
      const gygStats = await this.syncAccount('GYG', createGYGClient(), { mode, since })
      stats.fetched += gygStats.fetched
      stats.stored += gygStats.stored
      stats.skipped += gygStats.skipped
      stats.failed += gygStats.failed
    } catch (error) {
      console.error('[Email Sync] Error syncing GYG account:', error)
      stats.failed++
    }

    // Sync OTA account (Bokun + Trip.com)
    try {
      const otaStats = await this.syncAccount('OTA', createOTAClient(), { mode, since })
      stats.fetched += otaStats.fetched
      stats.stored += otaStats.stored
      stats.skipped += otaStats.skipped
      stats.failed += otaStats.failed
    } catch (error) {
      console.error('[Email Sync] Error syncing OTA account:', error)
      stats.failed++
    }

    console.log('[Email Sync] Completed:', {
      ...stats,
      mode,
      timestamp: new Date().toISOString(),
    })
    return stats
  }

  /**
   * Sync emails from a single account
   */
  private async syncAccount(
    accountName: string,
    client: ImapEmailClient,
    options: { mode: 'manual' | 'cron'; since?: Date }
  ): Promise<{
    fetched: number
    stored: number
    skipped: number
    failed: number
  }> {
    const stats = {
      fetched: 0,
      stored: 0,
      skipped: 0,
      failed: 0,
    }

    try {
      await client.connect()
      this.emitProgress(0, 100, accountName, 'Connected. Fetching emails from server...')

      const emails =
        options.mode === 'manual'
          ? await client.fetchAllEmails() // No limit - fetch ALL emails
          : await client.fetchEmailsSince(options.since!, 50) // Cron: only recent emails (limit 50)

      stats.fetched = emails.length
      console.log(`[${accountName}] Fetched ${emails.length} emails (mode: ${options.mode})`)

      if (emails.length === 0) {
        this.emitProgress(0, 0, accountName, 'No emails to sync')
        await client.disconnect()
        return stats
      }

      this.emitProgress(0, emails.length, accountName, `Fetched ${emails.length} emails. Storing to database...`)

      // Store each email to database
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i]
        try {
          const result = await this.storeEmail(email, client)

          if (result === 'stored') {
            stats.stored++
          } else if (result === 'skipped') {
            stats.skipped++
          } else {
            stats.failed++
          }

          // Emit progress update
          this.emitProgress(i + 1, emails.length, accountName, `Storing email ${i + 1}/${emails.length}`)

          // Log progress for large batches
          if ((i + 1) % 100 === 0) {
            console.log(`[${accountName}] Progress: ${i + 1}/${emails.length} emails stored`)
          }
        } catch (error) {
          console.error(`[${accountName}] Error storing email ${email.messageId}:`, error)
          stats.failed++
        }
      }

      await client.disconnect()

      console.log(`[${accountName}] Sync stats - Stored: ${stats.stored}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`)
    } catch (error) {
      console.error(`[${accountName}] Account sync error:`, error)
      throw error
    }

    return stats
  }

  /**
   * Detect if email is a booking email based on sender and subject analysis
   * ✅ IMPROVED: Better filtering to exclude marketing/notification emails
   */
  private detectBookingEmail(from: string, subject: string): boolean {
    const fromLower = from.toLowerCase()
    const subjectLower = subject.toLowerCase()

    // ❌ EXCLUDE: Marketing/promotional email addresses
    const isMarketingEmail =
      fromLower.includes('marketing@') ||
      fromLower.includes('news@') ||
      fromLower.includes('email@t1.') ||
      fromLower.includes('support@bokun') ||
      fromLower.includes('noreply@email.')

    if (isMarketingEmail) {
      return false
    }

    // ✅ CHECK: Must be from OTA notification addresses
    const isFromOTANotification =
      /no-reply@bokun\.io/i.test(from) ||
      /do-not-reply@notification\.getyourguide\.com/i.test(from) ||
      /partner-notification.*getyourguide/i.test(from) ||
      /booking@trip\.com/i.test(from) ||
      /reservation@.*viator/i.test(from)

    if (!isFromOTANotification) {
      // Not from booking notification address = likely marketing
      return false
    }

    // ✅ CHECK: Must have SPECIFIC booking notification patterns
    const hasSpecificBookingPattern =
      /new booking:/i.test(subject) ||
      /updated booking:/i.test(subject) ||
      /cancelled booking:/i.test(subject) ||
      /booking detail change:/i.test(subject) ||
      /booking has been/i.test(subject) ||
      /booking\s*-\s*S\d+\s*-\s*[A-Z0-9]{12}/i.test(subject) ||  // "Booking - S497054 - GYG..."
      /\(BAL-T\d+\).*ext\.\s*booking\s*ref/i.test(subject)  // "(BAL-T123) Ext. booking ref"

    if (!hasSpecificBookingPattern) {
      return false
    }

    // ❌ EXCLUDE: Marketing/promotional keywords (even if from OTA)
    const hasMarketingKeywords =
      /more bookings|boost.*bookings|increase.*bookings/i.test(subject) ||
      /direct bookings|drive more|supercharge/i.test(subject) ||
      /guide to|playbook|tips|how to/i.test(subject) ||
      /approved and ready|congrats|your key to/i.test(subject) ||
      /coming soon|discover|capture.*opportunity/i.test(subject) ||
      /start here|automate|optimise/i.test(subject) ||
      /first booking|got your first/i.test(subject) ||
      /bookings are on the way|time for bookings/i.test(subject) ||
      /just a few clicks away/i.test(subject)

    if (hasMarketingKeywords) {
      return false
    }

    // ❌ EXCLUDE: Other non-booking content
    const isNonBooking =
      /invoice/i.test(subject) ||
      /payment/i.test(subject) ||
      /review/i.test(subject) ||
      /rating/i.test(subject) ||
      /feedback/i.test(subject) ||
      /newsletter/i.test(subject) ||
      /supplier.*terms/i.test(subject) ||
      /product.*update/i.test(subject) ||
      /performance marketing/i.test(subject) ||
      /website widgets/i.test(subject)

    if (isNonBooking) {
      return false
    }

    // ✅ All checks passed = this is a booking email
    return true
  }

  /**
   * Store a single email to database (no parsing)
   */
  private async storeEmail(
    email: RawEmail,
    client: ImapEmailClient
  ): Promise<'stored' | 'skipped' | 'failed'> {
    try {
      // Check if email already exists
      const existing = await prisma.emailInbox.findUnique({
        where: { messageId: email.messageId },
      })

      if (existing) {
        console.log(`[Email Sync] Email ${email.messageId} already exists, skipping`)
        return 'skipped'
      }

      // Determine source based on sender
      let source: BookingSource = BookingSource.MANUAL
      if (/getyourguide|partner-notification/i.test(email.from)) {
        source = BookingSource.GYG
      } else if (/bokun|viator/i.test(email.from)) {
        // Bokun manages multiple OTA channels; store inbox source as BOKUN.
        source = BookingSource.BOKUN
      } else if (/trip\.com/i.test(email.from)) {
        source = BookingSource.TRIPDOTCOM
      }

      // Detect if this is a booking email (analyze sender + subject)
      const isBookingEmail = this.detectBookingEmail(email.from, email.subject)

      // Store raw email to database
      await prisma.emailInbox.create({
        data: {
          messageId: email.messageId,
          subject: email.subject,
          from: email.from,
          to: email.to,
          receivedAt: email.date,
          body: email.text,
          htmlBody: email.html,
          isBookingEmail: isBookingEmail,  // Classification (admin can toggle later)
          source: source,
        },
      })

      // Mark as read on IMAP server
      await client.markAsRead(email.uid)

      console.log(`[Email Sync] Stored email: ${email.subject}`)
      return 'stored'
    } catch (error) {
      console.error(`[Email Sync] Error storing email ${email.messageId}:`, error)
      return 'failed'
    }
  }
}

/**
 * Get singleton instance
 */
let syncService: EmailSyncService | null = null

export function getEmailSyncService(progressCallback?: SyncProgressCallback): EmailSyncService {
  if (!syncService || progressCallback) {
    syncService = new EmailSyncService(progressCallback)
  }
  return syncService
}
