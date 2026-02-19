/**
 * Convert Sales Calculation 2025.txt to JSON format
 * This creates a reference dataset for email parsing validation
 */

import fs from 'fs'
import path from 'path'

interface ManualBooking {
  no: number
  date: string // DD/MM/YYYY format
  bookingRef: string
  tour: string
  package: 'Include' | 'Exclude'
  platform: 'GYG' | 'Viator' | 'TRIP'
  pax: number
  leader: string
}

function parseDate(dateStr: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr

  const [day, month, year] = parts
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseSalesFile(filePath: string): ManualBooking[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const bookings: ManualBooking[] = []

  for (let i = 2; i < lines.length; i++) { // Skip header rows
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split('\t').map(p => p.trim())
    if (parts.length < 8) continue

    const no = parseInt(parts[0])
    if (isNaN(no)) continue

    bookings.push({
      no,
      date: parseDate(parts[1]),
      bookingRef: parts[2],
      tour: parts[3],
      package: parts[4] as 'Include' | 'Exclude',
      platform: parts[5] as 'GYG' | 'Viator' | 'TRIP',
      pax: parseInt(parts[6]) || 0,
      leader: parts[7],
    })
  }

  return bookings
}

async function main() {
  const salesFilePath = path.join(process.cwd(), '..', 'Sales Calculation 2025.txt')
  const outputPath = path.join(process.cwd(), 'data', 'manual-bookings-2025.json')

  console.log('📖 Reading sales calculation file...')
  const bookings = parseSalesFile(salesFilePath)

  console.log(`✅ Parsed ${bookings.length} bookings`)

  // Create data directory if not exists
  const dataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Write to JSON
  fs.writeFileSync(outputPath, JSON.stringify(bookings, null, 2), 'utf-8')
  console.log(`💾 Saved to: ${outputPath}`)

  // Summary
  const byPlatform = bookings.reduce((acc, b) => {
    acc[b.platform] = (acc[b.platform] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('\n📊 Summary:')
  console.log(`Total Bookings: ${bookings.length}`)
  console.log(`By Platform:`)
  Object.entries(byPlatform).forEach(([platform, count]) => {
    console.log(`  - ${platform}: ${count}`)
  })
  console.log(`Total Pax: ${bookings.reduce((sum, b) => sum + b.pax, 0)}`)
}

main().catch(console.error)
