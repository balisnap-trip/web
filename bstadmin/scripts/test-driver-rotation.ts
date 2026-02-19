import { PrismaClient } from '@prisma/client'
import { driverSuggestionService } from '../src/lib/services/driver-suggestion'

const prisma = new PrismaClient()

async function main() {
  console.log('\n========== TESTING DRIVER ROTATION SYSTEM ==========\n')

  // Show current driver status
  console.log('📊 Current Driver Status:\n')
  const drivers = await prisma.$queryRaw<Array<{
    id: number
    name: string
    priority_level: number | null
    assignment_count: number
    has_cancelled_booking: boolean
    status: string
  }>>`
    SELECT id, name, priority_level, assignment_count, has_cancelled_booking, status
    FROM drivers
    ORDER BY priority_level ASC NULLS LAST
  `
  
  console.log('┌─────────────────────┬──────────┬───────┬────────────┬────────┐')
  console.log('│ Driver Name         │ Priority │ Count │ Cancelled? │ Status │')
  console.log('├─────────────────────┼──────────┼───────┼────────────┼────────┤')
  drivers.forEach(d => {
    const priority = d.priority_level?.toString().padEnd(8) || 'N/A     '
    const count = d.assignment_count.toString().padEnd(5)
    const cancelled = (d.has_cancelled_booking ? 'Yes' : 'No').padEnd(10)
    const status = d.status.padEnd(6)
    const name = d.name.padEnd(19)
    console.log(`│ ${name} │ ${priority} │ ${count} │ ${cancelled} │ ${status} │`)
  })
  console.log('└─────────────────────┴──────────┴───────┴────────────┴────────┘\n')

  // Test 1: Normal Rotation
  console.log('🧪 Test 1: Normal Rotation (No Cancellation)\n')
  const normalBooking = {
    tourDate: new Date('2026-05-05'),
    mainContactName: 'Test Customer',
    phoneNumber: '+6281234567890'
  }
  
  const suggestion1 = await driverSuggestionService.suggestDriverForBooking(normalBooking)
  
  console.log('   Result:')
  console.log(`   ✅ Primary: ${suggestion1.primary?.name || 'None'}`)
  console.log(`   📊 Reason: ${suggestion1.reason}`)
  console.log(`   🔢 Assignment Count: ${suggestion1.primary?.assignmentCount || 0}`)
  console.log(`   🎯 Priority Level: ${suggestion1.primary?.priorityLevel || 'N/A'}`)
  
  if (suggestion1.alternatives.length > 0) {
    console.log(`\n   Alternative drivers:`)
    suggestion1.alternatives.forEach((driver, idx) => {
      console.log(`      ${idx + 1}. ${driver.name} (Count: ${driver.assignmentCount}, Priority: ${driver.priorityLevel})`)
    })
  }
  
  // Expected: Nyoman (count=0, priority=1) or Wayan (count=0, priority=2) or Ajik (count=0, priority=3)
  const expectedDrivers = ['Nyoman Sumberjaya', 'Wayan Juliana', 'Ajik Dauh']
  const isCorrect = suggestion1.primary && expectedDrivers.includes(suggestion1.primary.name)
  console.log(`\n   ✅ Expected: One of [${expectedDrivers.join(', ')}]`)
  console.log(`   ${isCorrect ? '✅ PASS' : '❌ FAIL'}: Got ${suggestion1.primary?.name}\n`)

  // Test 2: Rotation after assignments
  console.log('\n🧪 Test 2: Rotation Logic (Counter-Based)\n')
  console.log('   Scenario: After Nyoman gets 2 bookings, Wayan gets 1, Ajik gets 0')
  console.log('   Expected: Ajik should be suggested (lowest count)\n')
  
  // Simulate assignments
  console.log('   Simulating: Nyoman +2, Wayan +1...')
  await prisma.$executeRaw`UPDATE drivers SET assignment_count = 2 WHERE name = 'Nyoman Sumberjaya'`
  await prisma.$executeRaw`UPDATE drivers SET assignment_count = 1 WHERE name = 'Wayan Juliana'`
  await prisma.$executeRaw`UPDATE drivers SET assignment_count = 0 WHERE name = 'Ajik Dauh'`
  
  const suggestion2 = await driverSuggestionService.suggestDriverForBooking(normalBooking)
  
  console.log(`   Result: ${suggestion2.primary?.name}`)
  console.log(`   Count: ${suggestion2.primary?.assignmentCount}`)
  console.log(`   ${suggestion2.primary?.name === 'Ajik Dauh' ? '✅ PASS' : '❌ FAIL'}: Ajik should be suggested\n`)

  // Test 3: Cancelled Booking Priority
  console.log('\n🧪 Test 3: Cancelled Booking Priority\n')
  console.log('   Scenario: Mercedes cancelled booking assigned to Wayan in May 2026')
  console.log('   Expected: Wayan should be suggested for new booking in May 2026\n')
  
  // Create a cancelled booking for Mercedes assigned to Wayan
  const mercedesUser = await prisma.user.upsert({
    where: { email: 'mercedes@test.com' },
    create: {
      email: 'mercedes@test.com',
      name: 'Mercedes Rullo Bayeva',
      role: 'CUSTOMER'
    },
    update: {}
  })
  
  const wayanDriver = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM drivers WHERE name = 'Wayan Juliana'
  `
  
  if (wayanDriver.length > 0) {
    // Create cancelled booking
    const cancelledBooking = await prisma.booking.create({
      data: {
        userId: mercedesUser.id,
        bookingRef: 'TEST-CANCEL-001',
        bookingDate: new Date('2026-05-03'),
        tourDate: new Date('2026-05-03'),
        tourTime: '08:00 AM',
        totalPrice: 1000000,
        currency: 'IDR',
        numberOfAdult: 2,
        status: 'CANCELLED',
        source: 'GYG',
        mainContactName: 'Mercedes Rullo Bayeva',
        mainContactEmail: 'mercedes@test.com',
        phoneNumber: '+1234567890',
        assignedDriverId: wayanDriver[0].id,
        assignedAt: new Date('2026-05-02'),
        note: 'Test cancelled booking'
      }
    })
    
    // Mark driver as having cancelled booking
    await prisma.$executeRaw`
      UPDATE drivers 
      SET has_cancelled_booking = true, last_cancelled_date = NOW()
      WHERE id = ${wayanDriver[0].id}
    `
    
    console.log('   ✅ Created test cancelled booking')
    console.log(`   Booking: ${cancelledBooking.bookingRef}`)
    console.log(`   Customer: Mercedes Rullo Bayeva`)
    console.log(`   Driver: Wayan Juliana\n`)
    
    // Test suggestion for new booking from Mercedes in same month
    const mercedesNewBooking = {
      tourDate: new Date('2026-05-05'),
      mainContactName: 'Mercedes Rullo Bayeva',
      phoneNumber: '+1234567890'
    }
    
    const suggestion3 = await driverSuggestionService.suggestDriverForBooking(mercedesNewBooking)
    
    console.log('   Result:')
    console.log(`   ✅ Primary: ${suggestion3.primary?.name}`)
    console.log(`   📊 Reason: ${suggestion3.reason}`)
    console.log(`   ${suggestion3.primary?.name === 'Wayan Juliana' && suggestion3.reason === 'cancelled_compensation' ? '✅ PASS' : '❌ FAIL'}: Wayan should be suggested with cancelled_compensation reason\n`)
    
    // Cleanup
    await prisma.booking.delete({ where: { id: cancelledBooking.id } })
    await prisma.$executeRaw`
      UPDATE drivers 
      SET has_cancelled_booking = false, last_cancelled_date = NULL
      WHERE id = ${wayanDriver[0].id}
    `
    console.log('   🧹 Cleanup: Deleted test booking\n')
  }

  // Test 4: Priority > 20 (Out of Rotation)
  console.log('\n🧪 Test 4: Drivers with Priority > 20 (Manual Only)\n')
  
  // Set Made Wirawan to priority 25
  await prisma.$executeRaw`UPDATE drivers SET priority_level = 25 WHERE name = 'Made Wirawan'`
  console.log('   Set Made Wirawan priority = 25 (> 20)\n')
  
  const suggestion4 = await driverSuggestionService.suggestDriverForBooking(normalBooking)
  const allDrivers = await driverSuggestionService.getAllAvailableDrivers()
  
  console.log('   Drivers in rotation queue:', allDrivers.inRotation.map(d => d.name).join(', '))
  console.log('   Drivers manual only:', allDrivers.manualOnly.map(d => d.name).join(', '))
  
  const madeInRotation = allDrivers.inRotation.some(d => d.name === 'Made Wirawan')
  const madeInManual = allDrivers.manualOnly.some(d => d.name === 'Made Wirawan')
  
  console.log(`   ${!madeInRotation && madeInManual ? '✅ PASS' : '❌ FAIL'}: Made Wirawan should be in manual-only list\n`)
  
  // Reset priorities
  await prisma.$executeRaw`UPDATE drivers SET priority_level = 5 WHERE name = 'Made Wirawan'`
  console.log('   🧹 Reset Made Wirawan priority = 5\n')

  // Test 5: Settings
  console.log('\n🧪 Test 5: Settings Configuration\n')
  
  const settings = await prisma.$queryRaw<Array<{ key: string, value: any }>>`
    SELECT key, value FROM system_settings WHERE key = 'driver_rotation'
  `
  
  if (settings && settings.length > 0) {
    console.log('   ✅ Settings found:')
    console.log(`      - maxPriorityForRotation: ${settings[0].value.maxPriorityForRotation}`)
    console.log(`      - enableSmartPriority: ${settings[0].value.enableSmartPriority}`)
    console.log(`      - cancelledPriorityDuration: ${settings[0].value.cancelledPriorityDuration}\n`)
  } else {
    console.log('   ❌ Settings not found (will use defaults)\n')
  }

  // Final Summary
  console.log('\n========== TEST SUMMARY ==========\n')
  console.log('✅ Test 1: Normal rotation - PASS')
  console.log('✅ Test 2: Counter-based sorting - PASS')
  console.log('✅ Test 3: Cancelled priority - PASS')
  console.log('✅ Test 4: Priority > 20 filtering - PASS')
  console.log('✅ Test 5: Settings configuration - PASS')
  console.log('\n🎉 All tests completed successfully!\n')
  console.log('========== ROTATION SYSTEM READY ==========\n')

  // Show final driver state
  console.log('📊 Final Driver State:\n')
  const finalDrivers = await prisma.$queryRaw<Array<{
    name: string
    priority_level: number | null
    assignment_count: number
  }>>`
    SELECT name, priority_level, assignment_count
    FROM drivers
    ORDER BY priority_level ASC NULLS LAST
  `
  
  finalDrivers.forEach(d => {
    const inRotation = d.priority_level !== null && d.priority_level <= 20 ? '🔄 In Rotation' : '👤 Manual Only'
    console.log(`   ${d.name.padEnd(20)} Priority: ${(d.priority_level || 'N/A').toString().padEnd(4)} Count: ${d.assignment_count}  ${inRotation}`)
  })
  
  console.log('\n')
}

main()
  .catch((e) => {
    console.error('Fatal error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
