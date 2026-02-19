import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { prisma } from '@/lib/db'
import {
  pickPrimaryVariant,
  resolveVariantPricing
} from '@/lib/utils/tour/v2Mapper'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug?.trim()

    if (!slug) {
      throw new ApiError(400, 'Invalid slug', 'VALIDATION_ERROR')
    }

    const product = await prisma.tourProduct.findUnique({
      where: { slug },
      include: {
        TourProductMedia: {
          orderBy: [{ is_cover: 'desc' }, { sort_order: 'asc' }],
          select: {
            url: true
          }
        },
        TourVariants: {
          where: { is_active: true },
          orderBy: [{ is_default: 'desc' }, { variant_id: 'asc' }],
          include: {
            LegacyPackage: {
              select: {
                package_id: true,
                package_name: true,
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
            },
            TourVariantMedia: {
              orderBy: [{ is_cover: 'desc' }, { sort_order: 'asc' }],
              select: {
                url: true
              }
            },
            VariantItineraries: {
              orderBy: [{ day: 'asc' }, { sort_order: 'asc' }],
              select: {
                day: true,
                start_time: true,
                title: true,
                description: true,
                Activity: {
                  select: {
                    activity_name: true,
                    description: true
                  }
                }
              }
            },
            VariantHighlights: {
              orderBy: [{ sort_order: 'asc' }, { highlight_id: 'asc' }],
              select: {
                description: true
              }
            },
            VariantOptionalFeatures: {
              orderBy: [{ sort_order: 'asc' }, { feature_id: 'asc' }],
              select: {
                description: true
              }
            },
            VariantInclusions: {
              orderBy: [{ sort_order: 'asc' }, { inclusion_id: 'asc' }],
              select: {
                Inclusion: {
                  select: {
                    description: true
                  }
                }
              }
            },
            VariantExclusions: {
              orderBy: [{ sort_order: 'asc' }, { exclusion_id: 'asc' }],
              select: {
                Exclusion: {
                  select: {
                    description: true
                  }
                }
              }
            },
            VariantAdditionalInfos: {
              orderBy: [{ sort_order: 'asc' }, { info_id: 'asc' }],
              select: {
                description: true
              }
            }
          }
        }
      }
    })

    if (!product) {
      throw new ApiError(404, 'Tour not found', 'NOT_FOUND')
    }

    const variant = pickPrimaryVariant(product.TourVariants)

    if (!variant) {
      throw new ApiError(404, 'Tour variant not found', 'NOT_FOUND')
    }

    const pricing = resolveVariantPricing(variant)
    const tourImages = [
      ...variant.TourVariantMedia.map((image) => image.url),
      ...product.TourProductMedia.map((image) => image.url)
    ]
    const uniqueTourImages = Array.from(new Set(tourImages)).map((url) => ({
      url
    }))

    return apiSuccess(
      {
        package_id:
          product.legacy_package_id ??
          variant.LegacyPackage?.package_id ??
          product.product_id,
        variant_id: variant.variant_id,
        package_name: product.product_name,
        slug: product.slug,
        short_description: product.short_description,
        description: product.description,
        thumbnail_url: product.thumbnail_url ?? uniqueTourImages[0]?.url ?? '',
        color_code: product.color_code,
        is_featured: product.is_featured,
        duration_days: pricing.durationDays,
        min_booking: pricing.minBooking,
        max_booking: pricing.maxBooking,
        price_per_person: pricing.adultPrice,
        price_per_child: pricing.childPrice,
        TourImages: uniqueTourImages,
        Highlights: variant.VariantHighlights,
        OptionalFeatures: variant.VariantOptionalFeatures,
        TourInclusion: variant.VariantInclusions,
        TourExclusion: variant.VariantExclusions,
        AdditionalInfos: variant.VariantAdditionalInfos,
        TourItineraries: variant.VariantItineraries.map((itinerary) => ({
          day: itinerary.day,
          start_time: itinerary.start_time,
          Activity: itinerary.Activity ?? {
            activity_name: itinerary.title,
            description: itinerary.description
          }
        }))
      },
      200
    )
  } catch (error) {
    return handleApiError('api/tours/[slug]', error)
  }
}
