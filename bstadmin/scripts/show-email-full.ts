import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = await prisma.emailInbox.findFirst({
    where: {
      subject: { contains: 'GYGKBGMBMQVK', mode: 'insensitive' },
    },
  })

  if (!email) {
    console.log('Email not found')
    return
  }

  console.log('\n========== FULL EMAIL CONTENT ==========\n')
  console.log(`Subject: ${email.subject}`)
  console.log(`From: ${email.from}`)
  console.log(`\n========== TEXT BODY ==========\n`)
  console.log(email.body)
  console.log('\n========== END ==========\n')
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
