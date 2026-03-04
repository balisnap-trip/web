import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { authOptions } from '@/lib/auth'
import { getBookingByIdForSessionUser } from '@/lib/customer-bookings'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = Number(params.id)

    if (!Number.isInteger(bookingId) || bookingId < 1) {
      throw new ApiError(400, 'Invalid booking id', 'VALIDATION_ERROR')
    }

    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as
      | { id?: string; email?: string }
      | undefined

    const booking = await getBookingByIdForSessionUser(bookingId, sessionUser)

    if (!booking) {
      throw new ApiError(404, 'Booking not found', 'NOT_FOUND')
    }

    return apiSuccess(booking, 200)
  } catch (error) {
    return handleApiError('api/booking/[id]', error)
  }
}
