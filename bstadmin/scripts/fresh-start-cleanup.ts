import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Fresh Start Cleanup
 * Delete all bookings and emails for new architecture
 */
async function freshStartCleanup() {
  try {
    console.log('🧹 Starting fresh start cleanup...\n')

    // Delete all bookings
    console.log('🗑️  Deleting all bookings...')
    const deletedBookings = await prisma.booking.deleteMany({})
    console.log(`   ✅ Deleted ${deletedBookings.count} bookings\n`)

    // Delete all emails
    console.log('🗑️  Deleting all emails...')
    const deletedEmails = await prisma.emailInbox.deleteMany({})
    console.log(`   ✅ Deleted ${deletedEmails.count} emails\n`)

    console.log('✅ Fresh start cleanup complete!')
    console.log('\n📊 Current Database State:')

    const totalEmails = await prisma.emailInbox.count()
    const totalBookings = await prisma.booking.count()

    console.log(`   - Total emails: ${totalEmails}`)
    console.log(`   - Total bookings: ${totalBookings}`)
    console.log('\n✨ Database is now clean and ready for new architecture!')

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

freshStartCleanup()
