import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { validateBookingIdInput } from '@/lib/api/validators'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPayableTotal } from '@/lib/utils/booking/compat'
import { createOrder } from '@/lib/utils/paymentServices/payment-services'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as
      | { id?: string; email?: string }
      | undefined

    if (!sessionUser?.id && !sessionUser?.email) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const bookingId = validateBookingIdInput(await req.json())

    const booking = await prisma.booking.findFirst({
      where: {
        booking_id: bookingId,
        ...(sessionUser?.id
          ? { user_id: sessionUser.id }
          : {
              User: {
                email: sessionUser?.email
              }
            })
      },
      include: {
        Payments: true,
        BookingItems: {
          select: {
            item_status: true,
            total_amount: true
          }
        }
      }
    })

    if (!booking) {
      throw new ApiError(404, 'Booking not found', 'NOT_FOUND')
    }

    const hasCompletedPayment = booking.Payments.some(
      (payment) => payment.payment_status === 'COMPLETED'
    )

    if (
      hasCompletedPayment ||
      booking.status === 'paid' ||
      booking.status === 'completed' ||
      booking.status === 'cancelled'
    ) {
      throw new ApiError(
        409,
        'Booking payment cannot be processed for current status',
        'INVALID_BOOKING_STATUS'
      )
    }

    const payableTotal = getPayableTotal(booking)

    const { jsonResponse, httpStatusCode } = await createOrder({
      amount: payableTotal,
      bookingId: booking.booking_id,
      bookingRef: booking.booking_ref
    })

    return apiSuccess(jsonResponse, httpStatusCode)
  } catch (error) {
    return handleApiError('api/orders', error)
  }
}
