import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const booking = await prisma.booking.findFirst({
    where: {
      bookingRef: 'GYGKBGMBMQVK',
    },
    include: {
      driver: true,
    },
  })

  if (!booking) {
    console.log('Booking not found')
    return
  }

  console.log('\n========== BOOKING DETAILS ==========\n')
  console.log(`Booking Ref: ${booking.bookingRef}`)
  console.log(`Customer: ${booking.mainContactName}`)
  console.log(`Email: ${booking.mainContactEmail}`)
  console.log(`Phone: ${booking.phoneNumber}`)
  console.log(`\nTour Date: ${booking.tourDate.toDateString()} (${booking.tourDate.getFullYear()}-${(booking.tourDate.getMonth() + 1).toString().padStart(2, '0')}-${booking.tourDate.getDate().toString().padStart(2, '0')})`)
  console.log(`Tour Time: ${booking.tourTime || '(not set)'}`)
  console.log(`\nAdults: ${booking.numberOfAdult}`)
  console.log(`Children: ${booking.numberOfChild || 0}`)
  console.log(`Total: ${booking.currency} ${booking.totalPrice.toString()}`)
  console.log(`\nMeeting Point: ${booking.meetingPoint}`)
  console.log(`\nDriver: ${booking.driver ? booking.driver.name : 'Not assigned'}`)
  console.log(`\nNote:`)
  console.log(booking.note)
  console.log('\n================\n')
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
