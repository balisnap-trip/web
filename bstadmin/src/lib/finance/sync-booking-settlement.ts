import { BookingStatus, Prisma } from '@prisma/client'

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['NEW', 'READY', 'ATTENTION', 'UPDATED', 'COMPLETED']

/**
 * Keep booking status/payment flags in sync with finance settlement state.
 *
 * Rule: when all finance items in a booking are paid, booking is considered completed.
 */
export async function syncBookingSettlementStatus(
  tx: Prisma.TransactionClient,
  bookingIds: number[],
  settledAt?: Date
) {
  const uniqueBookingIds = Array.from(new Set(bookingIds.filter((id) => Number.isFinite(id))))
  if (uniqueBookingIds.length === 0) return

  const finances = await tx.bookingFinance.findMany({
    where: { bookingId: { in: uniqueBookingIds } },
    select: {
      bookingId: true,
      items: { select: { paid: true } },
      booking: { select: { status: true, isPaid: true, paidAt: true } },
    },
  })

  const updates = []

  for (const finance of finances) {
    if (finance.items.length === 0 || !finance.items.every((item) => item.paid)) continue

    const data: Prisma.BookingUpdateInput = {}

    if (ACTIVE_BOOKING_STATUSES.includes(finance.booking.status)) {
      data.status = 'DONE'
    }

    if (!finance.booking.isPaid) {
      data.isPaid = true
    }

    if (!finance.booking.paidAt) {
      data.paidAt = settledAt ?? new Date()
    }

    if (Object.keys(data).length > 0) {
      updates.push(
        tx.booking.update({
          where: { id: finance.bookingId },
          data,
        })
      )
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }
}
