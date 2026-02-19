import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@balisnaptrip.com' },
    update: {},
    create: {
      email: 'admin@balisnaptrip.com',
      name: 'Admin',
      password: hashedPassword,
      role: 'ADMIN',
      emailVerified: new Date(),
    },
  })

  console.log('Created admin user:', admin.email)

  // Create sample tour packages
  const tourPackages = await Promise.all([
    prisma.tourPackage.create({
      data: {
        packageName: 'Ubud Full Day Tour',
        slug: 'ubud-full-day-tour',
        shortDescription: 'Explore the heart of Bali',
        description: 'Visit Ubud Monkey Forest, Rice Terraces, and local temples',
        durationDays: 1,
        pricePerPerson: 50,
        pricePerChild: 35,
        baseCurrency: 'USD',
        minBooking: 1,
        maxBooking: 10,
        isFeatured: true,
      },
    }),
    prisma.tourPackage.create({
      data: {
        packageName: 'Saba Beach Horse Riding & Turtle Release',
        slug: 'saba-beach-horse-riding',
        shortDescription: 'Beach adventure experience',
        description: 'Horse riding on black sand beach and turtle release program',
        durationDays: 1,
        pricePerPerson: 120,
        pricePerChild: 90,
        baseCurrency: 'USD',
        minBooking: 1,
        maxBooking: 6,
        isFeatured: true,
      },
    }),
  ])

  console.log(`Created ${tourPackages.length} tour packages`)

  // Create sample drivers
  const drivers = await Promise.all([
    prisma.driver.create({
      data: {
        name: 'Made Wirawan',
        email: 'made@example.com',
        phone: '+62 812-3456-7890',
        vehicleType: 'Toyota Avanza',
        vehiclePlate: 'B 1234 XYZ',
        status: 'AVAILABLE',
        rating: 4.8,
      },
    }),
    prisma.driver.create({
      data: {
        name: 'Ketut Suwitra',
        email: 'ketut@example.com',
        phone: '+62 813-9876-5432',
        vehicleType: 'Toyota Innova',
        vehiclePlate: 'B 5678 ABC',
        status: 'AVAILABLE',
        rating: 4.9,
      },
    }),
  ])

  console.log(`Created ${drivers.length} drivers`)

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
