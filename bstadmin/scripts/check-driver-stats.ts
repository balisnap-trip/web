/**
 * Check driver statistics after migration
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkDriverStats() {
  console.log('👥 Checking driver statistics...\n')

  const drivers = await prisma.driver.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      assignmentCount: true,
      priorityLevel: true,
      lastAssignedAt: true,
      _count: {
        select: {
          bookings: true,
        },
      },
    },
    orderBy: {
      assignmentCount: 'desc',
    },
  })

  console.log(`📊 Total drivers: ${drivers.length}\n`)
  console.log('═'.repeat(90))
  console.log('Driver Name          | Phone              | Status     | Assignments | Priority | Last Assigned')
  console.log('═'.repeat(90))

  drivers.forEach((driver) => {
    const lastAssigned = driver.lastAssignedAt 
      ? driver.lastAssignedAt.toISOString().split('T')[0]
      : 'Never'
    
    console.log(
      `${driver.name.padEnd(20)} | ${driver.phone.padEnd(18)} | ` +
      `${driver.status.padEnd(10)} | ${String(driver.assignmentCount).padEnd(11)} | ` +
      `${String(driver.priorityLevel || '-').padEnd(8)} | ${lastAssigned}`
    )
  })

  console.log('═'.repeat(90))

  // Total assignments
  const totalAssignments = drivers.reduce((sum, d) => sum + d.assignmentCount, 0)
  console.log(`\n📈 Total assignments: ${totalAssignments}`)
  
  // Active drivers
  const activeDrivers = drivers.filter(d => d.status === 'AVAILABLE').length
  console.log(`✅ Available drivers: ${activeDrivers}`)
}

checkDriverStats()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
