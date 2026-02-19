/**
 * One-time migration script to update driver assignments
 * from old booking_app data to new database
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface OldBooking {
  timestamp: string
  raw_text: string
  parsed_data: {
    booking_id: string
    guest_name: string
    pax: number
    phone: string
    guest_phone: string
    pickup_location: string
    maps_link: string
    datetime_obj: string
    activity: string
    option: string
    has_explicit_time: boolean
    platform: string
    package_type: string
    booking_mode: string
    payment_method: string
    driver?: {
      name: string
      phone: string
    }
  }
}

async function migrateDriverAssignments() {
  console.log('🚀 Starting driver assignment migration...\n')

  // Read old booking history
  const oldBookingPath = path.join('D:', 'Balisnaptrip', 'booking_app', 'booking_history.json')
  const oldBookingsData = fs.readFileSync(oldBookingPath, 'utf-8')
  const oldBookings: OldBooking[] = JSON.parse(oldBookingsData)

  console.log(`📚 Found ${oldBookings.length} bookings in old system\n`)

  let updatedCount = 0
  let notFoundCount = 0
  let noDriverCount = 0
  let errors: string[] = []

  for (const oldBooking of oldBookings) {
    const bookingRef = oldBooking.parsed_data.booking_id
    const driverInfo = oldBooking.parsed_data.driver

    // Skip if no driver assigned
    if (!driverInfo || !driverInfo.name) {
      console.log(`⏭️  Skipping ${bookingRef} - No driver assigned`)
      noDriverCount++
      continue
    }

    try {
      // Parse tour date from old booking
      const tourDate = new Date(oldBooking.parsed_data.datetime_obj)
      const guestName = oldBooking.parsed_data.guest_name.trim()

      // Find booking in new database by guest name and tour date
      // (booking_ref format is different in new system)
      const booking = await prisma.booking.findFirst({
        where: {
          mainContactName: {
            contains: guestName,
            mode: 'insensitive',
          },
          tourDate: {
            gte: new Date(tourDate.setHours(0, 0, 0, 0)),
            lt: new Date(tourDate.setHours(23, 59, 59, 999)),
          },
        },
      })

      if (!booking) {
        console.log(`❌ Booking not found: ${bookingRef} (${guestName}, ${tourDate.toISOString().split('T')[0]})`)
        notFoundCount++
        continue
      }

      // Skip if already assigned
      if (booking.assignedDriverId) {
        console.log(`⏭️  Skipping ${booking.bookingRef} - Already assigned to driver ID ${booking.assignedDriverId}`)
        continue
      }

      // Find driver by name (fuzzy match)
      const driverName = driverInfo.name.trim()
      const driver = await prisma.driver.findFirst({
        where: {
          name: {
            contains: driverName,
            mode: 'insensitive',
          },
        },
      })

      if (!driver) {
        console.log(`❌ Driver not found: ${driverName} for booking ${bookingRef}`)
        errors.push(`Driver "${driverName}" not found for booking ${bookingRef}`)
        notFoundCount++
        continue
      }

      // Update booking with driver assignment
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          assignedDriverId: driver.id,
          assignedAt: new Date(oldBooking.timestamp),
        },
      })

      // Update driver's assignment count
      await prisma.driver.update({
        where: { id: driver.id },
        data: {
          assignmentCount: {
            increment: 1,
          },
          lastAssignedAt: new Date(oldBooking.timestamp),
        },
      })

      console.log(`✅ Updated ${bookingRef} -> Assigned to ${driver.name}`)
      updatedCount++

    } catch (error) {
      console.error(`❌ Error processing ${bookingRef}:`, error)
      errors.push(`Error processing ${bookingRef}: ${error}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 MIGRATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Successfully updated: ${updatedCount}`)
  console.log(`⏭️  Skipped (no driver): ${noDriverCount}`)
  console.log(`❌ Not found / errors: ${notFoundCount}`)
  console.log(`📝 Total processed: ${oldBookings.length}`)

  if (errors.length > 0) {
    console.log('\n⚠️  ERRORS:')
    errors.forEach(err => console.log(`   - ${err}`))
  }

  console.log('\n✨ Migration completed!')
}

// Run migration
migrateDriverAssignments()
  .catch((e) => {
    console.error('❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
