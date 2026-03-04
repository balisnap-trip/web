import { getServerSession } from 'next-auth'

import BookingCard from './BookingCard'

import { NoContent, UnAuthorized } from '@/components/errors'
import { authOptions } from '@/lib/auth'
import { getBookingsForSessionUser } from '@/lib/customer-bookings'

export const dynamic = 'force-dynamic'

export default async function BookingsPage() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { id?: string; email?: string }
    | undefined

  if (!sessionUser?.id && !sessionUser?.email) {
    return <UnAuthorized />
  }

  const bookings = await getBookingsForSessionUser(sessionUser)

  if (bookings.length === 0) {
    return <NoContent />
  }

  return (
    <>
      <h2 className="w-full text-center text-[2.5rem] font-bold my-[2rem]">
        Bookings
      </h2>
      <div className="mb-6">
        <div className="w-full overflow-x-auto">
          {bookings.map((booking: any) => (
            <BookingCard key={booking.booking_id} booking={booking} />
          ))}
        </div>
      </div>
    </>
  )
}
