import { NextRequest, NextResponse } from 'next/server'
import { getBookingFetchService } from '@/lib/email/booking-fetch'
import { syncAllBookingStatuses } from '@/lib/booking/status'
import { prisma } from '@/lib/db'

/**
 * POST /api/bookings/fetch
 * Parse pending emails and create bookings
 */
export async function POST(req: NextRequest) {
  try {
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    const sendEvent = async (event: string, data: any) => {
      try {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        await writer.write(encoder.encode(message))
      } catch (err) {
        // Client likely disconnected; avoid crashing background task
        console.warn('[Booking Fetch API] Stream write failed:', err)
      }
    }

    // Start fetch in background
    ;(async () => {
      try {
        const fetchService = getBookingFetchService((progress) => {
          sendEvent('progress', progress).catch(console.error)
        })

        const results = await fetchService.fetchBookings()
        await syncAllBookingStatuses(prisma)

        await sendEvent('complete', {
          success: true,
          results,
        })
      } catch (error) {
        console.error('[Booking Fetch API] Error:', error)
        await sendEvent('error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        try {
          await writer.close()
        } catch (err) {
          console.warn('[Booking Fetch API] Stream close failed:', err)
        }
      }
    })()

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Booking Fetch API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/bookings/fetch
 * Get fetch statistics
 */
export async function GET() {
  try {
    const { prisma } = await import('@/lib/db')

    const totalBookings = await prisma.booking.count()
    const newBookings = await prisma.booking.count({ where: { status: 'NEW' } })
    const readyBookings = await prisma.booking.count({ where: { status: 'READY' } })
    const attentionBookings = await prisma.booking.count({ where: { status: 'ATTENTION' } })
    const completedBookings = await prisma.booking.count({ where: { status: 'COMPLETED' } })
    const doneBookings = await prisma.booking.count({ where: { status: 'DONE' } })
    const cancelledBookings = await prisma.booking.count({ where: { status: 'CANCELLED' } })
    const updatedBookings = await prisma.booking.count({ where: { status: 'UPDATED' } })

    const pendingEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { none: {} }
      }
    })

    return NextResponse.json({
      success: true,
      stats: {
        totalBookings,
        newBookings,
        readyBookings,
        attentionBookings,
        completedBookings,
        doneBookings,
        cancelledBookings,
        updatedBookings,
        pendingEmails, // Emails waiting to be parsed
      },
    })
  } catch (error) {
    console.error('[Booking Fetch API] Error getting stats:', error)
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    )
  }
}
