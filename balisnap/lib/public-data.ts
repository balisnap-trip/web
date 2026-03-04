import { prisma } from '@/lib/db'
import { buildTourPackageCompat } from '@/lib/utils/booking/compat'
import {
  pickPrimaryVariant,
  resolveVariantPricing,
  toLegacyTourCard
} from '@/lib/utils/tour/v2Mapper'

const tourCardSelect = {
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
} as const

const mapTourCards = (products: any[]) =>
  products
    .map((product) => toLegacyTourCard(product))
    .filter((tour): tour is NonNullable<typeof tour> => tour !== null)

export async function getAllTours() {
  const products = await prisma.tourProduct.findMany({
    where: { is_active: true },
    orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
    select: tourCardSelect
  })

  return mapTourCards(products)
}

export async function getFeaturedTours() {
  const products = await prisma.tourProduct.findMany({
    where: { is_active: true, is_featured: true },
    orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
    select: tourCardSelect
  })

  return mapTourCards(products)
}

export async function getTourBySlug(slug: string) {
  const normalizedSlug = slug.trim()

  if (!normalizedSlug) {
    return null
  }

  const product = await prisma.tourProduct.findUnique({
    where: { slug: normalizedSlug },
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
    return null
  }

  const variant = pickPrimaryVariant(product.TourVariants)

  if (!variant) {
    return null
  }

  const pricing = resolveVariantPricing(variant)
  const tourImages = [
    ...variant.TourVariantMedia.map((image) => image.url),
    ...product.TourProductMedia.map((image) => image.url)
  ]
  const uniqueTourImages = Array.from(new Set(tourImages)).map((url) => ({
    url
  }))

  return {
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
  }
}

export async function getLatestReviews() {
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

  return reviews.map((review) => ({
    ...review,
    Booking: {
      ...review.Booking,
      TourPackage: buildTourPackageCompat(review.Booking)
    }
  }))
}
