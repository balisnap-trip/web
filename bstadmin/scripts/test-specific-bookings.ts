import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Test specific booking refs mentioned by user
 */
async function testSpecificBookings() {
  try {
    console.log('🔍 Checking specific booking emails mentioned by user...\n')

    const testBookingRefs = [
      'GYGKBG423Z2B',
      'GYGVN3LZ533Q',
      'GYGX7NW8VV93',
      'BAL-T118223237',
      '1351773477',
    ]

    for (const ref of testBookingRefs) {
      console.log(`\n📧 Searching for: ${ref}`)

      // Search in subject
      const emails = await prisma.emailInbox.findMany({
        where: {
          OR: [
            { subject: { contains: ref, mode: 'insensitive' } },
            { body: { contains: ref, mode: 'insensitive' } },
            { htmlBody: { contains: ref, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          subject: true,
          from: true,
          isBookingEmail: true,
          errorMessage: true,
          receivedAt: true,
          bookingEmails: {
            select: {
              relationType: true,
              booking: {
                select: {
                  bookingRef: true,
                  mainContactName: true,
                  mainContactEmail: true,
                },
              },
            },
          },
        },
        take: 5,
      })

      if (emails.length === 0) {
        console.log('   ❌ Not found in database')
        continue
      }

      emails.forEach((email, idx) => {
        console.log(`\n   ${idx + 1}. Subject: ${email.subject}`)
        console.log(`      From: ${email.from}`)
        console.log(`      isBookingEmail: ${email.isBookingEmail ? '✅ YES' : '❌ NO'}`)
        console.log(`      Received: ${email.receivedAt.toISOString()}`)

        if (email.errorMessage) {
          console.log(`      ⚠️  Error: ${email.errorMessage.substring(0, 150)}`)
        }

        if (email.bookingEmails.length > 0) {
          console.log(`      ✅ Linked to booking:`)
          email.bookingEmails.forEach((be) => {
            console.log(`         - ${be.relationType}: ${be.booking.bookingRef}`)
            console.log(`           Guest: ${be.booking.mainContactName} (${be.booking.mainContactEmail})`)
          })
        } else {
          console.log(`      ⏳ Not yet processed`)
        }
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Test complete\n')

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

testSpecificBookings()
