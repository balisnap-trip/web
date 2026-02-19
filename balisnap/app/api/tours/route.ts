import { apiSuccess, handleApiError } from '@/lib/api/http'
import { prisma } from '@/lib/db'
import { toLegacyTourCard } from '@/lib/utils/tour/v2Mapper'

export async function GET() {
  try {
    const products = await prisma.tourProduct.findMany({
      where: { is_active: true },
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
      select: {
        product_id: true,
        legacy_package_id: true,
        product_name: true,
        slug: true,
        short_description: true,
        description: true,
        thumbnail_url: true,
        color_code: true,
        is_featured: true,
        TourProductMedia: {
          select: {
            url: true,
            is_cover: true,
            sort_order: true
          }
        },
        TourVariants: {
          where: { is_active: true },
          select: {
            variant_id: true,
            variant_name: true,
            duration_days: true,
            min_pax: true,
            max_pax: true,
            is_default: true,
            LegacyPackage: {
              select: {
                package_id: true,
                min_booking: true,
                max_booking: true,
                price_per_person: true,
                price_per_child: true,
                duration_days: true
              }
            },
            VariantRatePlans: {
              where: {
                is_active: true,
                traveler_type: { in: ['ADULT', 'CHILD'] }
              },
              select: {
                traveler_type: true,
                price: true,
                valid_from: true,
                valid_to: true,
                season_start: true,
                season_end: true
              }
            }
          }
        }
      }
    })

    const tours = products
      .map((product) => toLegacyTourCard(product))
      .filter((tour): tour is NonNullable<typeof tour> => tour !== null)

    return apiSuccess(tours, 200)
  } catch (error) {
    return handleApiError('api/tours', error)
  }
}
