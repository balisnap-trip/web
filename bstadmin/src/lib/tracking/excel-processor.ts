import * as XLSX from 'xlsx'
import { ExcelBooking, ExcelProcessingOptions } from '@/types/tracking'
import { parseBookingSource } from './utils'

/**
 * Excel Processor
 * Reads and parses Excel file containing booking data
 */
export class ExcelProcessor {
  /**
   * Process Excel file and return array of bookings
   */
  async processExcel(options: ExcelProcessingOptions): Promise<ExcelBooking[]> {
    console.log(`[Excel Processor] Reading file: ${options.filePath}`)
    
    try {
      // Read workbook
      const workbook = XLSX.readFile(options.filePath)
      
      // Get first sheet or specified sheet
      const sheetName = options.sheetName || workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in workbook`)
      }
      
      console.log(`[Excel Processor] Processing sheet: ${sheetName}`)
      
      // Convert to JSON
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Keep dates as strings
        defval: '', // Default value for empty cells
      })
      
      console.log(`[Excel Processor] Found ${rawData.length} rows`)
      
      // Parse each row to ExcelBooking
      const bookings = rawData
        .map((row, index) => this.parseRow(row, index))
        .filter((booking): booking is ExcelBooking => booking !== null)
      
      console.log(`[Excel Processor] Successfully parsed ${bookings.length} bookings`)
      
      return bookings
    } catch (error) {
      console.error('[Excel Processor] Error processing Excel file:', error)
      throw error
    }
  }
  
  /**
   * Parse a single Excel row to ExcelBooking
   */
  private parseRow(row: any, rowIndex: number): ExcelBooking | null {
    try {
      // Detect column headers (support multiple naming conventions)
      const bookingRef = this.findValue(row, [
        'Booking Ref',
        'Booking Reference',
        'Reference',
        'Ref',
        'Booking ID',
        'ID',
        'Konfirmasi',
        'No. Booking',
      ])
      
      const customerName = this.findValue(row, [
        'Customer Name',
        'Customer',
        'Guest Name',
        'Name',
        'Nama',
        'Nama Tamu',
        'Lead Traveler',
      ])
      
      const customerEmail = this.findValue(row, [
        'Email',
        'Customer Email',
        'Guest Email',
        'E-mail',
      ])
      
      const phoneNumber = this.findValue(row, [
        'Phone',
        'Phone Number',
        'Mobile',
        'Contact',
        'Telepon',
        'No. HP',
      ])
      
      const tourDateStr = this.findValue(row, [
        'Tour Date',
        'Date',
        'Activity Date',
        'Travel Date',
        'Tanggal Tour',
        'Tanggal',
      ])
      
      const tourName = this.findValue(row, [
        'Tour Name',
        'Tour',
        'Product',
        'Package',
        'Activity',
        'Nama Tour',
        'Paket',
      ])
      
      const priceStr = this.findValue(row, [
        'Price',
        'Total Price',
        'Total',
        'Amount',
        'Harga',
        'Total Harga',
      ])
      
      const currency = this.findValue(row, [
        'Currency',
        'Curr',
        'Mata Uang',
      ]) || 'USD'
      
      const sourceStr = this.findValue(row, [
        'Source',
        'Platform',
        'Channel',
        'Sumber',
      ])
      
      const adultsStr = this.findValue(row, [
        'Adults',
        'Adult',
        'Number of Adults',
        'Pax Adult',
        'Dewasa',
      ])
      
      const childrenStr = this.findValue(row, [
        'Children',
        'Child',
        'Number of Children',
        'Pax Child',
        'Anak',
      ])
      
      const meetingPoint = this.findValue(row, [
        'Meeting Point',
        'Pickup',
        'Pickup Location',
        'Location',
        'Lokasi',
        'Titik Jemput',
      ])
      
      const note = this.findValue(row, [
        'Note',
        'Notes',
        'Remarks',
        'Comment',
        'Catatan',
        'Keterangan',
      ])
      
      // Validation: Must have at least booking ref and customer name
      if (!bookingRef || !customerName) {
        console.warn(`[Excel Processor] Row ${rowIndex + 2}: Missing required fields (booking ref or customer name)`)
        return null
      }
      
      // Parse tour date
      const tourDate = this.parseDate(tourDateStr)
      if (!tourDate) {
        console.warn(`[Excel Processor] Row ${rowIndex + 2}: Invalid tour date: ${tourDateStr}`)
        return null
      }
      
      // Parse numbers
      const totalPrice = this.parseNumber(priceStr) || 0
      const numberOfAdult = this.parseNumber(adultsStr) || 1
      const numberOfChild = this.parseNumber(childrenStr) || 0
      
      // Parse source
      const source = sourceStr ? parseBookingSource(sourceStr) : parseBookingSource('MANUAL')
      
      const booking: ExcelBooking = {
        bookingRef: bookingRef.toString().trim(),
        customerName: customerName.toString().trim(),
        customerEmail: customerEmail ? customerEmail.toString().trim() : undefined,
        phoneNumber: phoneNumber ? phoneNumber.toString().trim() : undefined,
        tourDate,
        tourName: tourName ? tourName.toString().trim() : 'Unknown Tour',
        totalPrice,
        currency: currency.toString().trim(),
        source,
        numberOfAdult,
        numberOfChild: numberOfChild > 0 ? numberOfChild : undefined,
        meetingPoint: meetingPoint ? meetingPoint.toString().trim() : undefined,
        note: note ? note.toString().trim() : undefined,
        rawRow: row,
      }
      
      return booking
    } catch (error) {
      console.error(`[Excel Processor] Error parsing row ${rowIndex + 2}:`, error)
      return null
    }
  }
  
  /**
   * Find value from row by trying multiple possible column names
   */
  private findValue(row: any, possibleKeys: string[]): any {
    for (const key of possibleKeys) {
      // Try exact match
      if (row[key] !== undefined && row[key] !== '') {
        return row[key]
      }
      
      // Try case-insensitive match
      const lowerKey = key.toLowerCase()
      const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerKey)
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') {
        return row[foundKey]
      }
    }
    return undefined
  }
  
  /**
   * Parse date from various formats
   */
  private parseDate(dateStr: any): Date | null {
    if (!dateStr) return null
    
    // If already a Date object
    if (dateStr instanceof Date) {
      return dateStr
    }
    
    const str = dateStr.toString().trim()
    
    // Try parsing Excel serial date
    if (/^\d+(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str)
      // Excel epoch starts at 1900-01-01, but has a leap year bug
      const excelEpoch = new Date(1899, 11, 30)
      const date = new Date(excelEpoch.getTime() + serial * 86400000)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    
    // Try standard date parsing
    const date = new Date(str)
    if (!isNaN(date.getTime())) {
      return date
    }
    
    // Try DD/MM/YYYY format
    const ddmmyyyy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/
    const match = str.match(ddmmyyyy)
    if (match) {
      const day = parseInt(match[1], 10)
      const month = parseInt(match[2], 10)
      const year = parseInt(match[3], 10)
      
      // Try DD/MM/YYYY first
      const date1 = new Date(year, month - 1, day)
      if (!isNaN(date1.getTime()) && date1.getDate() === day) {
        return date1
      }
      
      // Try MM/DD/YYYY
      const date2 = new Date(year, day - 1, month)
      if (!isNaN(date2.getTime()) && date2.getDate() === month) {
        return date2
      }
    }
    
    console.warn(`[Excel Processor] Could not parse date: ${str}`)
    return null
  }
  
  /**
   * Parse number from string
   */
  private parseNumber(value: any): number | null {
    if (value === undefined || value === null || value === '') {
      return null
    }
    
    if (typeof value === 'number') {
      return value
    }
    
    // Remove currency symbols and commas
    const cleaned = value
      .toString()
      .replace(/[^0-9.-]/g, '')
      .trim()
    
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
  }
  
  /**
   * Get column headers from Excel file
   */
  async getHeaders(filePath: string, sheetName?: string): Promise<string[]> {
    try {
      const workbook = XLSX.readFile(filePath)
      const sheet = sheetName || workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheet]
      
      const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      if (data.length === 0) return []
      
      return data[0] as string[]
    } catch (error) {
      console.error('[Excel Processor] Error reading headers:', error)
      return []
    }
  }
}

// Singleton instance
let excelProcessor: ExcelProcessor | null = null

export function getExcelProcessor(): ExcelProcessor {
  if (!excelProcessor) {
    excelProcessor = new ExcelProcessor()
  }
  return excelProcessor
}
