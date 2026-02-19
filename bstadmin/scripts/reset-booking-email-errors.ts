import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Reset error messages for booking emails so they can be reprocessed
 */
async function resetErrors() {
  try {
    console.log('🔄 Resetting booking email errors...\n')

    // Count emails with errors
    const emailsWithErrors = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        errorMessage: { not: null },
      },
    })

    console.log(`Found ${emailsWithErrors} booking emails with errors`)

    // Reset error messages
    const result = await prisma.emailInbox.updateMany({
      where: {
        isBookingEmail: true,
        errorMessage: { not: null },
      },
      data: {
        errorMessage: null,
      },
    })

    console.log(`✅ Reset ${result.count} email error messages`)
    console.log('')
    console.log('📝 Next steps:')
    console.log('1. Go to: http://localhost:3000/bookings')
    console.log('2. Click: "Fetch Booking" button')
    console.log('3. Wait for completion')
    console.log('4. Check results with: npm run check:db')
    console.log('')

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

resetErrors()
