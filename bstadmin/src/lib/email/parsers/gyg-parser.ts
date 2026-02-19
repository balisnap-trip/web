import * as cheerio from 'cheerio'
import { EmailParser, EmailParseResult, ParsedBooking } from '@/types/email'
import { BookingSource } from '@prisma/client'
import { detectCurrencyFromText } from '@/lib/currency'

/**
 * Improved GetYourGuide Email Parser
 *
 * Improvements:
 * - Handle update emails ("Booking detail change")
 * - Fix date parsing (date-only, no timezone conversion)
 * - Better cancellation handling
 * - Garbage data validation
 * - Stricter email type detection
 */
export class GYGParser implements EmailParser {
  canHandle(subject: string, from: string, body: string): boolean {
    // Check if from GetYourGuide
    const isFromGYG = /getyourguide/i.test(from) || /partner-notification/i.test(from)

    // Check if subject contains the GYG product code (S497054) or booking keywords
    const hasGYGCode = /S497054/i.test(subject)
    const hasBookingKeyword = /booking/i.test(subject)

    return isFromGYG && (hasGYGCode || hasBookingKeyword)
  }

  async parse(
    subject: string,
    from: string,
    htmlBody: string,
    textBody: string
  ): Promise<EmailParseResult> {
    try {
      // Skip non-booking emails
      if (this.shouldSkip(subject)) {
        return {
          success: false,
          error: 'Email is not a booking notification',
        }
      }

      // Detect email type
      const emailType = this.detectEmailType(subject)

      if (emailType === 'cancellation') {
        return this.parseCancellation(subject, htmlBody, textBody)
      } else if (emailType === 'update') {
        return this.parseUpdate(subject, htmlBody, textBody)
      } else {
        return this.parseNewBooking(subject, htmlBody, textBody)
      }
    } catch (error) {
      console.error('[GYG Parser] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      }
    }
  }

  private shouldSkip(subject: string): boolean {
    const skipPatterns = [
      /invoice\s+is\s+ready/i,
      /your\s+invoice/i,
      /payment\s+details/i,
      /review\s+and\s+confirm/i,
      /update.*supplier.*terms/i,
      /fall.*product.*update/i,
      /spring.*product.*update/i,
      /offers\s+system/i,
      /monthly.*product.*update/i,
    ]

    return skipPatterns.some(pattern => pattern.test(subject))
  }

  private detectEmailType(subject: string): 'booking' | 'cancellation' | 'update' {
    if (/cancel/i.test(subject)) return 'cancellation'
    if (/detail\s+change|modified|updated|booking\s+change/i.test(subject)) return 'update'
    return 'booking'
  }

  /**
   * Parse cancellation email
   * Subject: "A booking has been canceled - S497054 - GYGABC123"
   */
  private parseCancellation(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    const bodyText = textBody || (htmlBody ? cheerio.load(htmlBody).text() : '') || ''
    // Extract booking reference from subject
    const refMatch = subject.match(/([A-Z0-9]{12})\s*$/i) || // At end of subject
                     bodyText.match(/Reference Number[:\s]+([A-Z0-9]{12})/i)

    const bookingRef = refMatch ? refMatch[1] : ''

    if (!bookingRef) {
      return {
        success: false,
        error: 'Could not extract booking reference from cancellation email',
      }
    }

    const nameMatch =
      bodyText.match(/Name[:\s]+([^\n\r]+)/i) ||
      bodyText.match(/Customer[:\s]+([^\n\r]+)/i)
    const emailMatch =
      bodyText.match(/Email[:\s]+([^\s@]+@[^\s@]+\.[^\s@]+)/i)

    const booking: ParsedBooking = {
      source: BookingSource.GYG,
      bookingRef,
      tourName: 'CANCELLATION',
      tourDate: new Date(),
      totalPrice: 0,
      currency: 'USD',
      numberOfAdult: 0,
      mainContactName: nameMatch ? nameMatch[1].trim() : 'Cancelled',
      mainContactEmail: emailMatch ? emailMatch[1].trim() : 'cancelled@getyourguide.com',
      note: `Cancellation email. Subject: ${subject}`,
    }

    return {
      success: true,
      booking,
    }
  }

  /**
   * Parse update/modification email
   * Subject: "Booking detail change: - S497054 - GYGABC123"
   */
  private parseUpdate(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    // For updates, we parse the full booking data with updated fields
    const result = this.parseNewBooking(subject, htmlBody, textBody)

    if (result.success && result.booking) {
      // Mark as update by adding to note
      result.booking.note = `[UPDATE] ${result.booking.note || ''}`
    }

    return result
  }

  /**
   * Parse new booking email
   */
  private parseNewBooking(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    const $ = cheerio.load(htmlBody || textBody)
    const htmlText = htmlBody ? $.text() : ''
    const bodyText = textBody || htmlText || ''

    // Extract relevant section
    let extractedText = bodyText
    const startMarker = 'Booking details'
    const endMarker = 'If you have any questions'

    const startPos = bodyText.indexOf(startMarker)
    const endPos = bodyText.indexOf(endMarker)

    if (startPos !== -1 && endPos !== -1) {
      extractedText = bodyText.substring(startPos, endPos)
    }

    // Extract booking reference
    const refMatch = extractedText.match(/Reference Number[:\s]+([A-Z0-9]{12})/i) ||
                     extractedText.match(/Booking reference[:\s]+([A-Z0-9]{12})/i) ||
                     subject.match(/Booking[:\s-]+([A-Z0-9]{12})/i) ||
                     subject.match(/([A-Z0-9]{12})\s*$/i)

    const bookingRef = refMatch ? refMatch[1] : `GYG-${Date.now()}`

    // Extract customer info with improved patterns
    const customerName = this.extractCustomerName(extractedText, htmlBody)

    // Validate: reject if looks like garbage (but allow update/change emails)
    if (this.isGarbageData(customerName, bookingRef, subject)) {
      const isUpdateEmail = /detail\s+change|booking\s+change|modified|updated/i.test(subject)
      const hasBookingRef = /[A-Z0-9]{12}/i.test(bookingRef) || /[A-Z0-9]{12}/i.test(subject)
      if (!isUpdateEmail || !hasBookingRef) {
        return {
          success: false,
          error: 'Email appears to be non-booking content',
        }
      }
    }

    // Extract tour name (GYG often includes package name in product text)
    const tourName =
      this.extractTourName(extractedText, htmlBody, subject, bodyText, htmlText) ||
      'GetYourGuide Tour'
    const packageName = this.extractPackageName(extractedText, htmlBody, bodyText, htmlText)

    // Extract date with improved parsing (date-only, no timezone)
    const tourDate = this.parseDateOnly(extractedText)

    // Extract time
    const tourTime = this.parseTime(extractedText)

    // Set customer name
    const mainContactName = customerName || 'Guest'

    const emailMatch = extractedText.match(/(?:Email|E-mail)[:\s]+([^\s@]+@[^\s@]+\.[^\s@]+)/i)
    const mainContactEmail = emailMatch ? emailMatch[1].trim() : 'no-email@getyourguide.com'

    const phoneMatch = extractedText.match(/(?:Phone|Mobile|Tel)[:\s]+([+\d\s\-()]+)/i)
    const phoneNumber = phoneMatch ? phoneMatch[1].trim() : undefined

    // Extract price
    const priceMatch = extractedText.match(/(?:Total|Price|Amount)[:\s]+[^\d]*([\d,]+\.?\d*)/i) ||
                       extractedText.match(/(?:Rp|IDR|USD|\$|€|£)\s*([\d,]+\.?\d*)/i)

    const totalPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0
    const currency = detectCurrencyFromText(extractedText)

    // Extract pax
    const { adults, children } = this.parsePax(extractedText)

    // Extract meeting point
    const meetingMatch = extractedText.match(/(?:Meeting Point|Pickup)[:\s]+(.+?)(?:\n|$)/i)
    const meetingPoint = meetingMatch ? meetingMatch[1].trim() : undefined

    const noteLines = [
      `Imported from GetYourGuide. Subject: ${subject}`,
      tourName ? `Tour: ${tourName}` : '',
      packageName ? `Package: ${packageName}` : '',
    ].filter(Boolean)

    const booking: ParsedBooking = {
      source: BookingSource.GYG,
      bookingRef,
      tourName,
      tourDate,
      tourTime,
      totalPrice,
      currency,
      numberOfAdult: adults,
      numberOfChild: children > 0 ? children : undefined,
      mainContactName,
      mainContactEmail,
      phoneNumber,
      meetingPoint,
      note: noteLines.join('\n'),
    }

    return {
      success: true,
      booking,
    }
  }

  /**
   * Parse date as date-only (CRITICAL FIX for timezone issue)
   */
  private parseDateOnly(text: string): Date {
    let dateMatch: RegExpMatchArray | null = null

    // Try format 1: DD/MM/YYYY or DD-MM-YYYY
    dateMatch = text.match(/(?:Date|Tour Date|Activity Date)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)

    if (!dateMatch) {
      dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
    }

    // Parse DD/MM/YYYY format
    if (dateMatch && /^\d+[\/\-]\d+/.test(dateMatch[1])) {
      const parts = dateMatch[1].split(/[\/\-]/)
      if (parts.length === 3) {
        const day = parseInt(parts[0])
        const month = parseInt(parts[1]) - 1 // JS months are 0-indexed
        const year = parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])
        return new Date(year, month, day)
      }
    }

    // Try format 2: "Monday, January 19, 2026" (verbose)
    dateMatch = text.match(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i)

    if (!dateMatch) {
      // Without day name: "January 19, 2026"
      dateMatch = text.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i)
    }

    // Parse verbose format
    if (dateMatch) {
      const cleaned = dateMatch[1].replace(/(\d+)(st|nd|rd|th)/, '$1')
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December']

      const pattern = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
      const match = cleaned.match(pattern) || cleaned.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i)

      if (match) {
        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === match[1].toLowerCase())
        const day = parseInt(match[2])
        const year = parseInt(match[3])

        if (monthIndex !== -1) {
          return new Date(year, monthIndex, day)
        }
      }
    }

    // Fallback
    console.warn('[GYG Parser] Could not parse date from text, using today')
    return new Date()
  }

  /**
   * Parse time from text
   */
  private parseTime(text: string): string | undefined {
    // Try various time patterns
    const patterns = [
      /(?:Time|Start Time)[:\s]+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i,
      /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i,
      /(?:^|\s)(\d{1,2}:\d{2})(?:\s|$|-)/i,
      /(\d{1,2}:\d{2})\s*-\s*\d{1,2}:\d{2}/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }

    return undefined
  }

  /**
   * Parse pax (adults + children)
   */
  private parsePax(text: string): { adults: number; children: number } {
    const normalized = text.replace(/\s+/g, ' ')

    // Adults
    const adultPatterns = [
      /(\d+)\s*x\s*(?:Adult|adults)/i,
      /(\d+)\s+(?:Adult|adults)/i,
      /Adults?\s*[:\-]\s*(\d+)/i,
      /(\d+)\s*(?:people|pax|travelers|travellers|guests)/i,
      /(?:Number of participants|Participants)\s*[:\-]?\s*(\d+)/i,
      /(\d+)\s*A(?:\s|,|$|\+)/i,
    ]

    let adults = 1
    for (const pattern of adultPatterns) {
      const match = normalized.match(pattern)
      if (match) {
        adults = parseInt(match[1])
        break
      }
    }

    // Children
    const childPatterns = [
      /(\d+)\s*(?:x\s*)?(?:Child|children)/i,
      /Children?\s*[:\-]\s*(\d+)/i,
      /(\d+)\s*C(?:\s|,|$)/i,
    ]

    let children = 0
    for (const pattern of childPatterns) {
      const match = normalized.match(pattern)
      if (match) {
        children = parseInt(match[1])
        break
      }
    }

    // If adults not explicitly found but total participants exists, derive adults
    const totalMatch = normalized.match(/(?:Number of participants|Participants)\s*[:\-]?\s*(\d+)/i)
    if (totalMatch) {
      const total = parseInt(totalMatch[1])
      if (!Number.isNaN(total)) {
        if (adults === 1 && children === 0) {
          adults = total
        } else if (children > 0 && total >= children && (adults === 1 || adults > total)) {
          adults = Math.max(total - children, 1)
        }
      }
    }

    return { adults, children }
  }

  /**
   * Extract customer name with improved patterns
   * ✅ FIX: Better handling for various GYG email formats
   *
   * GYG Email Format:
   * Main customer:
   * [Name]
   * [Email]
   * Language: [Lang]
   */
  private extractCustomerName(extractedText: string, htmlBody: string): string {
    const normalizedText = extractedText.replace(/\r/g, '')
    // Pattern 1: "Main customer" followed by name on NEXT line (with or without ':')
    const mainCustomerPatterns = [
      /Main customer[:\s]*\n+([^\n@]+)/i,
      /Main customer:\s*(?:\n+)?([^\n@]+)/i,
    ]
    for (const pattern of mainCustomerPatterns) {
      const match = normalizedText.match(pattern)
      if (match) {
        const name = this.normalizeNameCandidate(match[1].trim())
        const cleanName = this.sanitizeCustomerName(name)
        if (cleanName) return cleanName
      }
    }

    // Pattern 2: "Customer:" or "Name:" with name on same line
    const inlinePatterns = [
      /(?:Customer Name|Lead Traveler Name|Guest Name)[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
      /(?:Traveler Name)[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
      /(?:^|\n)Name[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
    ]

    for (const pattern of inlinePatterns) {
      const match = normalizedText.match(pattern)
      if (match) {
        const name = this.normalizeNameCandidate(match[1].trim())
        const cleanName = this.sanitizeCustomerName(name)
        if (cleanName) return cleanName
      }
    }

    // Pattern 3: Look for name pattern after "customer" word
    // Format: "customer: [space/newline] FirstName LastName"
    const namePattern = normalizedText.match(/customer[:\s]*\n+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
    if (namePattern) {
      const cleanName = this.sanitizeCustomerName(this.normalizeNameCandidate(namePattern[1].trim()))
      if (cleanName) return cleanName
    }

    // Fallback: try to extract from HTML
    if (htmlBody) {
      const $ = cheerio.load(htmlBody)
      let foundName = ''

      // Look for customer info in table rows
      $('tr').each((_, row) => {
        const label = $(row).find('td:first-child').text().trim()
        const value = $(row).find('td:last-child').text().trim()

        if (/customer|name|lead traveler/i.test(label) && value && !value.includes('@')) {
          const cleanName = this.sanitizeCustomerName(this.normalizeNameCandidate(value))
          if (cleanName) {
            foundName = cleanName
          }
          return false
        }
      })

      if (foundName) return foundName

      // As a last resort, scan full HTML text
      const htmlText = $.text().replace(/\r/g, '')
      const htmlMatch = htmlText.match(/Main customer:\s*(?:\n+)?([^\n@]+)/i)
      if (htmlMatch) {
        const cleanName = this.sanitizeCustomerName(this.normalizeNameCandidate(htmlMatch[1].trim()))
        if (cleanName) return cleanName
      }
    }

    return ''
  }

  /**
   * Extract tour/product name from GYG email text/HTML
   * GYG typically includes the package name within the product name.
   */
  private extractTourName(
    extractedText: string,
    htmlBody: string,
    subject: string,
    bodyText: string,
    htmlText: string
  ): string {
    const candidates: string[] = []
    if (htmlBody) {
      const $ = cheerio.load(htmlBody)
      const activityTitle = $('.activity-title').first().text().trim()
      if (activityTitle) candidates.push(activityTitle)
      const imgAlt = $('img[alt]').map((_, el) => $(el).attr('alt') || '').get().find(val => val && !/logo|icon/i.test(val))
      if (imgAlt) candidates.push(imgAlt.trim())
    }

    const textPatterns = [
      /offer has been booked[:\s]*\n+([^\n\r]+)/i,
      /offer has been booked[:\s]*([^\n\r]+)/i,
      /the following offer has been booked[:\s]*\n+([^\n\r]+)/i,
      /the following offer has been booked[:\s]*([^\n\r]+)/i,
      /your offer has been booked[:\s]*\n+([^\n\r]+)/i,
      /your offer has been booked[:\s]*([^\n\r]+)/i,
      /Product[:\s]+(.+?)(?:\n|$)/i,
      /Activity[:\s]+(.+?)(?:\n|$)/i,
      /Tour(?!\s*language)[:\s]+(.+?)(?:\n|$)/i,
      /Experience[:\s]+(.+?)(?:\n|$)/i,
      /Your product[:\s]+(.+?)(?:\n|$)/i,
    ]

    const sources = [extractedText, bodyText, htmlText]
    for (const source of sources) {
      if (!source) continue
      for (const pattern of textPatterns) {
        const match = source.match(pattern)
        if (match && match[1]) {
          candidates.push(match[1].trim())
        }
      }
    }

    if (htmlBody) {
      const $ = cheerio.load(htmlBody)
      $('tr').each((_, row) => {
        const label = $(row).find('td:first-child').text().trim()
        const value = $(row).find('td:last-child').text().trim()
        if (/(product|activity|tour|experience)/i.test(label) && value) {
          candidates.push(value)
        }
      })
    }

    // Subject fallback: only if it looks like a real name (not booking ref)
    const subjectMatch =
      subject.match(/Booking[:\s-]+(.+?)(?:\s*-\s*[A-Z0-9]{10,}|$)/i) ||
      subject.match(/New booking[:\s-]+(.+?)(?:\s*-\s*[A-Z0-9]{10,}|$)/i)
    if (subjectMatch && subjectMatch[1]) {
      candidates.push(subjectMatch[1].trim())
    }

    for (const candidate of candidates) {
      const clean = this.sanitizeTourName(candidate)
      if (clean) return clean
    }

    return ''
  }

  private sanitizeTourName(raw: string): string {
    let cleaned = raw.replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''

    // Avoid booking refs or product codes
    if (/^[A-Z0-9]{10,}$/i.test(cleaned)) return ''
    if (/^GYG[A-Z0-9]+$/i.test(cleaned)) return ''
    if (/^S\d{4,}$/i.test(cleaned)) return ''

    // Remove trailing labels or reference lines
    cleaned = cleaned.replace(/\b(Reference|Booking reference|Reference Number)\b.*$/i, '').trim()

    // Reject non-tour labels that sneak in (e.g., "Tour language")
    if (/^(tour\s+language|language:)/i.test(cleaned)) return ''

    if (cleaned.length < 3) return ''
    return cleaned
  }

  private extractPackageName(
    extractedText: string,
    htmlBody: string,
    bodyText: string,
    htmlText: string
  ): string {
    const candidates: string[] = []
    if (htmlBody) {
      const $ = cheerio.load(htmlBody)
      const optionTitleRaw = $('.activity-option-title').first().text().trim()
      if (optionTitleRaw) {
        const cleaned = optionTitleRaw.replace(/^Included:\s*/i, '').trim()
        candidates.push(cleaned || optionTitleRaw)
      }
    }

    const textPatterns = [
      /Included[:\s]+(.+?)(?:\n|$)/i,
      /Includes[:\s]+(.+?)(?:\n|$)/i,
      /Inclusions?[:\s]+(.+?)(?:\n|$)/i,
      /Option[:\s]+(.+?)(?:\n|$)/i,
    ]

    const sources = [extractedText, bodyText, htmlText]
    for (const source of sources) {
      if (!source) continue
      for (const pattern of textPatterns) {
        const match = source.match(pattern)
        if (match && match[1]) {
          candidates.push(match[1].trim())
        }
      }
    }

    if (htmlBody) {
      const $ = cheerio.load(htmlBody)
      $('tr').each((_, row) => {
        const label = $(row).find('td:first-child').text().trim()
        const value = $(row).find('td:last-child').text().trim()
        if (/(included|includes|inclusions)/i.test(label) && value) {
          candidates.push(value)
        }
      })
    }

    for (const candidate of candidates) {
      const clean = candidate.replace(/\s+/g, ' ').trim()
      if (clean.length >= 3) return clean
    }

    return ''
  }

  // Note: custom tags are only guidance; real emails won't contain them.

  /**
   * Normalize raw name candidates by removing emails or system IDs
   */
  private normalizeNameCandidate(raw: string): string {
    let cleaned = raw.replace(/\s+/g, ' ').replace(/[\[\]]/g, '').trim()
    if (!cleaned) return ''

    // Remove embedded emails and GYG customer identifiers
    cleaned = cleaned.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '').trim()
    cleaned = cleaned.replace(/\bcustomer-[^\s]+/gi, '').trim()

    // Stop at common label boundaries from GYG templates
    const stopMatch = cleaned.search(/\b(Language|Phone|Pickup|Meeting|Date|Booking reference|Reference|Participants|Number of participants|Tour|Activity)\b[:\s]/i)
    if (stopMatch > 0) {
      cleaned = cleaned.slice(0, stopMatch).trim()
    }

    // Remove dangling separators (unicode letters supported).
    // Keep trailing '.' so initials like "Elizabeth S." survive normalization.
    cleaned = cleaned
      .replace(/^[^\p{L}\p{M}]+/gu, '')
      .replace(/[^\p{L}\p{M}.]+$/gu, '')
      .replace(/\.{2,}$/g, '.')
      .trim()

    return cleaned
  }

  /**
   * Normalize and validate extracted customer names
   * Prevents long marketing/HTML blocks from being treated as names
   */
  private sanitizeCustomerName(raw: string): string {
    const normalized = raw.replace(/\s+/g, ' ').replace(/[\[\]]/g, '').trim()
    if (!normalized) return ''
    if (normalized.length < 2 || normalized.length > 60) return ''
    // Treat placeholders as invalid so extraction can continue to better candidates.
    if (/^(guest|customer|unknown|cancelled)$/i.test(normalized)) return ''
    const wordCount = normalized.split(' ').filter(Boolean).length
    if (wordCount > 6) return ''
    if (/@|http|www\./i.test(normalized)) return ''
    if (/\d{3,}/.test(normalized)) return ''
    if (
      /booking|reference|pickup|participants|language|contact customer|we would like to inform/i.test(normalized) ||
      /getyourguide|customer-|calendar/i.test(normalized)
    ) {
      return ''
    }
    return normalized
  }

  /**
   * Check if data is garbage (marketing email, etc.)
   */
  private isGarbageData(name: string, bookingRef: string, subject: string): boolean {
    // Check for generic names
    const genericPatterns = [
      /^guest$/i,
      /^customer$/i,
      /website/i,
      /support/i,
      /^notification$/i,  // Only reject if JUST "notification"
      /rating/i,
      /review/i,
      /feedback/i,
      /insights/i,
      /^marketing$/i,
      /dashboard/i,
    ]

    for (const pattern of genericPatterns) {
      if (pattern.test(name)) {
        return true
      }
    }

    // Check if name is too long (HTML content)
    if (name.length > 100) {
      return true
    }

    // Check if booking ref looks auto-generated (timestamp)
    if (bookingRef.startsWith('GYG-17')) { // GYG-1770150... = timestamp
      return true
    }

    // ✅ FIX: Accept "Booking detail change" as valid booking email
    const isBookingEmail =
      /booking/i.test(subject) ||
      /detail\s+change/i.test(subject)

    if (!isBookingEmail) {
      return true
    }

    return false
  }
}
