import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('\n========== IMPORTING DRIVERS FROM OLD SYSTEM ==========\n')

  // Read drivers from old system
  const oldDriversPath = path.join('D:', 'Balisnaptrip', 'booking_app', 'drivers.json')
  
  if (!fs.existsSync(oldDriversPath)) {
    console.error(`❌ File not found: ${oldDriversPath}`)
    console.log('\nManually adding drivers...\n')
    
    // Fallback: manually add drivers if file not accessible
    const driversData = {
      "Wayan Juliana": "+62 878-8809-7915",
      "Nyoman Sumberjaya": "+62 821-4738-5571",
      "Ajik Dauh": "+6281952068018",
      "Gus Wedana": "+62 878-5249-9497",
      "Putra Arimbawa": "+6285935330845"
    }
    
    await importDrivers(driversData)
  } else {
    const fileContent = fs.readFileSync(oldDriversPath, 'utf-8')
    const driversData = JSON.parse(fileContent)
    await importDrivers(driversData)
  }

  console.log('\n========== IMPORT COMPLETE ==========\n')
}

async function importDrivers(driversData: Record<string, string>) {
  let imported = 0
  let skipped = 0

  for (const [name, phone] of Object.entries(driversData)) {
    try {
      // Check if driver already exists
      const existing = await prisma.driver.findFirst({
        where: {
          OR: [
            { name: name },
            { phone: phone }
          ]
        }
      })

      if (existing) {
        console.log(`⏭️  Skipped: ${name} (${phone}) - Already exists`)
        skipped++
        continue
      }

      // Create new driver
      const driver = await prisma.driver.create({
        data: {
          name: name,
          phone: phone,
          vehicleType: 'Car', // Default, can be updated later
          status: 'AVAILABLE',
          rating: 0,
        }
      })

      console.log(`✅ Imported: ${driver.name} - ${driver.phone}`)
      imported++
    } catch (error) {
      console.error(`❌ Error importing ${name}:`, error)
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   ✅ Imported: ${imported} drivers`)
  console.log(`   ⏭️  Skipped: ${skipped} drivers (already exist)`)

  // Show all drivers
  const allDrivers = await prisma.driver.findMany({
    orderBy: { name: 'asc' }
  })

  console.log(`\n📋 All Drivers in System (${allDrivers.length} total):`)
  allDrivers.forEach((driver, index) => {
    console.log(`   ${index + 1}. ${driver.name} - ${driver.phone} [${driver.status}]`)
  })
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
