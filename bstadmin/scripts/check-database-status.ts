import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkDatabaseStatus() {
  try {
    console.log('📊 DATABASE STATUS REPORT\n')
    console.log('=' .repeat(60))

    // Email stats
    const totalEmails = await prisma.emailInbox.count()
    const bookingEmails = await prisma.emailInbox.count({
      where: { isBookingEmail: true },
    })
    const processedBookingEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { some: {} },
      },
    })
    const unprocessedBookingEmails = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        bookingEmails: { none: {} },
      },
    })
    const emailsWithErrors = await prisma.emailInbox.count({
      where: {
        isBookingEmail: true,
        errorMessage: { not: null },
      },
    })

    console.log('\n📧 EMAIL STATS:')
    console.log(`   Total Emails: ${totalEmails}`)
    console.log(`   Booking Emails (isBookingEmail=true): ${bookingEmails}`)
    console.log(`   Processed (linked to bookings): ${processedBookingEmails}`)
    console.log(`   Unprocessed (waiting): ${unprocessedBookingEmails}`)
    console.log(`   With Errors: ${emailsWithErrors}`)

    // Booking stats
    const totalBookings = await prisma.booking.count()
    const pendingBookings = await prisma.booking.count({
      where: { status: 'NEW' },
    })
    const confirmedBookings = await prisma.booking.count({
      where: { status: 'READY' },
    })
    const cancelledBookings = await prisma.booking.count({
      where: { status: 'CANCELLED' },
    })

    console.log('\n📅 BOOKING STATS:')
    console.log(`   Total Bookings: ${totalBookings}`)
    console.log(`   New: ${pendingBookings}`)
    console.log(`   Ready: ${confirmedBookings}`)
    console.log(`   Cancelled: ${cancelledBookings}`)

    // BookingEmail relations
    const totalRelations = await prisma.bookingEmail.count()
    const createdRelations = await prisma.bookingEmail.count({
      where: { relationType: 'CREATED' },
    })
    const updatedRelations = await prisma.bookingEmail.count({
      where: { relationType: 'UPDATED' },
    })
    const cancelledRelations = await prisma.bookingEmail.count({
      where: { relationType: 'CANCELLED' },
    })

    console.log('\n🔗 BOOKING-EMAIL RELATIONS:')
    console.log(`   Total Relations: ${totalRelations}`)
    console.log(`   CREATED: ${createdRelations}`)
    console.log(`   UPDATED: ${updatedRelations}`)
    console.log(`   CANCELLED: ${cancelledRelations}`)

    // Sample unprocessed booking emails
    if (unprocessedBookingEmails > 0) {
      console.log('\n📝 SAMPLE UNPROCESSED BOOKING EMAILS (first 10):')
      const sampleEmails = await prisma.emailInbox.findMany({
        where: {
          isBookingEmail: true,
          bookingEmails: { none: {} },
        },
        take: 10,
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          subject: true,
          from: true,
          source: true,
          receivedAt: true,
          errorMessage: true,
        },
      })

      sampleEmails.forEach((email, idx) => {
        console.log(`\n   ${idx + 1}. ${email.subject}`)
        console.log(`      From: ${email.from}`)
        console.log(`      Source: ${email.source}`)
        console.log(`      Date: ${email.receivedAt.toISOString()}`)
        if (email.errorMessage) {
          console.log(`      ⚠️  Error: ${email.errorMessage.substring(0, 100)}...`)
        }
      })
    }

    // Check for emails with errors
    if (emailsWithErrors > 0) {
      console.log(`\n\n⚠️  ERROR SUMMARY (${emailsWithErrors} emails with errors):`)

      const errorSamples = await prisma.emailInbox.findMany({
        where: {
          isBookingEmail: true,
          errorMessage: { not: null },
        },
        take: 5,
        select: {
          subject: true,
          from: true,
          errorMessage: true,
        },
      })

      errorSamples.forEach((email, idx) => {
        console.log(`\n   ${idx + 1}. ${email.subject}`)
        console.log(`      Error: ${email.errorMessage?.substring(0, 150)}`)
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Report complete\n')

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkDatabaseStatus()
