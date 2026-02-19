import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
      },
    })

    console.log('Total Users:', users.length)
    console.log('\nUsers:')
    users.forEach((user) => {
      console.log(`  - ID: ${user.id}`)
      console.log(`    Email: ${user.email}`)
      console.log(`    Name: ${user.name}`)
      console.log(`    Role: ${user.role}`)
      console.log('')
    })

    await prisma.$disconnect()
  } catch (error) {
    console.error('Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkUsers()
