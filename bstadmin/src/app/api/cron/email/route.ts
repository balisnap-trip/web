import { NextRequest, NextResponse } from 'next/server'
import { runEmailCronJob } from '@/lib/cron/email-cron'

/**
 * POST /api/cron/email
 * Cron: sync emails (limit 50) then fetch bookings from email_inbox window
 */
export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret || (process.env.NODE_ENV === 'production' && expectedSecret === 'change-me-in-production')) {
      console.error('[API /cron/email] CRON_SECRET is not configured')
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 503 }
      )
    }

    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === expectedSecret

    if (!isCron) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const result = await runEmailCronJob()

    if (result.skipped && result.reason === 'disabled') {
      return NextResponse.json(
        { error: 'Cron processing is disabled' },
        { status: 403 }
      )
    }
    if (result.skipped && result.reason === 'already_running') {
      return NextResponse.json(
        { error: 'Cron is already running' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      sync: result.sync,
      fetch: result.fetch,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API /cron/email] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
