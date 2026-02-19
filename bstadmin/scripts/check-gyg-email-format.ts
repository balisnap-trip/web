import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkGYGEmailFormat() {
  try {
    const email = await prisma.emailInbox.findFirst({
      where: {
        AND: [
          { subject: { contains: 'GYGKBG423Z2B', mode: 'insensitive' } },
          { subject: { contains: 'Booking -', mode: 'insensitive' } },
        ],
      },
      select: {
        subject: true,
        body: true,
        htmlBody: true,
      },
    })

    if (!email) {
      console.log('Email not found')
      await prisma.$disconnect()
      return
    }

    console.log('📧 EMAIL SUBJECT:')
    console.log(email.subject)
    console.log('\n' + '='.repeat(80))
    console.log('\n📝 EMAIL BODY (first 2000 chars):')
    console.log(email.body?.substring(0, 2000) || 'No body')
    console.log('\n' + '='.repeat(80))

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
  }
}

checkGYGEmailFormat()
