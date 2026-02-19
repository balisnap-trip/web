import * as fs from 'fs'
import { ExcelBooking } from '@/types/tracking'
import { parseBookingSource } from './utils'

/**
 * TXT Processor
 * Reads and parses tab-separated TXT file containing booking data
 */
export class TxtProcessor {
  /**
   * Process TXT file and return array of bookings
   */
  async processTxt(filePath: string): Promise<ExcelBooking[]> {
    console.log(`[TXT Processor] Reading file: ${filePath}`)
    
    try {
      // Read file
      const content = fs.readFileSync(filePath, 'utf-8')
      
      // Split into lines
      const lines = content.split(/\r?\n/).filter(line => line.trim())
      
      if (lines.length === 0) {
        throw new Error('TXT file is empty')
      }
      
      console.log(`[TXT Processor] Found ${lines.length} lines`)
      
      // Parse header (first line)
      const header = lines[0].split('\t').map(h => h.trim())
      console.log(`[TXT Processor] Headers:`, header)
      
      // Parse data rows (skip header, start from line 2 - line 1 is empty)
      const bookings: ExcelBooking[] = []
      
      for (let i = 2; i < lines.length; i++) {
        const row = lines[i].split('\t').map(cell => cell.trim())
        
        if (row.length < header.length) {
          console.warn(`[TXT Processor] Row ${i + 1}: Incomplete data, skipping`)
          continue
        }
        
        const booking = this.parseRow(row, header, i + 1)
        if (booking) {
          bookings.push(booking)
        }
      }
      
      console.log(`[TXT Processor] Successfully parsed ${bookings.length} bookings`)
      
      return bookings
    } catch (error) {
      console.error('[TXT Processor] Error processing TXT file:', error)
      throw error
    }
  }
  
  /**
   * Parse a single row to ExcelBooking
   */
  private parseRow(row: string[], header: string[], rowNumber: number): ExcelBooking | null {
    try {
      // Map columns by header
      const data: Record<string, string> = {}
      header.forEach((h, i) => {
        data[h] = row[i] || ''
      })
      
      // Extract fields based on known headers
      const bookingRef = data['KODE BOOKING'] || data['Booking Ref'] || data['Reference']
      const customerName = data['Leader'] || data['Customer Name'] || data['Name']
      const dateStr = data['Date'] || data['Tour Date']
      const tourName = data['Tour'] || data['Tour Name'] || data['Package']
      const sourceStr = data['FLATFORM'] || data['Source'] || data['Platform']
      const paxStr = data['Pax'] || data['Adults'] || data['Number of Adults']
      const packageType = data['Package']
      
      // Validation
      if (!bookingRef || !customerName) {
        console.warn(`[TXT Processor] Row ${rowNumber}: Missing required fields`)
        return null
      }
      
      // Parse date (DD/MM/YYYY format)
      const tourDate = this.parseDate(dateStr)
      if (!tourDate) {
        console.warn(`[TXT Processor] Row ${rowNumber}: Invalid date: ${dateStr}`)
        return null
      }
      
      // Parse pax
      const numberOfAdult = parseInt(paxStr) || 1
      
      // Parse source
      const source = sourceStr ? parseBookingSource(sourceStr) : parseBookingSource('MANUAL')
      
      const booking: ExcelBooking = {
        bookingRef: bookingRef.trim(),
        customerName: customerName.trim(),
        tourDate,
        tourName: tourName ? tourName.trim() : 'Unknown Tour',
        totalPrice: 0, // Not in TXT file
        currency: 'USD',
        source,
        numberOfAdult,
        note: packageType ? `Package: ${packageType}` : undefined,
        rawRow: data,
      }
      
      return booking
    } catch (error) {
      console.error(`[TXT Processor] Error parsing row ${rowNumber}:`, error)
      return null
    }
  }
  
  /**
   * Parse date from DD/MM/YYYY or DD/MM//YYYY format
   */
  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null
    
    const str = dateStr.trim()
    
    // Handle DD/MM/YYYY or DD/MM//YYYY (double slash)
    const cleaned = str.replace(/\/\//g, '/') // Fix double slashes
    
    // Try DD/MM/YYYY format
    const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    const match = cleaned.match(ddmmyyyy)
    
    if (match) {
      const day = parseInt(match[1], 10)
      const month = parseInt(match[2], 10)
      const year = parseInt(match[3], 10)
      
      // Create date (month is 0-indexed in JS)
      const date = new Date(year, month - 1, day)
      
      // Validate
      if (
        !isNaN(date.getTime()) &&
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year
      ) {
        return date
      }
    }
    
    console.warn(`[TXT Processor] Could not parse date: ${str}`)
    return null
  }
}

// Singleton instance
let txtProcessor: TxtProcessor | null = null

export function getTxtProcessor(): TxtProcessor {
  if (!txtProcessor) {
    txtProcessor = new TxtProcessor()
  }
  return txtProcessor
}
