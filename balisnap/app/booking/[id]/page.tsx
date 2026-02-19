'use client'
import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Booking, Payment, TourPackage, User } from '@prisma/client'
import { useSession } from 'next-auth/react'

import { fetchBookingById } from '@/lib/utils/booking/fetchBooking'
import { BookingPaid, BookingUnpaid } from '@/components/BookingPage'
import { NoContent, UnAuthorized } from '@/components/errors'

type BookingProps = Booking & {
  User: User
  Payment: Payment
  TourPackage: TourPackage
}

const BookingPage = ({ params }: { params: { id: string } }) => {
  const [booking, setBooking] = useState<any | BookingProps>({})
  const [loading, setLoading] = useState<boolean>(false)
  const bookingId = params.id
  const isPaid =
    booking?.Payments?.length > 0 &&
    booking?.Payments[0].payment_status === 'COMPLETED'

  const { data: session, status } = useSession()

  useEffect(() => {
    setLoading(true)
    const getTour = async () => {
      const booking = await fetchBookingById(bookingId)

      setBooking(booking)
      setLoading(false)
    }

    getTour()

    if (booking) {
      const startDate = new Date(booking.booking_date)
      const durationDays = Number(booking.TourPackage?.duration_days)

      const res = new Date(startDate)

      res.setDate(res.getDate() + durationDays)
    }
  }, [bookingId])

  if (!session && status !== 'loading') {
    return <UnAuthorized />
  } else if (session && (!booking || booking.length < 1)) {
    return <NoContent />
  }

  return (
    <>
      {loading || status === 'loading' ? (
        <Spinner color="secondary" size="lg" />
      ) : (
        <>
          {!isPaid ? (
            <BookingUnpaid booking={booking} />
          ) : (
            <BookingPaid booking={booking} />
          )}
        </>
      )}
    </>
  )
}

export default BookingPage
