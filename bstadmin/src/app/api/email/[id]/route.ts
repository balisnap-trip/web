import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/email/[id]
 * Get single email details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const email = await prisma.emailInbox.findUnique({
      where: { id },
      include: {
        bookingEmails: {
          include: {
            booking: {
              select: { id: true, bookingRef: true },
            },
          },
        },
      },
    })

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ email })
  } catch (error) {
    console.error('[API /email/[id]] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/email/[id]
 * Delete email
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Unauthorized - Admin only' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params

    const existingEmail = await prisma.emailInbox.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existingEmail) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      )
    }

    await prisma.emailInbox.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: 'Email deleted successfully',
    })
  } catch (error) {
    console.error('[API /email/[id]] Error deleting email:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
