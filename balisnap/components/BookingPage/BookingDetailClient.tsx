'use client'

import BookingPaid from './Paid'
import BookingUnpaid from './Unpaid'

export default function BookingDetailClient({ booking }: { booking: any }) {
  const isPaid =
    booking?.Payments?.length > 0 &&
    booking?.Payments[0].payment_status === 'COMPLETED'

  return isPaid ? (
    <BookingPaid booking={booking} />
  ) : (
    <BookingUnpaid booking={booking} />
  )
}
