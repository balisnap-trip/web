import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Re-evaluate all emails with improved booking detection logic
 */

// Copy of improved detection logic from email-sync.ts
function detectBookingEmail(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase()
  const subjectLower = subject.toLowerCase()

  // ❌ EXCLUDE: Marketing/promotional email addresses
  const isMarketingEmail =
    fromLower.includes('marketing@') ||
    fromLower.includes('news@') ||
    fromLower.includes('email@t1.') ||
    fromLower.includes('support@bokun') ||
    fromLower.includes('noreply@email.')

  if (isMarketingEmail) {
    return false
  }

  // ✅ CHECK: Must be from OTA notification addresses
  const isFromOTANotification =
    /no-reply@bokun\.io/i.test(from) ||
    /do-not-reply@notification\.getyourguide\.com/i.test(from) ||
    /partner-notification.*getyourguide/i.test(from) ||
    /booking@trip\.com/i.test(from) ||
    /reservation@.*viator/i.test(from)

  if (!isFromOTANotification) {
    return false
  }

  // ✅ CHECK: Must have SPECIFIC booking notification patterns
  const hasSpecificBookingPattern =
    /new booking:/i.test(subject) ||
    /updated booking:/i.test(subject) ||
    /cancelled booking:/i.test(subject) ||
    /booking detail change:/i.test(subject) ||
    /booking has been/i.test(subject) ||
    /booking\s*-\s*S\d+\s*-\s*[A-Z0-9]{12}/i.test(subject) ||
    /\(BAL-T\d+\).*ext\.\s*booking\s*ref/i.test(subject)

  if (!hasSpecificBookingPattern) {
    return false
  }

  // ❌ EXCLUDE: Marketing/promotional keywords
  const hasMarketingKeywords =
    /more bookings|boost.*bookings|increase.*bookings/i.test(subject) ||
    /direct bookings|drive more|supercharge/i.test(subject) ||
    /guide to|playbook|tips|how to/i.test(subject) ||
    /approved and ready|congrats|your key to/i.test(subject) ||
    /coming soon|discover|capture.*opportunity/i.test(subject) ||
    /start here|automate|optimise/i.test(subject) ||
    /first booking|got your first/i.test(subject) ||
    /bookings are on the way|time for bookings/i.test(subject) ||
    /just a few clicks away/i.test(subject)

  if (hasMarketingKeywords) {
    return false
  }

  // ❌ EXCLUDE: Other non-booking content
  const isNonBooking =
    /invoice/i.test(subject) ||
    /payment/i.test(subject) ||
    /review/i.test(subject) ||
    /rating/i.test(subject) ||
    /feedback/i.test(subject) ||
    /newsletter/i.test(subject) ||
    /supplier.*terms/i.test(subject) ||
    /product.*update/i.test(subject) ||
    /performance marketing/i.test(subject) ||
    /website widgets/i.test(subject)

  if (isNonBooking) {
    return false
  }

  return true
}

async function reEvaluateEmails() {
  try {
    console.log('🔄 Re-evaluating all emails with improved logic...\n')

    // Get all emails
    const allEmails = await prisma.emailInbox.findMany({
      select: {
        id: true,
        subject: true,
        from: true,
        isBookingEmail: true,
      },
    })

    console.log(`📧 Total emails: ${allEmails.length}`)

    let changed = 0
    let markedAsBooking = 0
    let unmarkedAsBooking = 0

    for (const email of allEmails) {
      const shouldBeBookingEmail = detectBookingEmail(email.from, email.subject)

      if (shouldBeBookingEmail !== email.isBookingEmail) {
        // Update the email
        await prisma.emailInbox.update({
          where: { id: email.id },
          data: { isBookingEmail: shouldBeBookingEmail },
        })

        changed++
        if (shouldBeBookingEmail) {
          markedAsBooking++
        } else {
          unmarkedAsBooking++
          console.log(`   ❌ Unmarked: ${email.subject.substring(0, 80)}`)
        }
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ Re-evaluation complete!')
    console.log(`   Total emails: ${allEmails.length}`)
    console.log(`   Changed: ${changed}`)
    console.log(`   Marked as booking: ${markedAsBooking}`)
    console.log(`   Unmarked as booking: ${unmarkedAsBooking}`)
    console.log('')

    // Show new stats
    const bookingEmails = await prisma.emailInbox.count({
      where: { isBookingEmail: true },
    })

    const nonBookingEmails = await prisma.emailInbox.count({
      where: { isBookingEmail: false },
    })

    console.log('📊 NEW STATS:')
    console.log(`   Booking emails: ${bookingEmails}`)
    console.log(`   Non-booking emails: ${nonBookingEmails}`)
    console.log('')

    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

reEvaluateEmails()
