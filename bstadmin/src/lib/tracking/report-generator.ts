import {
  TrackingReport,
  ExcelBooking,
  EmailBooking,
  MatchResult,
  CancelledBooking,
  PRReviewItem,
  RebookingPattern,
  ParserAccuracy,
  FieldAccuracy,
  ParserRecommendation,
} from '@/types/tracking'
import { BookingSource } from '@prisma/client'
import { groupBy, isWithinRebookingWindow, calculateStringSimilarity } from './utils'

/**
 * Report Generator
 * Generates comprehensive tracking reports with parser analysis
 */
export class ReportGenerator {
  /**
   * Generate complete tracking report
   */
  generateReport(
    excelBookings: ExcelBooking[],
    emailBookings: EmailBooking[],
    matches: MatchResult[],
    cancelledBookings: EmailBooking[],
    options: {
      excelFile: string
      dateRange?: { from: Date; to: Date }
    }
  ): TrackingReport {
    console.log('[Report Generator] Generating comprehensive report...')
    
    // Determine date range
    const dateRange = options.dateRange || this.calculateDateRange(excelBookings, emailBookings)
    
    // Separate matches by status
    const perfectMatches = matches.filter(m => m.status === 'perfect')
    const partialMatches = matches.filter(m => m.status === 'partial')
    const missingInEmail = matches.filter(m => m.status === 'missing')
    
    // Find orphaned bookings (confirmed but not in Excel)
    const matchedEmailIds = new Set(
      matches.filter(m => m.emailBooking).map(m => m.emailBooking!.id)
    )
    const cancelledIds = new Set(cancelledBookings.map(b => b.id))
    
    const orphanedBookings = emailBookings.filter(
    b => !matchedEmailIds.has(b.id) && !cancelledIds.has(b.id) && ['READY', 'ATTENTION', 'COMPLETED', 'DONE'].includes(b.status)
    )
    
    // Generate PR review list
    const prReviewList = this.generatePRReviewList(
      cancelledBookings,
      emailBookings.filter(b => ['READY', 'ATTENTION', 'COMPLETED', 'DONE'].includes(b.status)),
      orphanedBookings
    )
    
    // Generate parser analysis
    const parserAnalysis = this.generateParserAnalysis(
      matches,
      emailBookings,
      excelBookings
    )
    
    // Format cancelled bookings
    const formattedCancelled: CancelledBooking[] = cancelledBookings.map(booking => ({
      bookingRef: booking.bookingRef,
      emailBooking: booking,
      cancelledDate: booking.updatedAt,
      originalTourDate: booking.tourDate,
      note: 'Expected - Excel does not track cancellations',
    }))
    
    const report: TrackingReport = {
      metadata: {
        generatedAt: new Date(),
        excelFile: options.excelFile,
        dateRange,
      },
      
      summary: {
        totalExcel: excelBookings.length,
        totalEmailProcessed: emailBookings.length,
        totalEmailConfirmed: emailBookings.filter(b => ['READY', 'ATTENTION', 'COMPLETED', 'DONE'].includes(b.status)).length,
        totalEmailCancelled: cancelledBookings.length,
        perfectMatches: perfectMatches.length,
        partialMatches: partialMatches.length,
        missingInEmail: missingInEmail.length,
        cancelledBookings: cancelledBookings.length,
        orphanedInDatabase: orphanedBookings.length,
        matchRate: excelBookings.length > 0
          ? ((perfectMatches.length + partialMatches.length) / excelBookings.length) * 100
          : 0,
      },
      
      matches: [...perfectMatches, ...partialMatches],
      
      missingInEmail: missingInEmail.map(m => ({
        excelBooking: m.excelBooking!,
        possibleReasons: this.determineMissingReasons(m.excelBooking!),
      })),
      
      cancelledBookings: formattedCancelled,
      
      prReviewList,
      
      parserAnalysis,
    }
    
    console.log('[Report Generator] Report generation complete')
    
    return report
  }
  
  /**
   * Generate PR review list for manual investigation
   */
  private generatePRReviewList(
    cancelledBookings: EmailBooking[],
    confirmedBookings: EmailBooking[],
    orphanedBookings: EmailBooking[]
  ): PRReviewItem[] {
    const prList: PRReviewItem[] = []
    
    // 1. Detect potential rebookings
    const rebookingPatterns = this.detectRebookings(cancelledBookings, confirmedBookings)
    
    if (rebookingPatterns.length > 0) {
      prList.push({
        category: 'cancelled_rebooking',
        bookings: rebookingPatterns,
        reason: 'Customer cancelled and potentially rebooked with different date or tour',
        suggestedAction: 'Verify if replacement booking should reference original in notes. Consider linking bookings for customer history.',
        priority: 'medium',
      })
    }
    
    // 2. Orphaned confirmed bookings
    if (orphanedBookings.length > 0) {
      prList.push({
        category: 'orphaned',
        bookings: orphanedBookings,
        reason: 'Bookings confirmed in database but missing from Excel tracking sheet',
        suggestedAction: 'Review if Excel needs update OR if these bookings have parsing issues that made matching impossible',
        priority: 'high',
      })
    }
    
    return prList
  }
  
  /**
   * Detect potential rebooking patterns
   */
  private detectRebookings(
    cancelledBookings: EmailBooking[],
    confirmedBookings: EmailBooking[]
  ): RebookingPattern[] {
    const patterns: RebookingPattern[] = []
    
    for (const cancelled of cancelledBookings) {
      const cancelDate = cancelled.updatedAt
      
      for (const confirmed of confirmedBookings) {
        // Skip if already matched in patterns
        if (patterns.some(p => p.replacementBooking.id === confirmed.id)) {
          continue
        }
        
        const bookingDate = confirmed.createdAt
        
        // Check if within rebooking window
        if (!isWithinRebookingWindow(cancelDate, bookingDate, 30)) {
          continue
        }
        
        // Calculate similarity
        const reasons: string[] = []
        let score = 0
        
        // Same customer email (strongest signal)
        if (cancelled.customerEmail === confirmed.customerEmail) {
          score += 0.5
          reasons.push('Same email address')
        }
        
        // Similar customer name
        const nameSim = calculateStringSimilarity(
          cancelled.customerName,
          confirmed.customerName
        )
        if (nameSim > 0.8) {
          score += nameSim * 0.3
          reasons.push(`Similar name (${(nameSim * 100).toFixed(0)}% match)`)
        }
        
        // Same tour or similar
        const tourSim = calculateStringSimilarity(
          cancelled.tourName,
          confirmed.tourName
        )
        if (tourSim > 0.7) {
          score += tourSim * 0.2
          reasons.push(`Similar tour (${(tourSim * 100).toFixed(0)}% match)`)
        }
        
        // If high enough similarity, add to patterns
        if (score > 0.7 && reasons.length >= 2) {
          patterns.push({
            originalBooking: cancelled,
            replacementBooking: confirmed,
            similarity: score,
            reasons,
            suggestedAction: `Link bookings: ${cancelled.bookingRef} → ${confirmed.bookingRef}`,
          })
        }
      }
    }
    
    return patterns
  }
  
  /**
   * Generate parser analysis and recommendations
   */
  private generateParserAnalysis(
    matches: MatchResult[],
    emailBookings: EmailBooking[],
    excelBookings: ExcelBooking[]
  ): TrackingReport['parserAnalysis'] {
    // Analyze by source
    const bySource = this.analyzeBySource(matches, emailBookings)
    
    // Analyze by field
    const byField = this.analyzeByField(matches)
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(matches, bySource, byField)
    
    return {
      bySource,
      byField,
      recommendations,
    }
  }
  
  /**
   * Analyze accuracy by booking source
   */
  private analyzeBySource(
    matches: MatchResult[],
    emailBookings: EmailBooking[]
  ): ParserAccuracy[] {
    const sources = [
      BookingSource.GYG,
      BookingSource.BOKUN,
      BookingSource.VIATOR,
      BookingSource.TRIPDOTCOM,
    ]
    
    return sources.map(source => {
      const sourceBookings = emailBookings.filter(b => b.source === source)
      const sourceMatches = matches.filter(
        m => m.emailBooking?.source === source || m.excelBooking?.source === source
      )
      
      const successfulMatches = sourceMatches.filter(
        m => m.status === 'perfect'
      ).length
      
      const partialMatches = sourceMatches.filter(
        m => m.status === 'partial'
      ).length
      
      const failures = sourceMatches.filter(
        m => m.status === 'missing'
      ).length
      
      const total = sourceMatches.length
      const accuracy = total > 0 ? ((successfulMatches + partialMatches * 0.5) / total) * 100 : 0
      
      // Collect common issues
      const commonIssues = this.identifyCommonIssues(
        sourceMatches.filter(m => m.status === 'partial' || m.status === 'missing'),
        source
      )
      
      return {
        source,
        totalBookings: sourceBookings.length,
        successfulMatches,
        partialMatches,
        failures,
        accuracy,
        commonIssues,
      }
    })
  }
  
  /**
   * Analyze accuracy by field
   */
  private analyzeByField(matches: MatchResult[]): FieldAccuracy[] {
    const fields = [
      'bookingRef',
      'customerName',
      'customerEmail',
      'phoneNumber',
      'tourDate',
      'tourName',
      'totalPrice',
      'numberOfAdult',
      'numberOfChild',
    ]
    
    return fields.map(fieldName => {
      const fieldDiscrepancies = matches
        .flatMap(m => m.discrepancies)
        .filter(d => d.field === fieldName)
      
      const totalComparisons = matches.filter(m => m.emailBooking).length
      const mismatches = fieldDiscrepancies.length
      const matchesCount = totalComparisons - mismatches
      const accuracy = totalComparisons > 0 ? (matchesCount / totalComparisons) * 100 : 100
      
      // Group common discrepancies
      const discrepancyGroups = groupBy(
        fieldDiscrepancies,
        d => `${d.excelValue}|${d.emailValue}`
      )
      
      const commonDiscrepancies = Object.entries(discrepancyGroups)
        .map(([key, items]) => {
          const [excelValue, emailValue] = key.split('|')
          return {
            excelValue,
            emailValue,
            count: items.length,
          }
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5) // Top 5
      
      return {
        fieldName,
        totalComparisons,
        matches: matchesCount,
        mismatches,
        accuracy,
        commonDiscrepancies,
      }
    })
  }
  
  /**
   * Identify common issues for a source
   */
  private identifyCommonIssues(matches: MatchResult[], source: BookingSource): string[] {
    const issues = new Set<string>()
    
    for (const match of matches) {
      for (const discrepancy of match.discrepancies) {
        if (discrepancy.note) {
          issues.add(discrepancy.note)
        } else {
          issues.add(`${discrepancy.field} mismatch`)
        }
      }
    }
    
    return Array.from(issues).slice(0, 5) // Top 5 issues
  }
  
  /**
   * Generate parser recommendations
   */
  private generateRecommendations(
    matches: MatchResult[],
    bySource: ParserAccuracy[],
    byField: FieldAccuracy[]
  ): ParserRecommendation[] {
    const recommendations: ParserRecommendation[] = []
    
    // Source-specific recommendations
    for (const sourceData of bySource) {
      if (sourceData.accuracy < 70) {
        recommendations.push({
          priority: 'high',
          parser: `${sourceData.source}Parser`,
          issue: `Low accuracy: ${sourceData.accuracy.toFixed(1)}%`,
          suggestion: `Review parser logic for ${sourceData.source}. Common issues: ${sourceData.commonIssues.join(', ')}`,
          affectedBookings: sourceData.failures + sourceData.partialMatches,
        })
      }
      
      // Specific issue recommendations
      if (sourceData.source === BookingSource.TRIPDOTCOM) {
        const priceIssues = matches.filter(
          m =>
            m.emailBooking?.source === BookingSource.TRIPDOTCOM &&
            m.emailBooking?.totalPrice === 0
        ).length
        
        if (priceIssues > 0) {
          recommendations.push({
            priority: 'high',
            parser: 'TripDotComParser',
            issue: `${priceIssues} bookings with missing price (price = 0)`,
            suggestion: 'Trip.com emails do not include price. Consider: (1) Fetch from Trip.com API, (2) Use rate card mapping, or (3) Manual entry workflow',
            affectedBookings: priceIssues,
          })
        }
      }
    }
    
    // Field-specific recommendations
    for (const fieldData of byField) {
      if (fieldData.accuracy < 80 && fieldData.mismatches > 5) {
        recommendations.push({
          priority: fieldData.accuracy < 60 ? 'high' : 'medium',
          parser: 'General',
          issue: `Field "${fieldData.fieldName}" has low accuracy: ${fieldData.accuracy.toFixed(1)}%`,
          suggestion: `Review parsing patterns for ${fieldData.fieldName}. ${fieldData.mismatches} mismatches detected.`,
          affectedBookings: fieldData.mismatches,
          examples: fieldData.commonDiscrepancies.slice(0, 3).map(d => ({
            bookingRef: 'Multiple',
            problem: `Excel: "${d.excelValue}" vs Email: "${d.emailValue}" (${d.count}x)`,
          })),
        })
      }
    }
    
    // Sort by priority and affected bookings
    recommendations.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 }
      const aPriority = priorityWeight[a.priority]
      const bPriority = priorityWeight[b.priority]
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority
      }
      
      return b.affectedBookings - a.affectedBookings
    })
    
    return recommendations
  }
  
  /**
   * Determine possible reasons for missing bookings
   */
  private determineMissingReasons(booking: ExcelBooking): string[] {
    const reasons: string[] = []
    
    reasons.push('Email not received or processed')
    reasons.push('Parser failed to extract data from email')
    reasons.push('Email moved to spam or different folder')
    reasons.push('Booking made through different channel not monitored')
    
    // Source-specific reasons
    if (booking.source === BookingSource.TRIPDOTCOM) {
      reasons.push('Trip.com email format changed')
    }
    
    return reasons
  }
  
  /**
   * Calculate date range from bookings
   */
  private calculateDateRange(
    excelBookings: ExcelBooking[],
    emailBookings: EmailBooking[]
  ): { from: Date; to: Date } {
    const allDates = [
      ...excelBookings.map(b => b.tourDate),
      ...emailBookings.map(b => b.tourDate),
    ]
    
    const sortedDates = allDates.sort((a, b) => a.getTime() - b.getTime())
    
    return {
      from: sortedDates[0] || new Date(),
      to: sortedDates[sortedDates.length - 1] || new Date(),
    }
  }
}

// Singleton instance
let reportGenerator: ReportGenerator | null = null

export function getReportGenerator(): ReportGenerator {
  if (!reportGenerator) {
    reportGenerator = new ReportGenerator()
  }
  return reportGenerator
}
