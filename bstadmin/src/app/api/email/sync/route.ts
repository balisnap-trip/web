import { NextRequest, NextResponse } from 'next/server'
import { getEmailSyncService } from '@/lib/email/email-sync'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * POST /api/email/sync
 * Synchronize emails from IMAP to database (no parsing)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    const sendEvent = async (event: string, data: any) => {
      try {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        await writer.write(encoder.encode(message))
      } catch (err) {
        // Client likely disconnected; avoid crashing background task
        console.warn('[Email Sync API] Stream write failed:', err)
      }
    }

    // Start sync in background
    ;(async () => {
      try {
        const syncService = getEmailSyncService((progress) => {
          sendEvent('progress', progress).catch(console.error)
        })

        const results = await syncService.syncEmails({ mode: 'manual' })

        await sendEvent('complete', {
          success: true,
          results,
        })
      } catch (error) {
        console.error('[Email Sync API] Error:', error)
        await sendEvent('error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        try {
          await writer.close()
        } catch (err) {
          console.warn('[Email Sync API] Stream close failed:', err)
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
    console.error('[Email Sync API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to sync emails' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/email/sync
 * Get sync statistics
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { prisma } = await import('@/lib/db')

    const totalEmails = await prisma.emailInbox.count()
    const bookingEmails = await prisma.emailInbox.count({ where: { isBookingEmail: true } })
    const processedEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { some: {} },
      },
    })
    const unprocessedEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { none: {} },
      },
    })

    return NextResponse.json({
      success: true,
      stats: {
        total: totalEmails,
        bookingEmails,
        processed: processedEmails,
        unprocessed: unprocessedEmails,
      },
    })
  } catch (error) {
    console.error('[Email Sync API] Error getting stats:', error)
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    )
  }
}
