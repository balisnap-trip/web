import { BookingSource } from '@prisma/client'

export interface ParsedBooking {
  // Source platform
  source: BookingSource
  
  // Booking reference
  bookingRef: string
  
  // Tour information
  tourName: string
  tourDate: Date
  tourTime?: string
  
  // Pricing
  totalPrice: number
  currency: string
  numberOfAdult: number
  numberOfChild?: number
  
  // Customer contact
  mainContactName: string
  mainContactEmail: string
  phoneNumber?: string
  
  // Meeting/pickup
  meetingPoint?: string
  pickupLocation?: string
  
  // Additional info
  note?: string
  
  // Raw data for debugging
  rawData?: any
}

export interface EmailParseResult {
  success: boolean
  booking?: ParsedBooking
  error?: string
  shouldIgnore?: boolean // For non-booking emails
}

export interface EmailParser {
  canHandle(subject: string, from: string, body: string): boolean
  parse(subject: string, from: string, htmlBody: string, textBody: string): Promise<EmailParseResult>
}
