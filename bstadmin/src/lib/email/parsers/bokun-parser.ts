import * as cheerio from 'cheerio'
import { EmailParser, EmailParseResult, ParsedBooking } from '@/types/email'
import { BookingSource } from '@prisma/client'
import { detectCurrencyFromText } from '@/lib/currency'

/**
 * Improved Bokun Email Parser (Viator + other OTA channels)
 *
 * Improvements:
 * - Extract actual Viator booking ref (VIA-XXXXXXXX) from subject
 * - Handle cancellations (status: CANCELLATION)
 * - Handle updates (status: UPDATE)
 * - Fix date timezone (parse as date-only, no timezone conversion)
 * - Better email type validation
 */
export class BokunParser implements EmailParser {
  canHandle(subject: string, from: string, body: string): boolean {
    const isFromBokun = /bokun\.io/i.test(from) || /viator/i.test(from)

    // Check if it's a booking-related email (not marketing/notification)
    const isBookingEmail =
      /new booking:/i.test(subject) ||
      /cancelled booking:/i.test(subject) ||
      /updated booking:/i.test(subject)

    return isFromBokun && isBookingEmail
  }

  async parse(
    subject: string,
    from: string,
    htmlBody: string,
    textBody: string
  ): Promise<EmailParseResult> {
    try {
      // Detect email type
      const emailType = this.detectEmailType(subject)

      if (emailType === 'cancellation') {
        return this.parseCancellation(subject, htmlBody, textBody)
      } else if (emailType === 'update') {
        return this.parseUpdate(subject, htmlBody, textBody)
      } else {
        return this.parseBooking(subject, htmlBody, textBody)
      }
    } catch (error) {
      console.error('[Bokun Parser] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      }
    }
  }

  private detectEmailType(subject: string): 'booking' | 'cancellation' | 'update' {
    if (/cancel/i.test(subject)) return 'cancellation'
    if (/update/i.test(subject)) return 'update'
    return 'booking'
  }

  /**
   * Parse cancellation email
   * Subject format: "Cancelled booking: Sun 3.May '26 @ 08:00 (BAL-T120267176) Ext. booking ref: 1358680505"
   */
  private parseCancellation(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    // Extract Viator booking ref from subject
    const bookingRef = this.extractViatorRef(subject, htmlBody + textBody)
    const source = this.detectSource(subject, htmlBody + textBody, bookingRef)

    if (!bookingRef) {
      return {
        success: false,
        error: 'Could not extract Viator booking reference from cancellation email',
      }
    }

    const booking: ParsedBooking = {
      source,
      bookingRef,
      tourName: 'CANCELLATION',
      tourDate: new Date(),
      totalPrice: 0,
      currency: 'USD',
      numberOfAdult: 0,
      mainContactName: 'Cancelled',
      mainContactEmail: 'cancelled@viator.com',
      note: `Cancellation email. Subject: ${subject}`,
    }

    return {
      success: true,
      booking,
    }
  }

  /**
   * Parse update/modification email
   * Subject format: "Updated booking: Fri 5.Jun '26 @ 08:00 (BAL-T118223237) Ext. booking ref: 1358626084"
   */
  private parseUpdate(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    // For updates, we parse the full booking data with updated fields
    const result = this.parseBookingTable(subject, htmlBody, textBody)

    if (result.success && result.booking) {
      // Mark as update by adding to note
      result.booking.note = `[UPDATE] ${result.booking.note || ''}`
    }

    return result
  }

  /**
   * Parse regular booking email
   */
  private parseBooking(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    return this.parseBookingTable(subject, htmlBody, textBody)
  }

  /**
   * Extract Viator booking reference (VIA-XXXXXXXX) from subject or body
   */
  private extractViatorRef(subject: string, body: string): string | null {
    // Try to extract from subject first: VIA-XXXXXXXX format
    const viaMatch = (subject + ' ' + body).match(/VIA-(\d{8})/i)
    if (viaMatch) {
      return `VIA-${viaMatch[1]}`
    }

    // Try to extract external booking ref from subject
    // Format: "Ext. booking ref: 1358680505"
    const extRefMatch = subject.match(/Ext\.\s*booking\s*ref:\s*(\d+)/i)
    if (extRefMatch) {
      // This is Bokun's internal ref, need to find corresponding VIA ref in body
      const viaBodyMatch = body.match(/VIA-(\d{8})/i)
      if (viaBodyMatch) {
        return `VIA-${viaBodyMatch[1]}`
      }
    }

    return null
  }

  private parseBookingTable(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    const $ = cheerio.load(htmlBody || textBody)

    // Find the booking table
    const bookingTable = $('table').first()

    if (!bookingTable.length) {
      return {
        success: false,
        error: 'No booking table found in Bokun email',
      }
    }

    // Parse table rows
    const data: Record<string, string> = {}
    const dataLower: Record<string, string> = {}

    bookingTable.find('tr').each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().replace(':', '')
        const value = $(cells[1]).text().trim()
        if (key && value) {
          data[key] = value
          dataLower[key.toLowerCase()] = value
        }
      }
    })

    // Extract Viator booking reference from subject
    let bookingRef = this.extractViatorRef(subject, htmlBody + textBody)

    // Fallback: use confirmation number from table
    if (!bookingRef) {
      bookingRef = data['Confirmation Number'] ||
                   data['Booking Reference'] ||
                   data['Reference']
    }

    // If still no booking ref, generate one with Bokun prefix for tracking
    if (!bookingRef) {
      bookingRef = `BOKUN-${Date.now()}`
      console.warn('[Bokun Parser] No Viator ref found, using generated ref:', bookingRef)
    }

    // Validate: reject if data looks like garbage
    const customerName = data['Customer'] || data['Guest Name'] || ''
    if (this.isGarbageData(customerName, subject)) {
      return {
        success: false,
        error: 'Email appears to be non-booking content (marketing/notification)',
      }
    }

    // Extract tour name
    const tourName = this.extractTourName(data, subject, textBody + ' ' + htmlBody, htmlBody) || 'Viator Tour'

    // Extract and parse date (date-only, no timezone conversion)
    let tourDate = new Date()
    const dateStr = data['Activity Date'] ||
                    data['Date'] ||
                    data['Travel Date'] ||
                    data['Start Date']

    if (dateStr) {
      tourDate = this.parseDateOnly(dateStr)
    }

    // Extract time
    const tourTime = data['Start Time'] ||
                     data['Time'] ||
                     data['Pickup Time']

    // Extract customer info
    let mainContactName = data['Customer'] ||
                          data['Guest Name'] ||
                          data['Lead Traveler'] ||
                          'Guest'

    // Reverse name format from "LastName, FirstName" to "FirstName LastName"
    if (mainContactName.includes(',')) {
      const parts = mainContactName.split(',').map(p => p.trim())
      if (parts.length === 2) {
        mainContactName = `${parts[1]} ${parts[0]}`
      }
    }

    const mainContactEmail = data['Email'] ||
                            data['Guest Email'] ||
                            'no-email@viator.com'

    // Clean phone number
    let phoneNumber = data['Customer Phone'] || data['Phone'] || ''
    if (phoneNumber) {
      phoneNumber = phoneNumber.replace(/^[A-Z]{2}\+/, '+').replace(/\s+/g, '')
    }

    // Extract pricing
    const priceStr = data['Total'] || data['Total Price'] || ''
    const textFallback = `${textBody} ${$.text()}`
    let totalPrice = this.extractPrice(priceStr)
    if (!totalPrice || totalPrice <= 0) {
      totalPrice = this.extractPriceFromText(textFallback)
    }
    const currency = detectCurrencyFromText(`${priceStr} ${textFallback}`)

    // Extract pax
    const paxStr =
      data['Travelers'] ||
      data['Pax'] ||
      data['PAX'] ||
      dataLower['travelers'] ||
      dataLower['pax'] ||
      this.extractPaxFromText(textBody + ' ' + htmlBody) ||
      '1 Adult'
    const { adults, children } = this.parsePax(paxStr)

    // Extract pickup/meeting point
    const meetingPoint = data['Pick-Up'] ||
                        data['Pickup Location'] ||
                        data['Meeting Point'] ||
                        ''

    // Build notes
    const packageName = this.extractPackageName(data, textBody + ' ' + htmlBody, htmlBody)

    const noteParts = [
      `Tour: ${tourName}`,
      packageName ? `Package: ${packageName}` : '',
      data['Rate'] ? `Rate: ${data['Rate']}` : '',
      data['Special Requirements'] ? `Requirements: ${data['Special Requirements']}` : '',
      data['Notes'] ? `Notes: ${data['Notes']}` : '',
      `Viator Ref: ${bookingRef}`,
      data['Booking Reference'] ? `Bokun Ref: ${data['Booking Reference']}` : '',
    ].filter(Boolean).join('\n')

    const booking: ParsedBooking = {
      source: this.detectSource(subject, htmlBody + textBody, bookingRef),
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
      note: noteParts,
    }

    return {
      success: true,
      booking,
    }
  }

  private extractTourName(
    data: Record<string, string>,
    subject: string,
    bodyText: string,
    htmlBody?: string
  ): string {
    const candidates: string[] = []

    if (data['Product']) candidates.push(data['Product'])
    if (data['Activity']) candidates.push(data['Activity'])

    const subjectMatch = subject.match(/New booking:\s*(.+?)(?:\s*\([A-Z]+-T\d+\))?$/i)
    if (subjectMatch && subjectMatch[1]) candidates.push(subjectMatch[1].trim())

    const productLineMatch = bodyText.match(/Product\s+\d+\s*-\s*\"?(.+?)\"?(?:\n|$)/i)
    if (productLineMatch && productLineMatch[1]) candidates.push(productLineMatch[1].trim())

    for (const candidate of candidates) {
      const clean = this.sanitizeTourName(candidate)
      if (clean) return clean
    }

    return ''
  }

  private sanitizeTourName(raw: string): string {
    let cleaned = raw.replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''

    // Remove leading product codes if present
    cleaned = cleaned.replace(/^Product\s+\d+\s*-\s*/i, '').trim()
    cleaned = cleaned.replace(/^\\d+[A-Z0-9-]*\\s*-\\s*/i, '').trim()

    if (cleaned.length < 3) return ''
    return cleaned
  }

  private extractPackageName(data: Record<string, string>, bodyText: string, htmlBody?: string): string {
    if (data['Rate']) return data['Rate'].trim()

    const rateMatch = bodyText.match(/Rate\\s*\"?([^\\n\"]+)\"?/i)
    if (rateMatch && rateMatch[1]) return rateMatch[1].trim()

    return ''
  }

  /**
   * Detect OTA channel inside Bokun email.
   * - If we can confirm Viator, use VIATOR.
   * - Otherwise default to BOKUN (future-proof for other channels).
   */
  private detectSource(subject: string, body: string, bookingRef?: string | null): BookingSource {
    if (bookingRef && /^VIA-\d{8}$/i.test(bookingRef)) {
      return BookingSource.VIATOR
    }

    const combined = `${subject} ${body}`.toLowerCase()
    if (combined.includes('viator')) {
      return BookingSource.VIATOR
    }

    return BookingSource.BOKUN
  }

  /**
   * Parse date as date-only (no timezone conversion)
   * CRITICAL FIX: Prevents off-by-one-day errors
   */
  private parseDateOnly(dateStr: string): Date {
    // Remove time component if present
    const cleanDateStr = dateStr.split(' ')[0]

    // Try ISO format (YYYY-MM-DD)
    const isoMatch = cleanDateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const [, year, month, day] = isoMatch
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    }

    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleanDateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch
      const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year)
      return new Date(fullYear, parseInt(month) - 1, parseInt(day))
    }

    // Try parsing month name (e.g., "May 3, 2026" or "3.May '26")
    const monthNameMatch = dateStr.match(/(\d{1,2})[.\s]([A-Za-z]+)[.\s']*(\d{2,4})/)
    if (monthNameMatch) {
      const [, day, monthName, year] = monthNameMatch
      const monthMap: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      }
      const month = monthMap[monthName.toLowerCase().substring(0, 3)]
      if (month !== undefined) {
        const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year)
        return new Date(fullYear, month, parseInt(day))
      }
    }

    // Fallback: use current date
    console.warn('[Bokun Parser] Could not parse date:', dateStr)
    return new Date()
  }

  private extractPrice(priceStr: string): number {
    const numStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '')
    const price = parseFloat(numStr)
    return isNaN(price) ? 0 : price
  }

  private extractPriceFromText(text: string): number {
    if (!text) return 0

    const patterns = [
      /Viator amount:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*([\d.,]+)/i,
      /Total price:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*([\d.,]+)/i,
      /Total:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*([\d.,]+)/i,
      /Amount due:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*([\d.,]+)/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const parsed = this.extractPrice(match[1])
        if (parsed > 0) return parsed
      }
    }

    return 0
  }

  private parsePax(paxStr: string): { adults: number; children: number } {
    const normalized = paxStr.replace(/\s+/g, ' ').trim()
    const adultMatch = normalized.match(/(\d+)\s*(?:x\s*)?Adults?/i)
    const childMatch = normalized.match(/(\d+)\s*(?:x\s*)?Child(?:ren)?/i)
    const totalMatch = normalized.match(/\bPAX\b\s*[:\-]?\s*(\d+)/i)

    let adults = adultMatch ? parseInt(adultMatch[1]) : 1
    const children = childMatch ? parseInt(childMatch[1]) : 0

    if (totalMatch) {
      const total = parseInt(totalMatch[1])
      if (!Number.isNaN(total)) {
        if (!adultMatch && children === 0) {
          adults = total
        } else if (children > 0 && total >= children && (adults > total || !adultMatch)) {
          adults = Math.max(total - children, 1)
        }
      }
    }

    return { adults, children }
  }

  private extractPaxFromText(text: string): string | null {
    const normalized = text.replace(/\s+/g, ' ')
    const paxLineMatch =
      normalized.match(/\bPAX\b\s*[:\-]?\s*(\d+)\s*Adults?/i) ||
      normalized.match(/\bPAX\b\s*[:\-]?\s*(\d+)/i) ||
      normalized.match(/(\d+)\s*Adults?\b/i)
    if (paxLineMatch) {
      return paxLineMatch[0]
    }
    return null
  }

  /**
   * Check if extracted data is garbage (marketing email, etc.)
   */
  private isGarbageData(name: string, subject: string): boolean {
    // Check for generic names
    const genericNames = [
      /^guest$/i,
      /^customer$/i,
      /^user$/i,
      /^traveler$/i,
      /website/i,
      /support/i,
      /transaction fees/i,
      /marketing/i,
      /^update$/i,  // Only reject if JUST "update", not "Updated booking:"
      /^notification$/i,
    ]

    for (const pattern of genericNames) {
      if (pattern.test(name)) {
        return true
      }
    }

    // Check if name is too long (likely HTML content)
    if (name.length > 100) {
      return true
    }

    // Check if subject contains booking-related keywords (NEW/UPDATED/CANCELLED)
    // ✅ FIX: Accept "Updated booking:" and "Cancelled booking:" as valid
    const isBookingEmail =
      /new booking:/i.test(subject) ||
      /updated booking:/i.test(subject) ||
      /cancelled booking:/i.test(subject)

    if (!isBookingEmail) {
      return true
    }

    return false
  }
}
