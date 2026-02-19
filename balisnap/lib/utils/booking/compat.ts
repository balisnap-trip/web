const toNumber = (value: unknown) =>
  typeof value === 'number' ? value : Number(value ?? 0)

export const getPayableTotal = (booking: {
  total_price: unknown
  BookingItems?: Array<{ item_status: string; total_amount: unknown }>
}) => {
  const activeItems =
    booking.BookingItems?.filter((item) => item.item_status !== 'CANCELLED') ??
    []

  if (activeItems.length === 0) {
    return Number(toNumber(booking.total_price).toFixed(2))
  }

  const total = activeItems.reduce(
    (acc, item) => acc + toNumber(item.total_amount),
    0
  )

  return Number(total.toFixed(2))
}

export const buildTourPackageCompat = (booking: {
  package_id: number | null
  TourPackage?: {
    package_id: number
    package_name: string
    duration_days: number | null
    price_per_person: unknown
    price_per_child: unknown | null
    min_booking: number | null
    max_booking: number | null
  } | null
  BookingItems?: Array<{
    adult_unit_price: unknown
    child_unit_price: unknown
    TourVariant: {
      variant_id: number
      duration_days: number
      min_pax: number
      max_pax: number | null
      TourProduct: {
        product_id: number
        product_name: string
      }
    }
  }>
}) => {
  if (booking.TourPackage) {
    return booking.TourPackage
  }

  const firstItem = booking.BookingItems?.[0]

  if (!firstItem) return null

  return {
    package_id:
      booking.package_id ??
      firstItem.TourVariant.variant_id ??
      firstItem.TourVariant.TourProduct.product_id,
    package_name: firstItem.TourVariant.TourProduct.product_name,
    duration_days: firstItem.TourVariant.duration_days,
    price_per_person: toNumber(firstItem.adult_unit_price),
    price_per_child: toNumber(firstItem.child_unit_price),
    min_booking: firstItem.TourVariant.min_pax,
    max_booking:
      firstItem.TourVariant.max_pax ??
      Math.max(firstItem.TourVariant.min_pax, 1)
  }
}
