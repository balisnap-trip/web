import { getServerSession } from 'next-auth'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildTourPackageCompat } from '@/lib/utils/booking/compat'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as
      | { id?: string; email?: string }
      | undefined

    if (!sessionUser?.id && !sessionUser?.email) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const bookings = await prisma.booking.findMany({
      where: sessionUser?.id
        ? {
            user_id: sessionUser.id
          }
        : {
            User: {
              email: sessionUser?.email
            }
          },
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

    return apiSuccess(normalizedBookings, 200)
  } catch (error) {
    return handleApiError('api/bookings', error)
  }
}
