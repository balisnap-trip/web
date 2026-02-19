import { NextRequest, NextResponse } from 'next/server'
import { getEmailSyncService } from '@/lib/email/email-sync'
import { getBookingFetchService } from '@/lib/email/booking-fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/email/process
 * Trigger email sync + booking fetch manually
 * 
 * Can be called by:
 * 1. Authenticated admin users (manual trigger)
 * 2. External cron services with secret token
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication - either session OR cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = process.env.CRON_SECRET

    const isCron = cronSecret === expectedSecret
    if (!isCron) {
      const session = await getServerSession(authOptions)
      if (!session || session.user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Cron processing moved to /api/cron/email' },
        { status: 403 }
      )
    }

    const mode = isCron ? 'cron' : 'manual'
    const syncService = getEmailSyncService()
    const syncResults = await syncService.syncEmails({ mode })

    const fetchService = getBookingFetchService()
    const fetchResults = await fetchService.fetchBookings({ mode })

    return NextResponse.json({
      success: true,
      results: {
        sync: syncResults,
        fetch: fetchResults,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API /email/process] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/email/process
 * Get processing status (for monitoring)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { prisma } = await import('@/lib/db')
    
    // Get recent email stats (new architecture)
    const totalEmails = await prisma.emailInbox.count()
    const bookingEmails = await prisma.emailInbox.count({
      where: { isBookingEmail: true },
    })
    const processedBookingEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { some: {} }, // Has been linked to at least one booking
      },
    })
    const unprocessedBookingEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { none: {} }, // Not yet processed
      },
    })

    // Get ALL emails with booking relations
    const recentEmails = await prisma.emailInbox.findMany({
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        isBookingEmail: true,
        source: true,
        errorMessage: true,
        bookingEmails: {
          select: {
            relationType: true,
            booking: {
              select: {
                bookingRef: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({
      stats: {
        total: totalEmails,
        bookingEmails: bookingEmails,
        processed: processedBookingEmails,
        unprocessed: unprocessedBookingEmails,
      },
      recentEmails,
    })
  } catch (error) {
    console.error('[API /email/process] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
