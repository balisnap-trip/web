import { GYGParser } from '../src/lib/email/parsers/gyg-parser'

const parser = new GYGParser()

const cases = [
  {
    name: 'baseline-main-customer-block',
    subject: 'Booking - S497054 - GYGKBGMBMQVK',
    from: 'do-not-reply@notification.getyourguide.com',
    textBody: `
Reference number
GYGKBGMBMQVK

Date
January 19, 2026 7:00 AM

Number of participants
3 x Adults (Age 0 - 99)

Main customer
Robin Verba
customer-test@getyourguide.com
Phone: +14143039455
Language: English

Pickup
Klumpu Bali Resort, Jalan Kesari, Sanur, Denpasar City, Bali, Indonesia

Price
Rp 5,160,000.00
  `,
    expect: {
      bookingRef: 'GYGKBGMBMQVK',
      tourDateYmd: '2026-01-19',
      tourTime: '7:00 AM',
      adults: 3,
      currency: 'IDR',
      totalPrice: 5160000,
      mainContactName: 'Robin Verba',
    },
  },
  {
    name: 'placeholder-guest-should-not-win',
    subject: 'Booking - S000001 - GYGX7NV9QZY5',
    from: 'do-not-reply@notification.getyourguide.com',
    textBody: `
Reference number
GYGX7NV9QZY5

Date
January 21, 2026 9:30 AM

Main customer
Guest
guest@getyourguide.com
Language: English

Name: Elizabeth S.
Email: elizabeth@example.com

Price
USD 100.00
`,
    expect: {
      bookingRef: 'GYGX7NV9QZY5',
      mainContactName: 'Elizabeth S.',
    },
  },
]

async function main() {
  console.log('\n========== TESTING GYG PARSER ==========\n')

  const failures: string[] = []

  for (const tc of cases) {
    console.log(`\n--- Case: ${tc.name} ---`)
    const result = await parser.parse(tc.subject, tc.from, '', tc.textBody)
    if (!result.success) {
      failures.push(`${tc.name}: parse failed: ${result.error}`)
      continue
    }

    const booking = result.booking!
    console.log(`Booking Ref: ${booking.bookingRef}`)
    console.log(`Customer: ${booking.mainContactName}`)

    if (tc.expect.bookingRef && booking.bookingRef !== tc.expect.bookingRef) {
      failures.push(`${tc.name}: bookingRef expected ${tc.expect.bookingRef}, got ${booking.bookingRef}`)
    }
    if (tc.expect.mainContactName && booking.mainContactName !== tc.expect.mainContactName) {
      failures.push(`${tc.name}: mainContactName expected "${tc.expect.mainContactName}", got "${booking.mainContactName}"`)
    }
    if (tc.expect.tourTime && booking.tourTime !== tc.expect.tourTime) {
      failures.push(`${tc.name}: tourTime expected "${tc.expect.tourTime}", got "${booking.tourTime}"`)
    }
    if (tc.expect.adults != null && booking.numberOfAdult !== tc.expect.adults) {
      failures.push(`${tc.name}: adults expected ${tc.expect.adults}, got ${booking.numberOfAdult}`)
    }
    if (tc.expect.currency && booking.currency !== tc.expect.currency) {
      failures.push(`${tc.name}: currency expected ${tc.expect.currency}, got ${booking.currency}`)
    }
    if (tc.expect.totalPrice != null && booking.totalPrice !== tc.expect.totalPrice) {
      failures.push(`${tc.name}: totalPrice expected ${tc.expect.totalPrice}, got ${booking.totalPrice}`)
    }
    if (tc.expect.tourDateYmd) {
      const y = booking.tourDate.getFullYear()
      const m = (booking.tourDate.getMonth() + 1).toString().padStart(2, '0')
      const d = booking.tourDate.getDate().toString().padStart(2, '0')
      const actual = `${y}-${m}-${d}`
      if (actual !== tc.expect.tourDateYmd) {
        failures.push(`${tc.name}: tourDate expected ${tc.expect.tourDateYmd}, got ${actual}`)
      }
    }
  }

  if (failures.length) {
    console.log('\n❌ TEST FAILED')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }

  console.log('\n✅ ALL TESTS PASSED\n')
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
