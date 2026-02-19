import { prisma } from '@/lib/db'
import { BookingSource } from '@prisma/client'

type BookingNotificationInput = {
  bookingId: number
  bookingRef: string | null
  source: BookingSource
  tourDate: Date
}

const formatDate = (date: Date) => date.toISOString().split('T')[0]

const getAdminUsers = () =>
  prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'STAFF', 'MANAGER'] } },
    select: { id: true },
  })

export async function notifyBookingUpdated(input: BookingNotificationInput) {
  const users = await getAdminUsers()
  if (users.length === 0) return

  const title = 'Booking Updated'
  const message = `Booking ${input.bookingRef || `#${input.bookingId}`} diperbarui dari ${input.source}. Tour: ${formatDate(
    input.tourDate
  )}.`

  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: 'BOOKING_UPDATE',
      title,
      message,
      data: {
        bookingId: input.bookingId,
        bookingRef: input.bookingRef,
        source: input.source,
        tourDate: input.tourDate.toISOString(),
      },
    })),
  })
}

export async function notifyBookingCancelled(input: BookingNotificationInput) {
  const users = await getAdminUsers()
  if (users.length === 0) return

  const title = 'Booking Cancelled'
  const message = `Booking ${input.bookingRef || `#${input.bookingId}`} dibatalkan dari ${input.source}. Tour: ${formatDate(
    input.tourDate
  )}.`

  await prisma.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      type: 'BOOKING_CANCEL',
      title,
      message,
      data: {
        bookingId: input.bookingId,
        bookingRef: input.bookingRef,
        source: input.source,
        tourDate: input.tourDate.toISOString(),
      },
    })),
  })
}
