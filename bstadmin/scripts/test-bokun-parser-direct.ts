import { BokunParser } from '../src/lib/email/parsers/bokun-parser'

const parser = new BokunParser()

const cases = [
  {
    name: 'table-customer-phone-lowercase-label',
    subject: "New booking: Sat 28.Feb '26 @ 07:00 (BAL-T121114199) Ext. booking ref: 1361445557",
    from: 'no-reply@bokun.io',
    htmlBody: `
      <html>
        <body>
          <table>
            <tr><td>Customer</td><td>Jayde, Melissa</td></tr>
            <tr><td>Customer phone</td><td>AU+61 0424637131</td></tr>
            <tr><td>Email</td><td>guest@example.com</td></tr>
            <tr><td>Confirmation Number</td><td>VIA-84137237</td></tr>
            <tr><td>Activity Date</td><td>2026-02-28</td></tr>
            <tr><td>Start Time</td><td>07:00</td></tr>
            <tr><td>PAX</td><td>2 Adult</td></tr>
            <tr><td>Total</td><td>USD 120.00</td></tr>
          </table>
        </body>
      </html>
    `,
    textBody: '',
    expect: {
      bookingRef: 'VIA-84137237',
      mainContactName: 'Melissa Jayde',
      mainContactEmail: 'guest@example.com',
      phoneNumber: '+610424637131',
      source: 'VIATOR',
      adults: 2,
    },
  },
  {
    name: 'fallback-phone-from-merged-text-line',
    subject: "New booking: Sun 1.Mar '26 @ 08:00 (BAL-T121114200) Ext. booking ref: 1361445558",
    from: 'no-reply@bokun.io',
    htmlBody: `
      <html>
        <body>
          <table>
            <tr><td>Customer</td><td>Doe, Jane</td></tr>
            <tr><td>Email</td><td>jane@example.com</td></tr>
            <tr><td>Confirmation Number</td><td>VIA-84137238</td></tr>
            <tr><td>Activity Date</td><td>2026-03-01</td></tr>
            <tr><td>Start Time</td><td>08:00</td></tr>
            <tr><td>PAX</td><td>1 Adult</td></tr>
            <tr><td>Total</td><td>USD 75.00</td></tr>
          </table>
        </body>
      </html>
    `,
    textBody:
      "Customer phone AU+61 0424637131 Date Sat 28.Feb '26 @ 07:00 Rate All Included",
    expect: {
      bookingRef: 'VIA-84137238',
      mainContactName: 'Jane Doe',
      mainContactEmail: 'jane@example.com',
      phoneNumber: '+610424637131',
      source: 'VIATOR',
      adults: 1,
    },
  },
]

async function main() {
  console.log('\n========== TESTING BOKUN PARSER ==========\n')

  const failures: string[] = []

  for (const tc of cases) {
    console.log(`\n--- Case: ${tc.name} ---`)
    const result = await parser.parse(tc.subject, tc.from, tc.htmlBody, tc.textBody)
    if (!result.success) {
      failures.push(`${tc.name}: parse failed: ${result.error}`)
      continue
    }

    const booking = result.booking!
    console.log(`Booking Ref: ${booking.bookingRef}`)
    console.log(`Customer: ${booking.mainContactName}`)
    console.log(`Phone: ${booking.phoneNumber || '(empty)'}`)

    if (booking.bookingRef !== tc.expect.bookingRef) {
      failures.push(`${tc.name}: bookingRef expected ${tc.expect.bookingRef}, got ${booking.bookingRef}`)
    }
    if (booking.mainContactName !== tc.expect.mainContactName) {
      failures.push(`${tc.name}: mainContactName expected "${tc.expect.mainContactName}", got "${booking.mainContactName}"`)
    }
    if (booking.mainContactEmail !== tc.expect.mainContactEmail) {
      failures.push(`${tc.name}: mainContactEmail expected "${tc.expect.mainContactEmail}", got "${booking.mainContactEmail}"`)
    }
    if ((booking.phoneNumber || '') !== tc.expect.phoneNumber) {
      failures.push(`${tc.name}: phoneNumber expected "${tc.expect.phoneNumber}", got "${booking.phoneNumber || ''}"`)
    }
    if (booking.source !== tc.expect.source) {
      failures.push(`${tc.name}: source expected "${tc.expect.source}", got "${booking.source}"`)
    }
    if (booking.numberOfAdult !== tc.expect.adults) {
      failures.push(`${tc.name}: adults expected ${tc.expect.adults}, got ${booking.numberOfAdult}`)
    }
  }

  if (failures.length > 0) {
    console.log('\n❌ TEST FAILED')
    failures.forEach((failure) => console.log(`  - ${failure}`))
    process.exit(1)
  }

  console.log('\n✅ ALL TESTS PASSED\n')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
