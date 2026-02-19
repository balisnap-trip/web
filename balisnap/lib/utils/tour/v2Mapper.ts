import { TravelerType } from '@prisma/client'

type RatePlanLike = {
  traveler_type: TravelerType
  price: unknown
  valid_from: Date | null
  valid_to: Date | null
  season_start: Date | null
  season_end: Date | null
}

type VariantLike = {
  variant_id: number
  variant_name: string
  duration_days: number
  min_pax: number
  max_pax: number | null
  is_default?: boolean
  LegacyPackage?: {
    package_id: number
    package_name?: string | null
    min_booking?: number | null
    max_booking?: number | null
    price_per_person?: unknown
    price_per_child?: unknown
    duration_days?: number | null
  } | null
  VariantRatePlans?: RatePlanLike[]
}

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : Number(value ?? 0)

const toDateOnly = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  )

const isRatePlanEligible = (plan: RatePlanLike, targetDate: Date) => {
  if (plan.valid_from && targetDate < plan.valid_from) return false
  if (plan.valid_to && targetDate > plan.valid_to) return false

  const targetDateOnly = toDateOnly(targetDate)

  if (plan.season_start && targetDateOnly < toDateOnly(plan.season_start))
    return false
  if (plan.season_end && targetDateOnly > toDateOnly(plan.season_end))
    return false

  return true
}

export const pickRatePlan = (
  ratePlans: RatePlanLike[],
  travelerType: TravelerType,
  targetDate: Date
) => {
  const eligible = ratePlans.filter(
    (plan) =>
      plan.traveler_type === travelerType &&
      isRatePlanEligible(plan, targetDate)
  )

  if (eligible.length === 0) return null

  return eligible.sort((a, b) => {
    const aPriority = a.valid_from ? a.valid_from.getTime() : 0
    const bPriority = b.valid_from ? b.valid_from.getTime() : 0

    return bPriority - aPriority
  })[0]
}

export const pickPrimaryVariant = <T extends VariantLike>(variants: T[]) => {
  if (!Array.isArray(variants) || variants.length === 0) return null

  return [...variants].sort((a, b) => {
    const aScore = a.is_default ? 1 : 0
    const bScore = b.is_default ? 1 : 0

    if (aScore !== bScore) return bScore - aScore

    return a.variant_id - b.variant_id
  })[0]
}

export const resolveVariantPricing = (
  variant: VariantLike,
  targetDate = new Date()
) => {
  const ratePlans = variant.VariantRatePlans ?? []
  const adultRatePlan = pickRatePlan(ratePlans, TravelerType.ADULT, targetDate)
  const childRatePlan = pickRatePlan(ratePlans, TravelerType.CHILD, targetDate)

  const adultPrice =
    adultRatePlan !== null
      ? toNumber(adultRatePlan.price)
      : toNumber(variant.LegacyPackage?.price_per_person)

  const childPrice =
    childRatePlan !== null
      ? toNumber(childRatePlan.price)
      : variant.LegacyPackage?.price_per_child !== null &&
          variant.LegacyPackage?.price_per_child !== undefined
        ? toNumber(variant.LegacyPackage?.price_per_child)
        : Number((adultPrice / 2).toFixed(2))

  const minBooking =
    variant.LegacyPackage?.min_booking ?? Math.max(1, variant.min_pax)
  const maxBooking =
    variant.LegacyPackage?.max_booking ?? variant.max_pax ?? minBooking
  const durationDays =
    variant.LegacyPackage?.duration_days ?? Math.max(1, variant.duration_days)

  return {
    adultPrice,
    childPrice,
    minBooking,
    maxBooking,
    durationDays
  }
}

export const toLegacyTourCard = (product: {
  product_id: number
  legacy_package_id: number | null
  product_name: string
  slug: string
  short_description: string | null
  description: string | null
  thumbnail_url: string | null
  color_code: string | null
  is_featured: boolean
  TourProductMedia?: Array<{
    url: string
    is_cover: boolean
    sort_order: number
  }>
  TourVariants: VariantLike[]
}) => {
  const primaryVariant = pickPrimaryVariant(product.TourVariants)

  if (!primaryVariant) return null

  const pricing = resolveVariantPricing(primaryVariant)
  const thumbnailFromMedia =
    product.TourProductMedia?.sort((a, b) => {
      const aScore = a.is_cover ? 1 : 0
      const bScore = b.is_cover ? 1 : 0

      if (aScore !== bScore) return bScore - aScore

      return a.sort_order - b.sort_order
    })?.[0]?.url ?? null

  return {
    package_id:
      product.legacy_package_id ??
      primaryVariant.LegacyPackage?.package_id ??
      product.product_id,
    variant_id: primaryVariant.variant_id,
    package_name: product.product_name,
    slug: product.slug,
    thumbnail_url: product.thumbnail_url ?? thumbnailFromMedia ?? '',
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    color_code: product.color_code,
    is_featured: product.is_featured,
    duration_days: pricing.durationDays,
    min_booking: pricing.minBooking,
    max_booking: pricing.maxBooking,
    price_per_person: pricing.adultPrice,
    price_per_child: pricing.childPrice
  }
}
