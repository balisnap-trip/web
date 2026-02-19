import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n========== ADDING DRIVER ROTATION FIELDS ==========\n')
  
  try {
    console.log('1. Adding columns to drivers table...')
    await prisma.$executeRaw`
      ALTER TABLE drivers 
      ADD COLUMN IF NOT EXISTS assignment_count INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS priority_level INT,
      ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS has_cancelled_booking BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_cancelled_date TIMESTAMP
    `
    console.log('   ✅ Driver columns added')
    
    console.log('\n2. Adding columns to users table...')
    await prisma.$executeRaw`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS total_bookings INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_cancellations INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_cancellation_at TIMESTAMP
    `
    console.log('   ✅ User columns added')
    
    console.log('\n3. Creating system_settings table...')
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value JSONB NOT NULL,
        category TEXT DEFAULT 'general',
        updated_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_system_settings_category 
      ON system_settings(category)
    `
    console.log('   ✅ SystemSetting table created')
    
    console.log('\n4. Setting initial priority for existing drivers...')
    
    // Use raw SQL since Prisma client not regenerated yet
    await prisma.$executeRaw`
      UPDATE drivers 
      SET priority_level = 1 
      WHERE name = 'Nyoman Sumberjaya'
    `
    console.log('   ✅ Nyoman Sumberjaya: priority = 1')
    
    await prisma.$executeRaw`
      UPDATE drivers 
      SET priority_level = 2 
      WHERE name = 'Wayan Juliana'
    `
    console.log('   ✅ Wayan Juliana: priority = 2')
    
    await prisma.$executeRaw`
      UPDATE drivers 
      SET priority_level = 3 
      WHERE name = 'Ajik Dauh'
    `
    console.log('   ✅ Ajik Dauh: priority = 3')
    
    await prisma.$executeRaw`
      UPDATE drivers 
      SET priority_level = 4 
      WHERE name IN ('Gus Wedana', 'Putra Arimbawa')
    `
    console.log('   ✅ Other drivers: priority = 4')
    
    await prisma.$executeRaw`
      UPDATE drivers 
      SET priority_level = 5 
      WHERE name = 'Made Wirawan'
    `
    console.log('   ✅ Made Wirawan: priority = 5')
    
    console.log('\n5. Creating initial system setting...')
    
    // Generate a unique ID for the setting
    const settingId = `setting_${Date.now()}`
    
    await prisma.$executeRaw`
      INSERT INTO system_settings (id, key, value, category)
      VALUES (
        ${settingId},
        'driver_rotation',
        '{"maxPriorityForRotation": 20, "enableSmartPriority": true, "cancelledPriorityDuration": "current_month"}'::jsonb,
        'driver'
      )
      ON CONFLICT (key) DO NOTHING
    `
    console.log('   ✅ Driver rotation settings created')
    
    console.log('\n========== MIGRATION COMPLETE ==========\n')
    console.log('✅ All database changes applied successfully!')
    console.log('\nDriver Priorities:')
    const drivers = await prisma.$queryRaw`
      SELECT name, priority_level, assignment_count 
      FROM drivers 
      ORDER BY priority_level ASC
    ` as Array<{ name: string, priority_level: number | null, assignment_count: number }>
    
    drivers.forEach(d => {
      console.log(`   - ${d.name}: Priority ${d.priority_level || 'N/A'}, Count: ${d.assignment_count}`)
    })
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error)
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
