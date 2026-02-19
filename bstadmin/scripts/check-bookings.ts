/**
 * Check existing bookings in database
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkBookings() {
  console.log('🔍 Checking bookings in database...\n')

  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      bookingRef: true,
      mainContactName: true,
      tourDate: true,
      source: true,
      assignedDriverId: true,
      driver: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      tourDate: 'desc',
    },
  })

  console.log(`📊 Total bookings: ${bookings.length}\n`)

  bookings.forEach((booking) => {
    const driver = booking.driver ? booking.driver.name : 'Not Assigned'
    console.log(
      `${booking.bookingRef?.padEnd(20)} | ${booking.mainContactName.padEnd(20)} | ` +
      `${booking.tourDate.toISOString().split('T')[0]} | ${booking.source.padEnd(10)} | ${driver}`
    )
  })

  // Count by source
  const bySources = await prisma.booking.groupBy({
    by: ['source'],
    _count: true,
  })

  console.log('\n📈 Bookings by source:')
  bySources.forEach((item) => {
    console.log(`   ${item.source}: ${item._count}`)
  })

  // Count assigned vs unassigned
  const assigned = bookings.filter(b => b.assignedDriverId !== null).length
  const unassigned = bookings.filter(b => b.assignedDriverId === null).length

  console.log('\n👤 Driver assignments:')
  console.log(`   Assigned: ${assigned}`)
  console.log(`   Unassigned: ${unassigned}`)
}

checkBookings()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
