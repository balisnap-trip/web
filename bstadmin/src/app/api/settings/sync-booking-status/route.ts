import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncAllBookingStatuses } from '@/lib/booking/status'

/**
 * POST /api/settings/sync-booking-status
 * Recompute booking statuses based on current rules.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
  }

  try {
    const result = await syncAllBookingStatuses(prisma)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[API /settings/sync-booking-status] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
