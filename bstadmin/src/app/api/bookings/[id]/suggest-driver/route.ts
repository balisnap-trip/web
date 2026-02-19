import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { driverSuggestionService } from '@/lib/services/driver-suggestion'

/**
 * GET /api/bookings/[id]/suggest-driver
 * Get suggested driver for a booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const bookingId = parseInt(id)
    
    // Fetch booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    })
    
    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }
    
    // Don't suggest if already assigned
    if (booking.assignedDriverId) {
      return NextResponse.json({
        suggestion: null,
        message: 'Driver already assigned'
      })
    }
    
    // Get suggestion from service
    const suggestion = await driverSuggestionService.suggestDriverForBooking({
      tourDate: booking.tourDate,
      mainContactName: booking.mainContactName,
      mainContactEmail: booking.mainContactEmail,
      phoneNumber: booking.phoneNumber
    })
    
    return NextResponse.json({
      suggestion,
      success: true
    })
  } catch (error) {
    console.error('[Suggest Driver API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get driver suggestion' },
      { status: 500 }
    )
  }
}
