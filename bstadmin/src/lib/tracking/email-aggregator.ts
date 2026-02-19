import { prisma } from '@/lib/db'
import { EmailBooking } from '@/types/tracking'
import { BookingStatus } from '@prisma/client'

/**
 * Email Aggregator
 * Fetches and aggregates parsed booking data from database
 */
export class EmailAggregator {
  /**
   * Fetch all processed bookings from database
   */
  async fetchAllBookings(options?: {
    dateFrom?: Date
    dateTo?: Date
    includeStatuses?: BookingStatus[]
  }): Promise<EmailBooking[]> {
    console.log('[Email Aggregator] Fetching bookings from database...')
    
    const whereClause: any = {}
    
    // Date range filter
    if (options?.dateFrom || options?.dateTo) {
      whereClause.tourDate = {}
      if (options.dateFrom) {
        whereClause.tourDate.gte = options.dateFrom
      }
      if (options.dateTo) {
        whereClause.tourDate.lte = options.dateTo
      }
    }
    
    // Status filter (default: all statuses)
    if (options?.includeStatuses && options.includeStatuses.length > 0) {
      whereClause.status = {
        in: options.includeStatuses,
      }
    }
    
    try {
      const bookings = await prisma.booking.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          package: {
            select: {
              packageName: true,
            },
          },
        },
        orderBy: {
          tourDate: 'asc',
        },
      })
      
      console.log(`[Email Aggregator] Found ${bookings.length} bookings in database`)
      
      // Get related email data
      const emailData = await this.fetchEmailMetadata(
        bookings.map(b => b.id)
      )
      
      // Map to EmailBooking format
      const emailBookings: EmailBooking[] = bookings.map(booking => {
        const email = emailData.get(booking.id)
        
        return {
          id: booking.id,
          bookingRef: booking.bookingRef || '',
          customerName: booking.mainContactName || booking.user.name || 'Unknown',
          customerEmail: booking.mainContactEmail || booking.user.email || '',
          phoneNumber: booking.phoneNumber || undefined,
          tourDate: booking.tourDate,
          tourTime: booking.tourTime || undefined,
          tourName: booking.package?.packageName || 'Unknown Tour',
          totalPrice: Number(booking.totalPrice) || 0,
          currency: booking.currency,
          source: booking.source,
          status: booking.status,
          numberOfAdult: booking.numberOfAdult,
          numberOfChild: booking.numberOfChild || undefined,
          meetingPoint: booking.meetingPoint || undefined,
          note: booking.note || undefined,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
          emailId: email?.id,
          emailSubject: email?.subject,
          emailReceivedAt: email?.receivedAt,
          parsedData: email?.parsedData,
        }
      })
      
      return emailBookings
    } catch (error) {
      console.error('[Email Aggregator] Error fetching bookings:', error)
      throw error
    }
  }
  
  /**
   * Fetch email metadata for bookings
   */
  private async fetchEmailMetadata(
    bookingIds: number[]
  ): Promise<Map<number, any>> {
    if (bookingIds.length === 0) return new Map()
    
    try {
      const bookingEmails = await prisma.bookingEmail.findMany({
        where: {
          bookingId: { in: bookingIds },
        },
        select: {
          bookingId: true,
          email: {
            select: {
              id: true,
              subject: true,
              receivedAt: true,
              parsedData: true,
            },
          },
        },
        orderBy: {
          email: { receivedAt: 'desc' },
        },
      })
      
      const map = new Map<number, any>()
      bookingEmails.forEach(be => {
        if (!map.has(be.bookingId)) {
          map.set(be.bookingId, be.email)
        }
      })
      
      return map
    } catch (error) {
      console.error('[Email Aggregator] Error fetching email metadata:', error)
      return new Map()
    }
  }
  
  /**
   * Get confirmed bookings only
   */
  async fetchConfirmedBookings(options?: {
    dateFrom?: Date
    dateTo?: Date
  }): Promise<EmailBooking[]> {
    return this.fetchAllBookings({
      ...options,
      includeStatuses: ['READY', 'ATTENTION', 'COMPLETED', 'DONE'],
    })
  }
  
  /**
   * Get cancelled bookings only
   */
  async fetchCancelledBookings(options?: {
    dateFrom?: Date
    dateTo?: Date
  }): Promise<EmailBooking[]> {
    return this.fetchAllBookings({
      ...options,
      includeStatuses: ['CANCELLED'],
    })
  }
  
  /**
   * Get bookings by source
   */
  async fetchBookingsBySource(source: string, options?: {
    dateFrom?: Date
    dateTo?: Date
  }): Promise<EmailBooking[]> {
    const allBookings = await this.fetchAllBookings(options)
    return allBookings.filter(b => b.source === source)
  }
  
  /**
   * Get statistics
   */
  async getStatistics(options?: {
    dateFrom?: Date
    dateTo?: Date
  }): Promise<{
    total: number
    confirmed: number
    cancelled: number
    completed: number
    noShow: number
    bySource: Record<string, number>
  }> {
    const allBookings = await this.fetchAllBookings(options)
    
    const stats = {
      total: allBookings.length,
      confirmed: 0,
      cancelled: 0,
      completed: 0,
      noShow: 0,
      bySource: {} as Record<string, number>,
    }
    
    allBookings.forEach(booking => {
      // Count by status
      switch (booking.status) {
        case 'READY':
          stats.confirmed++
          break
        case 'ATTENTION':
          stats.confirmed++
          break
        case 'CANCELLED':
          stats.cancelled++
          break
        case 'COMPLETED':
          stats.completed++
          break
        case 'DONE':
          stats.completed++
          break
        case 'NO_SHOW':
          stats.noShow++
          break
      }
      
      // Count by source
      const source = booking.source
      stats.bySource[source] = (stats.bySource[source] || 0) + 1
    })
    
    return stats
  }
  
  /**
   * Find potential rebookings
   * Returns pairs of cancelled + new bookings that might be related
   */
  async findPotentialRebookings(
    cancelledBookings: EmailBooking[],
    confirmedBookings: EmailBooking[],
    maxDaysApart: number = 30
  ): Promise<Array<{
    cancelled: EmailBooking
    potential: EmailBooking
    daysBetween: number
  }>> {
    const pairs: Array<{
      cancelled: EmailBooking
      potential: EmailBooking
      daysBetween: number
    }> = []
    
    for (const cancelled of cancelledBookings) {
      const cancelDate = cancelled.updatedAt // When it was cancelled
      
      for (const confirmed of confirmedBookings) {
        const bookingDate = confirmed.createdAt
        
        // Check if booked within window after cancellation
        const daysBetween = Math.floor(
          (bookingDate.getTime() - cancelDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        
        if (daysBetween >= 0 && daysBetween <= maxDaysApart) {
          // Same customer email or similar name
          const sameEmail = cancelled.customerEmail === confirmed.customerEmail
          const similarName = this.calculateNameSimilarity(
            cancelled.customerName,
            confirmed.customerName
          ) > 0.8
          
          if (sameEmail || similarName) {
            pairs.push({
              cancelled,
              potential: confirmed,
              daysBetween,
            })
          }
        }
      }
    }
    
    return pairs
  }
  
  /**
   * Calculate name similarity (simple version)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = name1.toLowerCase().trim()
    const n2 = name2.toLowerCase().trim()
    
    if (n1 === n2) return 1
    
    // Simple word overlap
    const words1 = n1.split(/\s+/)
    const words2 = n2.split(/\s+/)
    
    const commonWords = words1.filter(w => words2.includes(w))
    
    return commonWords.length / Math.max(words1.length, words2.length)
  }
}

// Singleton instance
let emailAggregator: EmailAggregator | null = null

export function getEmailAggregator(): EmailAggregator {
  if (!emailAggregator) {
    emailAggregator = new EmailAggregator()
  }
  return emailAggregator
}
