import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkSchema() {
  try {
    // Try to query with tourName to see if field exists
    const result = await prisma.$queryRaw`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name='bookings'
    `

    console.log('Bookings table schema:')
    console.log(result)

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
  }
}

checkSchema()
