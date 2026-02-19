import { addDays } from 'date-fns'
import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildTourPackageCompat } from '@/lib/utils/booking/compat'

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

    if (!sessionUser?.id && !sessionUser?.email) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

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
        User: true,
        TourPackage: true,
        BookingItems: {
          select: {
            item_status: true,
            total_amount: true,
            adult_qty: true,
            child_qty: true,
            adult_unit_price: true,
            child_unit_price: true,
            departure_id: true,
            TourVariant: {
              select: {
                variant_id: true,
                variant_name: true,
                duration_days: true,
                min_pax: true,
                max_pax: true,
                TourProduct: {
                  select: {
                    product_id: true,
                    product_name: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!booking) {
      throw new ApiError(404, 'Booking not found', 'NOT_FOUND')
    }

    const tourPackageCompat = buildTourPackageCompat(booking)
    const durationDays = Math.max(
      1,
      Number(
        tourPackageCompat?.duration_days ??
          booking.BookingItems?.[0]?.TourVariant?.duration_days ??
          1
      )
    )
    const endDate = addDays(new Date(booking.booking_date), durationDays - 1)

    return apiSuccess(
      {
        ...booking,
        TourPackage: tourPackageCompat,
        duration_days: durationDays,
        endDate: endDate.toISOString()
      },
      200
    )
  } catch (error) {
    return handleApiError('api/booking/[id]', error)
  }
}
