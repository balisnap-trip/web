import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getWhatsAppService } from '@/lib/integrations/whatsapp'

/**
 * POST /api/bookings/[id]/assign/notify
 * Send WhatsApp notification for the currently assigned driver
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const bookingId = parseInt(id)

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        package: true,
        user: true,
        driver: true,
      },
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    if (!booking.driver) {
      return NextResponse.json(
        { error: 'No driver assigned to this booking' },
        { status: 400 }
      )
    }

    const whatsapp = getWhatsAppService()

    const message = [
      `🚗 *Driver Assignment*`,
      ``,
      `*Booking Ref:* ${booking.bookingRef || `#${booking.id}`}`,
      `*Driver:* ${booking.driver.name}`,
      `*Phone:* ${booking.driver.phone}`,
      `*Vehicle:* ${booking.driver.vehicleType}`,
      ``,
      `*Tour Details:*`,
      `Tour: ${booking.package?.packageName || 'Custom Tour'}`,
      `Date: ${new Date(booking.tourDate).toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`,
      ``,
      `*Customer:* ${booking.mainContactName}`,
      `*Phone:* ${booking.phoneNumber || 'N/A'}`,
      `*Email:* ${booking.mainContactEmail}`,
      ``,
      `*Pax:* ${booking.numberOfAdult} Adult${booking.numberOfAdult > 1 ? 's' : ''}${booking.numberOfChild ? ` + ${booking.numberOfChild} Child${booking.numberOfChild > 1 ? 'ren' : ''}` : ''}`,
      ``,
      booking.meetingPoint ? `*Meeting Point:* ${booking.meetingPoint}` : '',
      ``,
      booking.note ? `*Notes:* ${booking.note}` : '',
      ``,
      `✅ *Sent by:* ${session.user.name || session.user.email}`,
      `📅 *Sent at:* ${new Date().toLocaleString()}`,
    ].filter(Boolean).join('\n')

    const sent = await whatsapp.sendToGroup(message)

    return NextResponse.json({
      success: sent,
      message: sent ? 'WhatsApp notification sent.' : 'WhatsApp notification not sent (disabled or failed).',
    })
  } catch (error) {
    console.error('[API /bookings/[id]/assign/notify] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
