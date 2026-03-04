import { addDays } from 'date-fns'

import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/db'
import { buildTourPackageCompat } from '@/lib/utils/booking/compat'

export type SessionUser = {
  id?: string
  email?: string
}

const toSerializable = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const resolveBookingUserWhere = (sessionUser: SessionUser) =>
  sessionUser.id
    ? {
        user_id: sessionUser.id
      }
    : {
        User: {
          email: sessionUser.email
        }
      }

export const hasSessionUser = (sessionUser?: SessionUser) =>
  Boolean(sessionUser?.id || sessionUser?.email)

export const assertSessionUser = (
  sessionUser?: SessionUser
): asserts sessionUser is SessionUser => {
  if (!hasSessionUser(sessionUser)) {
    throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
  }
}

export async function getBookingsForSessionUser(sessionUser: SessionUser) {
  assertSessionUser(sessionUser)

  const bookings = await prisma.booking.findMany({
    where: resolveBookingUserWhere(sessionUser),
    orderBy: { created_at: 'desc' },
    take: 10,
    include: {
      Payments: true,
      User: true,
      TourPackage: true,
      BookingItems: {
        select: {
          adult_unit_price: true,
          child_unit_price: true,
          TourVariant: {
            select: {
              variant_id: true,
              duration_days: true,
              min_pax: true,
              max_pax: true,
              TourProduct: {
                select: {
                  product_id: true,
                  product_name: true
                }
              }
            }
          }
        }
      },
      Reviews: true
    }
  })

  const normalizedBookings = bookings.map((booking) => ({
    ...booking,
    TourPackage: buildTourPackageCompat(booking)
  }))

  return toSerializable(normalizedBookings)
}

export async function getBookingByIdForSessionUser(
  bookingId: number,
  sessionUser: SessionUser
) {
  assertSessionUser(sessionUser)

  const booking = await prisma.booking.findFirst({
    where: {
      booking_id: bookingId,
      ...resolveBookingUserWhere(sessionUser)
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
    return null
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

  return toSerializable({
    ...booking,
    TourPackage: tourPackageCompat,
    duration_days: durationDays,
    endDate: endDate.toISOString()
  })
}
