import {
  ExcelBooking,
  EmailBooking,
  MatchResult,
  MatchStatus,
  Discrepancy,
} from '@/types/tracking'
import {
  normalizeBookingRef,
  isSameDate,
  calculateStringSimilarity,
  normalizeCustomerName,
  normalizePhoneNumber,
  normalizeEmail,
  calculateBookingSimilarity,
  detectParsingIssue,
} from './utils'

/**
 * Booking Matcher
 * Core matching engine to compare Excel vs Email data
 */
export class BookingMatcher {
  /**
   * Match Excel bookings with Email bookings
   */
  matchBookings(
    excelBookings: ExcelBooking[],
    emailBookings: EmailBooking[]
  ): {
    matches: MatchResult[]
    unmatched: ExcelBooking[]
  } {
    console.log(
      `[Matcher] Matching ${excelBookings.length} Excel bookings with ${emailBookings.length} email bookings`
    )
    
    const matches: MatchResult[] = []
    const unmatched: ExcelBooking[] = []
    const usedEmailIds = new Set<number>()
    
    for (const excelBooking of excelBookings) {
      // Try to find match
      const matchResult = this.findBestMatch(
        excelBooking,
        emailBookings.filter(e => !usedEmailIds.has(e.id))
      )
      
      if (matchResult.emailBooking) {
        matches.push(matchResult)
        usedEmailIds.add(matchResult.emailBooking.id)
      } else {
        // No match found
        unmatched.push(excelBooking)
        matches.push({
          status: 'missing',
          excelBooking,
          confidence: 0,
          discrepancies: [],
          note: 'No matching booking found in database',
        })
      }
    }
    
    console.log(
      `[Matcher] Matched: ${matches.filter(m => m.emailBooking).length}, ` +
      `Unmatched: ${unmatched.length}`
    )
    
    return { matches, unmatched }
  }
  
  /**
   * Find best matching email booking for an Excel booking
   */
  private findBestMatch(
    excelBooking: ExcelBooking,
    emailBookings: EmailBooking[]
  ): MatchResult {
    // Step 1: Try exact booking reference match
    const exactMatch = emailBookings.find(
      e => normalizeBookingRef(e.bookingRef) === normalizeBookingRef(excelBooking.bookingRef)
    )
    
    if (exactMatch) {
      return this.compareBookings(excelBooking, exactMatch)
    }
    
    // Step 2: Try fuzzy matching
    const candidates = emailBookings.filter(e =>
      // Same date
      isSameDate(e.tourDate, excelBooking.tourDate) &&
      // Same source (important!)
      e.source === excelBooking.source
    )
    
    if (candidates.length === 0) {
      return {
        status: 'missing',
        excelBooking,
        confidence: 0,
        discrepancies: [],
        note: 'No candidates found (different date or source)',
      }
    }
    
    // Calculate similarity scores
    const scored = candidates.map(candidate => ({
      booking: candidate,
      score: calculateBookingSimilarity(excelBooking, candidate),
    }))
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score)
    
    const best = scored[0]
    
    // Check if we have a confident match
    if (best.score >= 0.8) {
      const result = this.compareBookings(excelBooking, best.booking)
      result.note = `Fuzzy matched with ${(best.score * 100).toFixed(1)}% confidence`
      return result
    }
    
    // Check for ambiguous matches
    if (scored.length > 1 && scored[1].score >= 0.7) {
      return {
        status: 'ambiguous',
        excelBooking,
        confidence: best.score,
        discrepancies: [],
        note: `Multiple potential matches found (top: ${(best.score * 100).toFixed(1)}%, second: ${(scored[1].score * 100).toFixed(1)}%)`,
      }
    }
    
    // Low confidence match - treat as missing
    return {
      status: 'missing',
      excelBooking,
      confidence: best.score,
      discrepancies: [],
      note: `Best match only ${(best.score * 100).toFixed(1)}% confident`,
    }
  }
  
  /**
   * Compare two bookings and identify discrepancies
   */
  private compareBookings(
    excelBooking: ExcelBooking,
    emailBooking: EmailBooking
  ): MatchResult {
    const discrepancies: Discrepancy[] = []
    
    // Compare booking reference
    if (
      normalizeBookingRef(excelBooking.bookingRef) !==
      normalizeBookingRef(emailBooking.bookingRef)
    ) {
      discrepancies.push({
        field: 'bookingRef',
        excelValue: excelBooking.bookingRef,
        emailValue: emailBooking.bookingRef,
        severity: 'high',
        note: 'Booking reference mismatch',
      })
    }
    
    // Compare customer name
    const nameSimilarity = calculateStringSimilarity(
      normalizeCustomerName(excelBooking.customerName),
      normalizeCustomerName(emailBooking.customerName)
    )
    
    if (nameSimilarity < 0.9) {
      const issue = detectParsingIssue(
        excelBooking.customerName,
        emailBooking.customerName,
        'customerName'
      )
      
      discrepancies.push({
        field: 'customerName',
        excelValue: excelBooking.customerName,
        emailValue: emailBooking.customerName,
        severity: nameSimilarity < 0.7 ? 'high' : 'medium',
        note: issue || 'Name format difference',
      })
    }
    
    // Compare email
    if (excelBooking.customerEmail && emailBooking.customerEmail) {
      const excelEmail = normalizeEmail(excelBooking.customerEmail)
      const emailEmail = normalizeEmail(emailBooking.customerEmail)
      
      if (excelEmail !== emailEmail && !emailEmail.includes('no-email@')) {
        discrepancies.push({
          field: 'customerEmail',
          excelValue: excelBooking.customerEmail,
          emailValue: emailBooking.customerEmail,
          severity: 'medium',
        })
      }
    }
    
    // Compare phone
    if (excelBooking.phoneNumber && emailBooking.phoneNumber) {
      const excelPhone = normalizePhoneNumber(excelBooking.phoneNumber)
      const emailPhone = normalizePhoneNumber(emailBooking.phoneNumber)
      
      if (excelPhone !== emailPhone) {
        discrepancies.push({
          field: 'phoneNumber',
          excelValue: excelBooking.phoneNumber,
          emailValue: emailBooking.phoneNumber,
          severity: 'low',
        })
      }
    }
    
    // Compare tour date
    if (!isSameDate(excelBooking.tourDate, emailBooking.tourDate)) {
      discrepancies.push({
        field: 'tourDate',
        excelValue: excelBooking.tourDate.toISOString(),
        emailValue: emailBooking.tourDate.toISOString(),
        severity: 'high',
        note: 'Tour date mismatch',
      })
    }
    
    // Compare tour name
    const tourSimilarity = calculateStringSimilarity(
      excelBooking.tourName,
      emailBooking.tourName
    )
    
    if (tourSimilarity < 0.7) {
      discrepancies.push({
        field: 'tourName',
        excelValue: excelBooking.tourName,
        emailValue: emailBooking.tourName,
        severity: 'medium',
        note: 'Tour name difference (abbreviations or formatting)',
      })
    }
    
    // Compare price
    const priceDiff = Math.abs(excelBooking.totalPrice - emailBooking.totalPrice)
    const priceThreshold = Math.max(excelBooking.totalPrice * 0.01, 1) // 1% or $1
    
    if (priceDiff > priceThreshold) {
      const issue = detectParsingIssue(
        excelBooking.totalPrice,
        emailBooking.totalPrice,
        'totalPrice'
      )
      
      discrepancies.push({
        field: 'totalPrice',
        excelValue: `${excelBooking.totalPrice} ${excelBooking.currency}`,
        emailValue: `${emailBooking.totalPrice} ${emailBooking.currency}`,
        severity: emailBooking.totalPrice === 0 ? 'low' : 'high',
        note: issue || 'Price mismatch',
      })
    }
    
    // Compare currency
    if (excelBooking.currency !== emailBooking.currency) {
      discrepancies.push({
        field: 'currency',
        excelValue: excelBooking.currency,
        emailValue: emailBooking.currency,
        severity: 'medium',
      })
    }
    
    // Compare pax
    if (excelBooking.numberOfAdult !== emailBooking.numberOfAdult) {
      discrepancies.push({
        field: 'numberOfAdult',
        excelValue: excelBooking.numberOfAdult,
        emailValue: emailBooking.numberOfAdult,
        severity: 'high',
        note: 'Adult count mismatch',
      })
    }
    
    if (
      excelBooking.numberOfChild !== emailBooking.numberOfChild &&
      excelBooking.numberOfChild !== 0 &&
      emailBooking.numberOfChild !== 0
    ) {
      discrepancies.push({
        field: 'numberOfChild',
        excelValue: excelBooking.numberOfChild || 0,
        emailValue: emailBooking.numberOfChild || 0,
        severity: 'medium',
        note: 'Child count mismatch',
      })
    }
    
    // Determine match status
    let status: MatchStatus
    
    if (discrepancies.length === 0) {
      status = 'perfect'
    } else {
      const highSeverity = discrepancies.filter(d => d.severity === 'high')
      status = highSeverity.length > 0 ? 'partial' : 'partial'
    }
    
    // Calculate confidence
    const confidence = 1 - (discrepancies.length * 0.1)
    
    return {
      status,
      excelBooking,
      emailBooking,
      confidence: Math.max(confidence, 0),
      discrepancies,
    }
  }
  
  /**
   * Find orphaned bookings (in database but not in Excel)
   */
  findOrphanedBookings(
    emailBookings: EmailBooking[],
    matches: MatchResult[]
  ): EmailBooking[] {
    const matchedIds = new Set(
      matches
        .filter(m => m.emailBooking)
        .map(m => m.emailBooking!.id)
    )
    
    return emailBookings.filter(
      booking =>
        !matchedIds.has(booking.id) &&
        booking.status !== 'CANCELLED' // Exclude cancelled bookings
    )
  }
}

// Singleton instance
let bookingMatcher: BookingMatcher | null = null

export function getBookingMatcher(): BookingMatcher {
  if (!bookingMatcher) {
    bookingMatcher = new BookingMatcher()
  }
  return bookingMatcher
}
