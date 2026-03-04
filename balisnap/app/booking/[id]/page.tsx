import { getServerSession } from 'next-auth'

import { BookingDetailClient } from '@/components/BookingPage'
import { NoContent, UnAuthorized } from '@/components/errors'
import { authOptions } from '@/lib/auth'
import { getBookingByIdForSessionUser } from '@/lib/customer-bookings'

export const dynamic = 'force-dynamic'

export default async function BookingPage({
  params
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { id?: string; email?: string }
    | undefined

  if (!sessionUser?.id && !sessionUser?.email) {
    return <UnAuthorized />
  }

  const bookingId = Number(params.id)

  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return <NoContent />
  }

  const booking = await getBookingByIdForSessionUser(bookingId, sessionUser)

  if (!booking) {
    return <NoContent />
  }

  return <BookingDetailClient booking={booking} />
}
