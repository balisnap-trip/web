import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError, logApiError } from '@/lib/api/http'
import { validateCreateBookingInput } from '@/lib/api/validators'
import { authOptions } from '@/lib/auth'
import { createBooking } from '@/lib/utils/booking/createBooking'
import { sendBookingEmail } from '@/lib/utils/sendMail/sendBookingEmail'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as { id?: string; email?: string } | undefined

    if (!sessionUser?.id) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const payload = validateCreateBookingInput(await req.json())
    const booking = await createBooking({
      ...payload,
      userId: sessionUser.id
    })

    try {
      const mailResult = await sendBookingEmail(booking)

      if (mailResult.status !== 'ok') {
        logApiError('api/orders/store:send-mail', mailResult, {
          booking_id: booking.booking_id
        })
      }
    } catch (error) {
      logApiError('api/orders/store:send-mail', error, {
        booking_id: booking.booking_id
      })
    }

    return apiSuccess(booking, 201)
  } catch (error) {
    return handleApiError('api/orders/store', error)
  }
}
