import { prisma } from '@/lib/db'
import { isTourDayOrPastBali } from '@/lib/booking/bali-date'
import type { BookingStatus, Prisma } from '@prisma/client'

type BookingStatusInput = {
  id: number
  status: BookingStatus
  tourDate: Date
  assignedDriverId: number | null
  finance: {
    patternId: number | null
    validatedAt: Date | null
    items: { paid: boolean }[]
  } | null
}

const isAllFinancePaid = (finance: BookingStatusInput['finance']) =>
  Boolean(finance && finance.items.length > 0 && finance.items.every((item) => item.paid))

export const computeBookingStatus = (input: BookingStatusInput, now: Date = new Date()): BookingStatus => {
  if (input.status === 'CANCELLED') return 'CANCELLED'
  if (input.status === 'NO_SHOW') return 'NO_SHOW'

  if (isAllFinancePaid(input.finance)) return 'DONE'
  if (input.finance?.validatedAt) return 'COMPLETED'

  if (isTourDayOrPastBali(input.tourDate, now)) return 'ATTENTION'

  if (input.status === 'UPDATED') return 'UPDATED'

  const hasDriver = Boolean(input.assignedDriverId)
  const hasPattern = Boolean(input.finance?.patternId)
  if (hasDriver && hasPattern) return 'READY'

  return 'NEW'
}

export async function syncBookingStatus(
  tx: Prisma.TransactionClient | typeof prisma,
  bookingId: number
) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      tourDate: true,
      assignedDriverId: true,
      finance: {
        select: {
          patternId: true,
          validatedAt: true,
          items: { select: { paid: true } },
        },
      },
    },
  })

  if (!booking) return null

  const nextStatus = computeBookingStatus(booking)
  if (nextStatus !== booking.status) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus },
    })
  }

  return nextStatus
}

export async function syncAllBookingStatuses(tx: Prisma.TransactionClient | typeof prisma) {
  const bookings = await tx.booking.findMany({
    select: {
      id: true,
      status: true,
      tourDate: true,
      assignedDriverId: true,
      finance: {
        select: {
          patternId: true,
          validatedAt: true,
          items: { select: { paid: true } },
        },
      },
    },
  })

  const updates: Promise<unknown>[] = []
  const now = new Date()

  for (const booking of bookings) {
    const nextStatus = computeBookingStatus(booking, now)
    if (nextStatus !== booking.status) {
      updates.push(
        tx.booking.update({
          where: { id: booking.id },
          data: { status: nextStatus },
        })
      )
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return { total: bookings.length, updated: updates.length }
}
