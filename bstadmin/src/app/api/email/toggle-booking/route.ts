import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * POST /api/email/toggle-booking
 * Toggle isBookingEmail flag for an email
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

    const body = await req.json()
    const { emailId, isBookingEmail } = body

    if (!emailId || typeof isBookingEmail !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Update the email
    const updated = await prisma.emailInbox.update({
      where: { id: emailId },
      data: { isBookingEmail },
    })

    return NextResponse.json({
      success: true,
      email: {
        id: updated.id,
        isBookingEmail: updated.isBookingEmail,
      },
    })
  } catch (error) {
    console.error('[API /email/toggle-booking] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
