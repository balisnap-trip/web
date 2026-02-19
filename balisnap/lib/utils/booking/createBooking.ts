import { TravelerType } from '@prisma/client'

import { ApiError } from '@/lib/api/errors'
import { prisma } from '@/lib/db'

interface CreateBookingParams {
  userId: string
  variantId: number
  packageId?: number
  departureId?: number
  bookingRef: string
  bookingDate: Date
  numberOfAdult: number
  numberOfChild: number
  mainContactName: string
  mainContactEmail: string
  phoneNumber: string
  pickupLocation: string
  note?: string
}

interface CreatePaymentParams {
  booking_id: number
  user_id: string
  payment_date: Date
  amount: number
  payment_method: string
  payment_status: string
  payment_ref?: string
}

const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : Number(value ?? 0)

const toDateOnly = (value: Date) =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  )

const isRatePlanEligible = (
  plan: {
    valid_from: Date | null
    valid_to: Date | null
    season_start: Date | null
    season_end: Date | null
  },
  bookingDate: Date
) => {
  if (plan.valid_from && bookingDate < plan.valid_from) return false
  if (plan.valid_to && bookingDate > plan.valid_to) return false

  const bookingDateOnly = toDateOnly(bookingDate)

  if (plan.season_start && bookingDateOnly < toDateOnly(plan.season_start))
    return false
  if (plan.season_end && bookingDateOnly > toDateOnly(plan.season_end))
    return false

  return true
}

const pickRatePlan = (
  plans: Array<{
    traveler_type: TravelerType
    price: unknown
    valid_from: Date | null
    valid_to: Date | null
    season_start: Date | null
    season_end: Date | null
  }>,
  travelerType: TravelerType,
  bookingDate: Date
) => {
  const eligiblePlans = plans.filter(
    (plan) =>
      plan.traveler_type === travelerType &&
      isRatePlanEligible(plan, bookingDate)
  )

  if (eligiblePlans.length === 0) return null

  return eligiblePlans.sort((a, b) => {
    const aPriority = a.valid_from ? a.valid_from.getTime() : 0
    const bPriority = b.valid_from ? b.valid_from.getTime() : 0

    return bPriority - aPriority
  })[0]
}

const calculateBookingTotal = ({
  numberOfAdult,
  numberOfChild,
  pricePerPerson,
  pricePerChild,
  maxBooking
}: {
  numberOfAdult: number
  numberOfChild: number
  pricePerPerson: number
  pricePerChild: number | null
  maxBooking: number | null
}) => {
  const adultTotalRaw = pricePerPerson * numberOfAdult
  const adultTotal =
    maxBooking !== null && numberOfAdult > maxBooking
      ? adultTotalRaw * 0.9
      : adultTotalRaw
  const childUnitPrice =
    pricePerChild !== null
      ? pricePerChild
      : Number((pricePerPerson / 2).toFixed(2))
  const childTotal = childUnitPrice * numberOfChild

  return Number((adultTotal + childTotal).toFixed(2))
}

export const createBooking = async (params: CreateBookingParams) => {
  const tourVariant = await prisma.tourVariant.findUnique({
    where: { variant_id: params.variantId },
    include: {
      TourProduct: {
        select: {
          product_id: true,
          product_name: true,
          slug: true,
          legacy_package_id: true,
          base_meeting_point: true
        }
      },
      LegacyPackage: {
        select: {
          package_id: true,
          package_name: true,
          duration_days: true,
          min_booking: true,
          max_booking: true,
          price_per_person: true,
          price_per_child: true
        }
      },
      VariantRatePlans: {
        where: { is_active: true },
        select: {
          traveler_type: true,
          price: true,
          valid_from: true,
          valid_to: true,
          season_start: true,
          season_end: true
        }
      },
      VariantItineraries: {
        orderBy: [{ day: 'asc' }, { sort_order: 'asc' }],
        take: 1,
        select: {
          day: true,
          start_time: true
        }
      }
    }
  })

  if (!tourVariant || !tourVariant.is_active) {
    throw new ApiError(404, 'Tour variant not found', 'NOT_FOUND')
  }

  const minBooking =
    tourVariant.LegacyPackage?.min_booking ?? Math.max(1, tourVariant.min_pax)
  const maxBooking =
    tourVariant.LegacyPackage?.max_booking ?? tourVariant.max_pax ?? null

  if (typeof minBooking === 'number' && params.numberOfAdult < minBooking) {
    throw new ApiError(
      400,
      `Minimum adult booking is ${minBooking}`,
      'VALIDATION_ERROR'
    )
  }

  const adultRatePlan = pickRatePlan(
    tourVariant.VariantRatePlans,
    TravelerType.ADULT,
    params.bookingDate
  )
  const childRatePlan = pickRatePlan(
    tourVariant.VariantRatePlans,
    TravelerType.CHILD,
    params.bookingDate
  )

  const adultUnitPrice =
    adultRatePlan !== null
      ? toNumber(adultRatePlan.price)
      : toNumber(tourVariant.LegacyPackage?.price_per_person)
  const childUnitPrice =
    childRatePlan !== null
      ? toNumber(childRatePlan.price)
      : tourVariant.LegacyPackage?.price_per_child !== null &&
          tourVariant.LegacyPackage?.price_per_child !== undefined
        ? toNumber(tourVariant.LegacyPackage.price_per_child)
        : Number((adultUnitPrice / 2).toFixed(2))

  if (!Number.isFinite(adultUnitPrice) || adultUnitPrice <= 0) {
    throw new ApiError(
      422,
      'Adult price is not configured for this variant',
      'PRICING_NOT_CONFIGURED'
    )
  }

  const totalPrice = calculateBookingTotal({
    numberOfAdult: params.numberOfAdult,
    numberOfChild: params.numberOfChild,
    pricePerPerson: adultUnitPrice,
    pricePerChild: childUnitPrice,
    maxBooking
  })

  const selectedDeparture = params.departureId
    ? await prisma.departure.findFirst({
        where: {
          departure_id: params.departureId,
          variant_id: tourVariant.variant_id,
          is_active: true,
          status: {
            in: ['OPEN', 'LIMITED']
          }
        },
        select: {
          departure_id: true,
          capacity_total: true,
          capacity_reserved: true,
          meeting_point: true
        }
      })
    : null

  if (params.departureId && !selectedDeparture) {
    throw new ApiError(404, 'Departure not found', 'NOT_FOUND')
  }

  const totalTravelers = params.numberOfAdult + params.numberOfChild

  if (selectedDeparture) {
    const remainingSeats =
      selectedDeparture.capacity_total - selectedDeparture.capacity_reserved

    if (totalTravelers > remainingSeats) {
      throw new ApiError(
        409,
        `Remaining seat is ${remainingSeats}`,
        'INSUFFICIENT_CAPACITY'
      )
    }
  }

  const packageId =
    params.packageId ??
    tourVariant.legacy_package_id ??
    tourVariant.TourProduct.legacy_package_id ??
    null
  const subtotal = Number(
    (
      adultUnitPrice * params.numberOfAdult +
      childUnitPrice * params.numberOfChild
    ).toFixed(2)
  )
  const discountAmount = Number((subtotal - totalPrice).toFixed(2))

  const booking = await prisma.$transaction(async (tx) => {
    const createdBooking = await tx.booking.create({
      data: {
        user_id: params.userId,
        package_id: packageId,
        booking_ref: params.bookingRef,
        booking_date: params.bookingDate,
        total_price: totalPrice,
        number_of_adult: params.numberOfAdult,
        number_of_child: params.numberOfChild,
        status: 'waiting',
        status_v2: 'PENDING_PAYMENT',
        currency_code: tourVariant.currency_code,
        main_contact_name: params.mainContactName,
        main_contact_email: params.mainContactEmail,
        phone_number: params.phoneNumber,
        meeting_point:
          params.pickupLocation ||
          selectedDeparture?.meeting_point ||
          tourVariant.TourProduct.base_meeting_point ||
          '',
        note: params.note
      }
    })

    await tx.bookingItem.create({
      data: {
        booking_id: createdBooking.booking_id,
        variant_id: tourVariant.variant_id,
        departure_id: selectedDeparture?.departure_id ?? null,
        item_status: 'ACTIVE',
        currency_code: tourVariant.currency_code,
        adult_qty: params.numberOfAdult,
        child_qty: params.numberOfChild,
        infant_qty: 0,
        adult_unit_price: adultUnitPrice,
        child_unit_price: childUnitPrice,
        infant_unit_price: 0,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: 0,
        total_amount: totalPrice,
        snapshot: {
          product_id: tourVariant.TourProduct.product_id,
          product_name: tourVariant.TourProduct.product_name,
          slug: tourVariant.TourProduct.slug,
          variant_id: tourVariant.variant_id,
          variant_name: tourVariant.variant_name,
          legacy_package_id: packageId,
          booking_ref: params.bookingRef,
          booking_date: params.bookingDate.toISOString(),
          pricing: {
            adult_unit_price: adultUnitPrice,
            child_unit_price: childUnitPrice,
            subtotal,
            discount_amount: discountAmount,
            total_amount: totalPrice
          }
        }
      }
    })

    if (selectedDeparture) {
      await tx.departure.update({
        where: { departure_id: selectedDeparture.departure_id },
        data: {
          capacity_reserved: {
            increment: totalTravelers
          }
        }
      })
    }

    return tx.booking.findUnique({
      where: { booking_id: createdBooking.booking_id },
      include: {
        TourPackage: {
          select: {
            package_name: true,
            package_id: true,
            duration_days: true,
            price_per_person: true,
            price_per_child: true,
            min_booking: true,
            max_booking: true
          }
        },
        Payments: {
          select: {
            payment_method: true
          }
        }
      }
    })
  })

  if (!booking) {
    throw new ApiError(500, 'Failed to create booking', 'INTERNAL_ERROR')
  }

  const tourPackageCompat = booking.TourPackage ?? {
    package_name: tourVariant.TourProduct.product_name,
    package_id: packageId ?? tourVariant.variant_id,
    duration_days: tourVariant.duration_days,
    price_per_person: adultUnitPrice,
    price_per_child: childUnitPrice,
    min_booking: minBooking,
    max_booking: maxBooking
  }

  return {
    ...booking,
    TourPackage: tourPackageCompat,
    TourItineraries: tourVariant.VariantItineraries
  }
}

export const createPayment = async (params: CreatePaymentParams) => {
  if (params.payment_ref) {
    const existingPayment = await prisma.payment.findUnique({
      where: {
        payment_ref: params.payment_ref
      }
    })

    if (existingPayment) {
      return existingPayment
    }
  }

  const payment = await prisma.payment.create({
    data: {
      booking_id: params.booking_id,
      user_id: params.user_id,
      payment_date: params.payment_date,
      amount: params.amount,
      payment_method: params.payment_method,
      payment_status: params.payment_status,
      payment_ref: params.payment_ref
    }
  })

  if (payment.payment_status === 'COMPLETED') {
    await prisma.booking.update({
      where: { booking_id: payment.booking_id },
      data: { status: 'paid', status_v2: 'PAID' }
    })
  }

  return payment
}
