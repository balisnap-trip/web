import { NextRequest } from 'next/server'
import { getEmailSyncService } from '@/lib/email/email-sync'
import { getBookingFetchService } from '@/lib/email/booking-fetch'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/email/process-stream
 * Stream email processing progress using Server-Sent Events
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create a TransformStream for SSE
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Helper to send SSE message
    const sendEvent = async (event: string, data: any) => {
      try {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        await writer.write(encoder.encode(message))
      } catch (err) {
        console.warn('[API /email/process-stream] Stream write failed:', err)
      }
    }

    // Start processing in background
    ;(async () => {
      try {
        await sendEvent('progress', {
          stage: 'sync',
          percentage: 0,
          current: 0,
          total: 0,
          account: 'Starting',
          status: 'Initializing email sync...',
        })

        const syncService = getEmailSyncService((progress) => {
          sendEvent('progress', { stage: 'sync', ...progress }).catch(console.error)
        })

        const syncResults = await syncService.syncEmails({ mode: 'manual' })

        await sendEvent('progress', {
          stage: 'fetch',
          percentage: 0,
          current: 0,
          total: 0,
          account: 'Booking Fetch',
          status: 'Processing booking emails...',
        })

        const fetchService = getBookingFetchService((progress) => {
          sendEvent('progress', { stage: 'fetch', account: 'Booking Fetch', ...progress }).catch(console.error)
        })

        const fetchResults = await fetchService.fetchBookings({ mode: 'manual' })

        await sendEvent('complete', {
          success: true,
          results: {
            sync: syncResults,
            fetch: fetchResults,
          },
          timestamp: new Date().toISOString(),
        })
      } catch (error) {
        console.error('[API /email/process-stream] Error:', error)
        await sendEvent('error', {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        await writer.close()
      }
    })()

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[API /email/process-stream] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
