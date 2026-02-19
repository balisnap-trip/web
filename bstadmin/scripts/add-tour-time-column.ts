import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n========== ADDING tour_time COLUMN ==========\n')

  try {
    // Check if column already exists
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
        AND column_name = 'tour_time'
    `

    if (Array.isArray(result) && result.length > 0) {
      console.log('✅ Column tour_time already exists!')
      return
    }

    console.log('Adding tour_time column to bookings table...')
    
    await prisma.$executeRaw`
      ALTER TABLE bookings 
      ADD COLUMN IF NOT EXISTS tour_time VARCHAR(20)
    `

    console.log('✅ Column tour_time added successfully!')
    
    // Verify
    const verify = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
        AND column_name = 'tour_time'
    `
    
    console.log('\n📊 Verification:', verify)
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
