import { compareTwoStrings } from 'string-similarity'
import { BookingSource } from '@prisma/client'

/**
 * Normalize booking reference for comparison
 * Handles different formats like GYG-12345, gyg12345, GYG 12345
 */
export function normalizeBookingRef(ref: string): string {
  if (!ref) return ''
  return ref
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric chars
    .trim()
}

/**
 * Compare two dates ignoring time
 */
export function isSameDate(date1: Date | null, date2: Date | null): boolean {
  if (!date1 || !date2) return false
  
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

/**
 * Calculate fuzzy string similarity (0-1)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  if (s1 === s2) return 1
  
  return compareTwoStrings(s1, s2)
}

/**
 * Normalize customer name for comparison
 * Handles: "John Doe", "Doe, John", "JOHN DOE", etc.
 */
export function normalizeCustomerName(name: string): string {
  if (!name) return ''
  
  let normalized = name.toLowerCase().trim()
  
  // Handle "LastName, FirstName" format
  if (normalized.includes(',')) {
    const parts = normalized.split(',').map(p => p.trim())
    normalized = parts.reverse().join(' ')
  }
  
  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ')
  
  return normalized
}

/**
 * Normalize phone number for comparison
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-numeric characters except +
  return phone.replace(/[^0-9+]/g, '').trim()
}

/**
 * Normalize email for comparison
 */
export function normalizeEmail(email: string): string {
  if (!email) return ''
  return email.toLowerCase().trim()
}

/**
 * Parse booking source from string
 */
export function parseBookingSource(source: string): BookingSource {
  const normalized = source.toUpperCase().trim()
  
  if (normalized.includes('GYG') || normalized.includes('GETYOURGUIDE')) {
    return BookingSource.GYG
  }
  if (normalized.includes('VIATOR')) {
    return BookingSource.VIATOR
  }
  if (normalized.includes('BOKUN')) {
    return BookingSource.BOKUN
  }
  if (normalized.includes('TRIP') || normalized.includes('TRIP.COM')) {
    return BookingSource.TRIPDOTCOM
  }
  if (normalized.includes('DIRECT') || normalized.includes('WEBSITE')) {
    return BookingSource.DIRECT
  }
  
  return BookingSource.MANUAL
}

/**
 * Calculate overall similarity score between two bookings
 * Returns 0-1 score
 */
export function calculateBookingSimilarity(
  booking1: {
    bookingRef?: string
    customerName: string
    tourDate: Date
    tourName?: string
    phoneNumber?: string
  },
  booking2: {
    bookingRef?: string
    customerName: string
    tourDate: Date
    tourName?: string
    phoneNumber?: string
  }
): number {
  let score = 0
  let weights = 0
  
  // Booking reference (weight: 40%)
  if (booking1.bookingRef && booking2.bookingRef) {
    const refMatch = normalizeBookingRef(booking1.bookingRef) === 
                     normalizeBookingRef(booking2.bookingRef)
    score += refMatch ? 0.4 : 0
    weights += 0.4
  }
  
  // Customer name (weight: 30%)
  const nameSimilarity = calculateStringSimilarity(
    normalizeCustomerName(booking1.customerName),
    normalizeCustomerName(booking2.customerName)
  )
  score += nameSimilarity * 0.3
  weights += 0.3
  
  // Tour date (weight: 20%)
  if (isSameDate(booking1.tourDate, booking2.tourDate)) {
    score += 0.2
  }
  weights += 0.2
  
  // Tour name (weight: 10%)
  if (booking1.tourName && booking2.tourName) {
    const tourSimilarity = calculateStringSimilarity(
      booking1.tourName,
      booking2.tourName
    )
    score += tourSimilarity * 0.1
    weights += 0.1
  }
  
  return weights > 0 ? score / weights : 0
}

/**
 * Format currency value
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount)
}

/**
 * Detect if a booking might be a rebooking
 * Returns true if dates are within reasonable rebooking window
 */
export function isWithinRebookingWindow(
  cancellationDate: Date,
  newBookingDate: Date,
  maxDays: number = 30
): boolean {
  const diffMs = newBookingDate.getTime() - cancellationDate.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  
  return diffDays >= 0 && diffDays <= maxDays
}

/**
 * Safe string truncate
 */
export function truncate(str: string, maxLength: number = 50): string {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

/**
 * Get date range string
 */
export function formatDateRange(from: Date, to: Date): string {
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  }
  
  return `${from.toLocaleDateString('en-US', options)} - ${to.toLocaleDateString('en-US', options)}`
}

/**
 * Detect common parsing issues based on patterns
 */
export function detectParsingIssue(
  excelValue: any,
  emailValue: any,
  fieldName: string
): string | null {
  // Price is 0 (Trip.com common issue)
  if (fieldName === 'totalPrice' && emailValue === 0 && excelValue > 0) {
    return 'Price not extracted from email (Trip.com issue)'
  }
  
  // Default email (missing email issue)
  if (fieldName === 'customerEmail' && emailValue?.includes('no-email@')) {
    return 'Email not available in source email'
  }
  
  // Name format issue (Bokun common)
  if (fieldName === 'customerName') {
    if (emailValue?.includes(',') && !excelValue?.includes(',')) {
      return 'Name format not reversed properly'
    }
  }
  
  // Time parsing issue
  if (fieldName === 'tourTime' && !emailValue && excelValue) {
    return 'Tour time not extracted from email'
  }
  
  return null
}

/**
 * Group items by key
 */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
