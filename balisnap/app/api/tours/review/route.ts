import { apiSuccess, handleApiError } from '@/lib/api/http'
import { prisma } from '@/lib/db'
import { buildTourPackageCompat } from '@/lib/utils/booking/compat'

export async function GET() {
  try {
    const reviews = await prisma.review.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        Booking: {
          include: {
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
            User: true
          }
        }
      }
    })

    const normalizedReviews = reviews.map((review) => ({
      ...review,
      Booking: {
        ...review.Booking,
        TourPackage: buildTourPackageCompat(review.Booking)
      }
    }))

    return apiSuccess(normalizedReviews, 200)
  } catch (error) {
    return handleApiError('api/tours/review', error)
  }
}
