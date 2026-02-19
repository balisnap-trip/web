const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const isPlaceholderName = (name) => {
  if (!name) return true
  return /^(guest|customer|unknown|cancelled)$/i.test(name.trim())
}

const extractName = (text) => {
  if (!text) return ''
  const normalized = text.replace(/\r/g, '')
  const patterns = [
    /Main customer:\s*(?:\n+)?([^\n@]+)/i,
    /Name:\s*([^\n\r]+)/i,
    /Customer Name[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
    /Lead Traveler Name[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
    /Traveler Name[:\s]+([^\n@]+?)(?:\n|Email|$)/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) {
      const name = match[1].trim()
      if (name && !name.includes('@') && name.length > 2 && name.length < 100) {
        return name
      }
    }
  }
  return ''
}

async function main() {
  const bookings = await prisma.booking.findMany({
    where: {
      source: 'GYG',
      mainContactName: 'Guest',
    },
    select: { id: true, bookingRef: true, mainContactName: true },
  })

  console.log(`Found ${bookings.length} GYG bookings with Guest name`)

  for (const booking of bookings) {
    const emails = await prisma.emailInbox.findMany({
      where: {
        OR: [
          { subject: { contains: booking.bookingRef } },
          { body: { contains: booking.bookingRef } },
        ],
      },
      select: { body: true, subject: true },
    })

    let foundName = ''
    for (const email of emails) {
      const name = extractName(email.body || '')
      if (name && !isPlaceholderName(name)) {
        foundName = name
        break
      }
    }

    if (foundName) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { mainContactName: foundName },
      })
      console.log(`Updated ${booking.bookingRef}: ${foundName}`)
    } else {
      console.log(`No name found for ${booking.bookingRef}`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
