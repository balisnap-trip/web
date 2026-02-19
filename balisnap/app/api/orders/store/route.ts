import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError, logApiError } from '@/lib/api/http'
import { validateCreateBookingInput } from '@/lib/api/validators'
import { authOptions } from '@/lib/auth'
import { emitBookingEventToCore } from '@/lib/integrations/core-ingest'
import { createBooking } from '@/lib/utils/booking/createBooking'
import { sendBookingEmail } from '@/lib/utils/sendMail/sendBookingEmail'

const toIsoDate = (value: unknown) => {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  return parsed.toISOString().slice(0, 10)
}

const toIsoTime = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }

  if (/^\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 5)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed.toISOString().slice(11, 16)
}

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

    const createdEventResult = await emitBookingEventToCore({
      idempotencyKey: `direct-created-${booking.booking_id}`,
      event: {
        payloadVersion: 'v1',
        eventType: 'CREATED',
        eventTime: new Date().toISOString(),
        source: 'DIRECT',
        externalBookingRef:
          String(booking.booking_ref || '').trim() ||
          `DIRECT-${booking.booking_id}`,
        customer: {
          name: booking.main_contact_name || undefined,
          email: booking.main_contact_email || undefined,
          phone: booking.phone_number || undefined,
        },
        booking: {
          tourDate: toIsoDate(booking.booking_date),
          tourTime: toIsoTime(booking.TourItineraries?.[0]?.start_time),
          adult: Number(booking.number_of_adult || 0),
          child: Number(booking.number_of_child || 0),
          currency: booking.currency_code || 'USD',
          totalPrice: Number(booking.total_price || 0),
          pickupLocation: booking.meeting_point || undefined,
          meetingPoint: booking.meeting_point || undefined,
          note: booking.note || undefined,
        },
        raw: {
          providerPayload: {
            origin: 'balisnap.orders.store',
            bookingId: booking.booking_id,
            bookingRef: booking.booking_ref,
            variantId: payload.variantId,
            packageId: payload.packageId,
            departureId: payload.departureId,
          },
        },
      },
    })

    if (!createdEventResult.disabled && !createdEventResult.accepted) {
      logApiError(
        'api/orders/store:emit-core-ingest',
        createdEventResult.error || 'emit booking created failed',
        {
          booking_id: booking.booking_id,
          status: createdEventResult.status,
          attempts: createdEventResult.attempts,
        }
      )
    }

    return apiSuccess(booking, 201)
  } catch (error) {
    return handleApiError('api/orders/store', error)
  }
}
