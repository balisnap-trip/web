import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/settings/clean-bookings
 * Dev-only: delete all bookings for re-parsing
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized - Admin only' },
      { status: 401 }
    )
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This action is disabled in production' },
      { status: 403 }
    )
  }

  try {
    const result = await prisma.booking.deleteMany()

    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    console.error('[API /settings/clean-bookings] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
