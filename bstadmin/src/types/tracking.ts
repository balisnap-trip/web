import { BookingSource, BookingStatus } from '@prisma/client'

/**
 * Excel Booking Data Structure
 * Data yang di-extract dari file Excel
 */
export interface ExcelBooking {
  bookingRef: string
  customerName: string
  customerEmail?: string
  phoneNumber?: string
  tourDate: Date
  tourName: string
  totalPrice: number
  currency: string
  source: BookingSource
  numberOfAdult: number
  numberOfChild?: number
  meetingPoint?: string
  note?: string
  // Raw row data untuk debugging
  rawRow?: Record<string, any>
}

/**
 * Email/Database Booking Data
 * Data yang sudah di-parse dari email dan tersimpan di database
 */
export interface EmailBooking {
  id: number
  bookingRef: string
  customerName: string
  customerEmail: string
  phoneNumber?: string
  tourDate: Date
  tourTime?: string
  tourName: string
  totalPrice: number
  currency: string
  source: BookingSource
  status: BookingStatus
  numberOfAdult: number
  numberOfChild?: number
  meetingPoint?: string
  note?: string
  createdAt: Date
  updatedAt: Date
  // Email metadata
  emailId?: string
  emailSubject?: string
  emailReceivedAt?: Date
  parsedData?: any
}

/**
 * Field Discrepancy
 */
export interface Discrepancy {
  field: string
  excelValue: any
  emailValue: any
  severity: 'low' | 'medium' | 'high'
  note?: string
}

/**
 * Match Result Categories
 */
export type MatchStatus = 
  | 'perfect'           // All fields match
  | 'partial'           // Booking ref match but some discrepancies
  | 'cancelled'         // Booking cancelled (expected missing from Excel)
  | 'orphaned'          // In DB but not in Excel (needs review)
  | 'missing'           // In Excel but not in DB (parser failure)
  | 'ambiguous'         // Multiple potential matches

/**
 * Single Booking Match Result
 */
export interface MatchResult {
  status: MatchStatus
  excelBooking?: ExcelBooking
  emailBooking?: EmailBooking
  confidence: number // 0-1
  discrepancies: Discrepancy[]
  note?: string
}

/**
 * Cancelled Booking Info
 */
export interface CancelledBooking {
  bookingRef: string
  emailBooking: EmailBooking
  cancelledDate?: Date
  originalTourDate: Date
  note: string
}

/**
 * Rebooking Pattern Detection
 */
export interface RebookingPattern {
  originalBooking: EmailBooking
  replacementBooking: EmailBooking
  similarity: number
  reasons: string[]
  suggestedAction: string
}

/**
 * PR Review Item Categories
 */
export type PRCategory = 
  | 'cancelled_rebooking'  // Potential rebooking after cancellation
  | 'orphaned'             // Confirmed booking not in Excel
  | 'updated'              // Updated booking detected
  | 'ambiguous_match'      // Multiple matches found

/**
 * PR Review Item
 */
export interface PRReviewItem {
  category: PRCategory
  bookings: (EmailBooking | RebookingPattern)[]
  reason: string
  suggestedAction: string
  priority: 'high' | 'medium' | 'low'
}

/**
 * Parser Accuracy by Source
 */
export interface ParserAccuracy {
  source: BookingSource
  totalBookings: number
  successfulMatches: number
  partialMatches: number
  failures: number
  accuracy: number // percentage
  commonIssues: string[]
}

/**
 * Field-level Accuracy
 */
export interface FieldAccuracy {
  fieldName: string
  totalComparisons: number
  matches: number
  mismatches: number
  accuracy: number // percentage
  commonDiscrepancies: Array<{
    excelValue: any
    emailValue: any
    count: number
  }>
}

/**
 * Parser Recommendation
 */
export interface ParserRecommendation {
  priority: 'high' | 'medium' | 'low'
  parser: string
  issue: string
  suggestion: string
  affectedBookings: number
  examples?: Array<{
    bookingRef: string
    problem: string
  }>
}

/**
 * Main Tracking Report
 */
export interface TrackingReport {
  metadata: {
    generatedAt: Date
    excelFile: string
    dateRange: {
      from: Date
      to: Date
    }
  }
  
  summary: {
    totalExcel: number
    totalEmailProcessed: number
    totalEmailConfirmed: number
    totalEmailCancelled: number
    perfectMatches: number
    partialMatches: number
    missingInEmail: number
    cancelledBookings: number
    orphanedInDatabase: number
    matchRate: number // percentage
  }
  
  matches: MatchResult[]
  
  missingInEmail: Array<{
    excelBooking: ExcelBooking
    possibleReasons: string[]
  }>
  
  cancelledBookings: CancelledBooking[]
  
  prReviewList: PRReviewItem[]
  
  parserAnalysis: {
    bySource: ParserAccuracy[]
    byField: FieldAccuracy[]
    recommendations: ParserRecommendation[]
  }
}

/**
 * Excel Processing Options
 */
export interface ExcelProcessingOptions {
  filePath: string
  sheetName?: string
  headerRow?: number
  dateFormat?: string
}

/**
 * Tracking Analysis Options
 */
export interface TrackingAnalysisOptions {
  excelFile: string
  outputDir: string
  includeHistorical?: boolean
  verbose?: boolean
  dateRange?: {
    from: Date
    to: Date
  }
}
