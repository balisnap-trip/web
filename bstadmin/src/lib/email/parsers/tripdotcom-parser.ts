import * as cheerio from 'cheerio'
import { EmailParser, EmailParseResult, ParsedBooking } from '@/types/email'
import { BookingSource } from '@prisma/client'
import { detectCurrencyFromText } from '@/lib/currency'

/**
 * Trip.com Email Parser
 * Based on CTRIP.py from bookingautomation
 * 
 * Email patterns:
 * - Subject: "New booking reminder" with order no.
 * - From: "TNT_noreply@trip.com"
 * - Contains table with booking data in container03 div
 */
export class TripDotComParser implements EmailParser {
  canHandle(subject: string, from: string, body: string): boolean {
    const isFromTrip = /trip\.com|ctrip/i.test(from)
    const hasReminderSubject = /new booking reminder/i.test(subject)
    
    return isFromTrip && hasReminderSubject
  }

  async parse(
    subject: string,
    from: string,
    htmlBody: string,
    textBody: string
  ): Promise<EmailParseResult> {
    try {
      return this.parseBookingTable(subject, htmlBody, textBody)
    } catch (error) {
      console.error('[Trip.com Parser] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      }
    }
  }

  private parseBookingTable(
    subject: string,
    htmlBody: string,
    textBody: string
  ): EmailParseResult {
    const $ = cheerio.load(htmlBody || textBody)

    // Find container03 div (specific to Trip.com emails)
    const container = $('.container03')
    
    if (!container.length) {
      return {
        success: false,
        error: 'Could not find booking container in Trip.com email',
      }
    }

    // Find table within container
    const table = container.find('table').first()
    
    if (!table.length) {
      return {
        success: false,
        error: 'No booking table found in Trip.com email',
      }
    }

    // Parse table rows (skip header row)
    const rows = table.find('tr').slice(1) // Skip header
    
    if (rows.length === 0) {
      return {
        success: false,
        error: 'No data rows found in Trip.com booking table',
      }
    }

    // Extract data from first row (Trip.com usually has one booking per email)
    const firstRow = $(rows[0])
    const cells = firstRow.find('td')
    
    if (cells.length < 6) {
      return {
        success: false,
        error: 'Insufficient data in Trip.com booking table',
      }
    }

    // Based on Python code:
    // data[0][0] = Resource (with pipe separators)
    // data[0][1] = Product name
    // data[0][2] = Booking date
    // data[0][3] = Activity date
    // data[0][4] = Customer
    // data[0][5] = Pax

    const resourceRaw = $(cells[0]).text().trim()
    const tourName = $(cells[1]).text().trim()
    const bookingDate = $(cells[2]).text().trim()
    const activityDate = $(cells[3]).text().trim()
    const customerName = $(cells[4]).text().trim()
    const paxStr = $(cells[5]).text().trim()

    // Extract booking reference from subject
    // Subject format: "New booking reminder: order no.123456"
    const refMatch = subject.match(/no\.(\d+)/i) || subject.match(/order[:\s#]*(\d+)/i)
    const bookingRef = refMatch ? refMatch[1] : `TRIP-${Date.now()}`

    // Parse resource (contains additional info separated by |)
    const resourceParts = resourceRaw.split('|').map(p => p.trim())
    const meetingPoint = resourceParts.length > 1 ? resourceParts.join(', ') : resourceRaw

    // Parse activity date
    const tourDate = this.parseDate(activityDate)

    // Parse pax
    const { adults, children } = this.parsePax(paxStr)

    // Trip.com emails usually don't show price directly
    // We'll set it to 0 and it can be updated manually or from another source
    const totalPrice = 0
    const currency = 'USD' // Default, Trip.com handles multiple currencies

    const booking: ParsedBooking = {
      source: BookingSource.TRIPDOTCOM,
      bookingRef,
      tourName,
      tourDate,
      totalPrice,
      currency,
      numberOfAdult: adults,
      numberOfChild: children > 0 ? children : undefined,
      mainContactName: customerName,
      mainContactEmail: 'no-email@trip.com', // Trip.com doesn't always provide email
      meetingPoint,
      note: `Booking Date: ${bookingDate}. Resource: ${resourceRaw}. Subject: ${subject}`,
    }

    return {
      success: true,
      booking,
    }
  }

  private parseDate(dateStr: string): Date {
    // Trip.com uses various date formats
    // Common: "2024-12-25", "Dec 25, 2024", "25/12/2024"
    
    // Try ISO format first
    const isoDate = new Date(dateStr)
    if (!isNaN(isoDate.getTime())) {
      return isoDate
    }

    // Try DD/MM/YYYY or MM/DD/YYYY
    const slashMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1])
      const part2 = parseInt(slashMatch[2])
      const year = slashMatch[3].length === 2 ? 2000 + parseInt(slashMatch[3]) : parseInt(slashMatch[3])
      
      // Assume DD/MM/YYYY if first part > 12
      if (part1 > 12) {
        return new Date(year, part2 - 1, part1)
      } else {
        // Could be either format, assume MM/DD/YYYY (US format)
        return new Date(year, part1 - 1, part2)
      }
    }

    // Fallback to today
    return new Date()
  }

  private parsePax(paxStr: string): { adults: number; children: number } {
    // Parse strings like "2 Adults 1 Child" or "3 adults" or just "2"
    const adultMatch = paxStr.match(/(\d+)\s*(?:Adult|adults|Adult\(s\))/i)
    const childMatch = paxStr.match(/(\d+)\s*(?:Child|children|Child\(ren\))/i)

    // If no specific labels, assume it's total adults
    if (!adultMatch && !childMatch) {
      const totalMatch = paxStr.match(/(\d+)/)
      if (totalMatch) {
        return { adults: parseInt(totalMatch[1]), children: 0 }
      }
    }

    return {
      adults: adultMatch ? parseInt(adultMatch[1]) : 1,
      children: childMatch ? parseInt(childMatch[1]) : 0,
    }
  }
}
