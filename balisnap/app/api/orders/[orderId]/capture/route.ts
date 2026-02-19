import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { validateBookingIdInput } from '@/lib/api/validators'
import { authOptions } from '@/lib/auth'
import { emitBookingEventToCore } from '@/lib/integrations/core-ingest'
import { prisma } from '@/lib/db'
import { getPayableTotal } from '@/lib/utils/booking/compat'
import { createPayment } from '@/lib/utils/booking/createBooking'
import { generateAccessToken } from '@/lib/utils/paymentServices/payment-services'

const getCapturedAmount = (capturePayload: any) => {
  const purchaseUnit = capturePayload?.purchase_units?.[0]
  const capture = purchaseUnit?.payments?.captures?.[0]
  const amountValue = capture?.amount?.value ?? purchaseUnit?.amount?.value
  const amount = Number(amountValue)

  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : Number.NaN
}

const getCurrency = (capturePayload: any) => {
  const purchaseUnit = capturePayload?.purchase_units?.[0]
  const capture = purchaseUnit?.payments?.captures?.[0]

  return capture?.amount?.currency_code ?? purchaseUnit?.amount?.currency_code
}

const toIsoDate = (value: unknown) => {
  const parsed = value instanceof Date ? value : value ? new Date(String(value)) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }
  return parsed.toISOString().slice(0, 10)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const orderId = params.orderId?.trim()

    if (!orderId) {
      throw new ApiError(400, 'Order ID is required', 'VALIDATION_ERROR')
    }

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

    const accessToken = await generateAccessToken()
    const paypalApiUrl = process.env.PAYPAL_API_URL

    if (!paypalApiUrl) {
      throw new ApiError(
        500,
        'PayPal API URL is missing',
        'PAYPAL_CONFIG_ERROR'
      )
    }

    const captureResponse = await fetch(
      `${paypalApiUrl}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    const captureRaw = await captureResponse.text()
    let capturePayload: any = {}

    try {
      capturePayload = captureRaw ? JSON.parse(captureRaw) : {}
    } catch {
      capturePayload = { raw: captureRaw }
    }

    if (!captureResponse.ok) {
      throw new ApiError(
        502,
        'Failed to capture PayPal order',
        'PAYPAL_CAPTURE_ERROR',
        capturePayload
      )
    }

    const purchaseUnit = capturePayload?.purchase_units?.[0]
    const customId = purchaseUnit?.custom_id

    if (customId && customId !== String(booking.booking_id)) {
      throw new ApiError(
        422,
        'Order does not belong to this booking',
        'ORDER_BOOKING_MISMATCH',
        { order_custom_id: customId, booking_id: booking.booking_id }
      )
    }

    const capturedAmount = getCapturedAmount(capturePayload)

    if (!Number.isFinite(capturedAmount)) {
      throw new ApiError(
        422,
        'Captured amount is invalid',
        'INVALID_CAPTURE_AMOUNT',
        capturePayload
      )
    }

    const expectedAmount = getPayableTotal(booking)

    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      throw new ApiError(
        422,
        'Captured amount does not match booking total',
        'AMOUNT_MISMATCH',
        {
          capturedAmount,
          expectedAmount
        }
      )
    }

    if (getCurrency(capturePayload) !== 'USD') {
      throw new ApiError(
        422,
        'Unsupported payment currency',
        'INVALID_CURRENCY',
        { currency: getCurrency(capturePayload) }
      )
    }

    if (capturePayload.status !== 'COMPLETED') {
      throw new ApiError(
        409,
        'Payment has not completed',
        'PAYMENT_NOT_COMPLETED',
        { status: capturePayload.status }
      )
    }

    const source = capturePayload?.payment_source
      ? Object.keys(capturePayload.payment_source)[0]
      : 'paypal'
    const capturedAt = purchaseUnit?.payments?.captures?.[0]?.create_time

    await createPayment({
      booking_id: booking.booking_id,
      user_id: booking.user_id,
      payment_date: capturedAt ? new Date(capturedAt) : new Date(),
      amount: capturedAmount,
      payment_method: source || 'paypal',
      payment_status: capturePayload.status,
      payment_ref: capturePayload.id
    })

    const paymentEventResult = await emitBookingEventToCore({
      idempotencyKey: `direct-payment-captured-${booking.booking_id}-${capturePayload.id || orderId}`,
      event: {
        payloadVersion: 'v1',
        eventType: 'UPDATED',
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
            origin: 'balisnap.orders.capture',
            bookingId: booking.booking_id,
            bookingRef: booking.booking_ref,
            orderId,
            paymentRef: capturePayload.id,
            paymentStatus: capturePayload.status,
            capturedAmount,
            currency: getCurrency(capturePayload),
            capturePayload,
          },
        },
      },
    })

    if (!paymentEventResult.disabled && !paymentEventResult.accepted) {
      console.error(
        '[api/orders/[orderId]/capture] emit-core-ingest failed',
        {
          booking_id: booking.booking_id,
          status: paymentEventResult.status,
          attempts: paymentEventResult.attempts,
          error: paymentEventResult.error,
        }
      )
    }

    return apiSuccess(capturePayload, 200)
  } catch (error) {
    return handleApiError('api/orders/[orderId]/capture', error)
  }
}
