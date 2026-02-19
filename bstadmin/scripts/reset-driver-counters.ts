import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Reset driver assignment counters
 * Use this at the start of a new period to rebalance rotation
 */
async function main() {
  console.log('\n========== RESET DRIVER COUNTERS ==========\n')
  
  const confirm = process.argv.includes('--confirm')
  
  if (!confirm) {
    console.log('⚠️  This will reset ALL driver assignment counters to 0')
    console.log('\nCurrent state:')
    
    const drivers = await prisma.$queryRaw<Array<{
      name: string
      assignment_count: number
    }>>`
      SELECT name, assignment_count 
      FROM drivers
      ORDER BY assignment_count DESC
    `
    
    drivers.forEach(d => {
      console.log(`   - ${d.name}: ${d.assignment_count}`)
    })
    
    console.log('\nTo proceed, run:')
    console.log('   npm run reset:counters -- --confirm')
    console.log('\n')
    return
  }
  
  console.log('Resetting counters...')
  
  await prisma.$executeRaw`
    UPDATE drivers 
    SET assignment_count = 0,
        last_assigned_at = NULL
  `
  
  console.log('✅ All driver counters reset to 0\n')
  
  const drivers = await prisma.$queryRaw<Array<{
    name: string
    assignment_count: number
    priority_level: number | null
  }>>`
    SELECT name, assignment_count, priority_level
    FROM drivers
    ORDER BY priority_level ASC NULLS LAST
  `
  
  console.log('Updated driver status:')
  drivers.forEach(d => {
    console.log(`   - ${d.name}: Count = ${d.assignment_count}, Priority = ${d.priority_level || 'N/A'}`)
  })
  
  console.log('\n========== RESET COMPLETE ==========\n')
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
