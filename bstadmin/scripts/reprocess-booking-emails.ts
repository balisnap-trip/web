import { PrismaClient } from '@prisma/client'
import { GYGParser } from '../src/lib/email/parsers/gyg-parser'
import { BokunParser } from '../src/lib/email/parsers/bokun-parser'
import { TripDotComParser } from '../src/lib/email/parsers/tripdotcom-parser'
import type { EmailParser, ParsedBooking } from '../src/types/email'

type Options = {
  sources?: string[]
  bookingId?: number
  limit?: number
  relationType?: 'CREATED' | 'UPDATED' | 'CANCELLED' | 'ANY'
  maxEmailsPerBooking: number
  dryRun: boolean
  onlyMissing: boolean
  updateStatus: boolean
  updateSource: boolean
  verbose: boolean
  onlyZeroPrice: boolean
}

const prisma = new PrismaClient()
const parsers: EmailParser[] = [new GYGParser(), new BokunParser(), new TripDotComParser()]

function parseArgs(): Options {
  const args = process.argv.slice(2)
  const options: Options = {
    maxEmailsPerBooking: 5,
    dryRun: false,
    onlyMissing: false,
    updateStatus: false,
    updateSource: false,
    verbose: false,
    onlyZeroPrice: false,
  }

  for (const arg of args) {
    if (arg.startsWith('--source=')) {
      const raw = arg.split('=')[1] || ''
      const sources = raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
      if (!sources.includes('ALL')) {
        options.sources = sources
      }
    } else if (arg.startsWith('--booking-id=')) {
      const value = Number(arg.split('=')[1])
      if (!Number.isNaN(value)) options.bookingId = value
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1])
      if (!Number.isNaN(value)) options.limit = value
    } else if (arg.startsWith('--relation=')) {
      const value = (arg.split('=')[1] || '').toUpperCase()
      if (value === 'CREATED' || value === 'UPDATED' || value === 'CANCELLED' || value === 'ANY') {
        options.relationType = value as Options['relationType']
      }
    } else if (arg.startsWith('--max-emails=')) {
      const value = Number(arg.split('=')[1])
      if (!Number.isNaN(value) && value > 0) options.maxEmailsPerBooking = value
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--only-missing') {
      options.onlyMissing = true
    } else if (arg === '--update-status') {
      options.updateStatus = true
    } else if (arg === '--update-source') {
      options.updateSource = true
    } else if (arg === '--verbose') {
      options.verbose = true
    } else if (arg === '--only-zero-price') {
      options.onlyZeroPrice = true
    }
  }

  return options
}

function normalizeRef(ref?: string | null): string {
  if (!ref) return ''
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function isPlaceholderName(name?: string | null): boolean {
  if (!name) return true
  return /^(guest|customer|unknown|cancelled)$/i.test(name.trim())
}

function isPlaceholderEmail(email?: string | null): boolean {
  if (!email) return true
  return /no-email@getyourguide\.com|cancelled@getyourguide\.com|no-email@unknown\.com/i.test(email.trim())
}

function shouldSkipForMissingOnly(booking: any): boolean {
  return !(
    isPlaceholderName(booking.mainContactName) ||
    isPlaceholderEmail(booking.mainContactEmail) ||
    !booking.phoneNumber ||
    !booking.meetingPoint ||
    !booking.tourTime
  )
}

function truncate(text: string, maxLength: number = 60): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

async function selectParsedBooking(
  booking: any,
  options: Options
): Promise<{ parsed: ParsedBooking; email: any; relationType: string } | null> {
  const emails = booking.bookingEmails
    .filter((be: any) => {
      if (!options.relationType || options.relationType === 'ANY') return true
      return be.relationType === options.relationType
    })
    .sort((a: any, b: any) => b.email.receivedAt.getTime() - a.email.receivedAt.getTime())
    .slice(0, options.maxEmailsPerBooking)

  for (const be of emails) {
    const email = be.email
    if (!email) continue
    const bodyForCanHandle = email.htmlBody || email.body || ''
    const parser = parsers.find((p) => p.canHandle(email.subject, email.from, bodyForCanHandle))
    if (!parser) {
      if (options.verbose) {
        console.log(`No parser for email ${email.id}: ${truncate(email.subject)}`)
      }
      continue
    }

    const result = await parser.parse(
      email.subject,
      email.from,
      email.htmlBody || '',
      email.body || ''
    )

    if (!result.success || !result.booking) {
      if (options.verbose) {
        console.log(`Parse failed for email ${email.id}: ${result.error || 'unknown error'}`)
      }
      continue
    }

    if (booking.bookingRef && result.booking.bookingRef) {
      const bookingRef = normalizeRef(booking.bookingRef)
      const parsedRef = normalizeRef(result.booking.bookingRef)
      if (bookingRef && parsedRef && bookingRef !== parsedRef) {
        if (options.verbose) {
          console.log(`Ref mismatch for booking ${booking.id}: ${booking.bookingRef} vs ${result.booking.bookingRef}`)
        }
        continue
      }
    }

    return { parsed: result.booking, email, relationType: be.relationType }
  }

  return null
}

function buildUpdateData(
  booking: any,
  parsed: ParsedBooking,
  email: any,
  relationType: string,
  options: Options
): { updateData: any; changes: string[] } {
  const updateData: any = {}
  const changes: string[] = []

  const isCancellation = parsed.tourName === 'CANCELLATION'
  if (isCancellation && !options.updateStatus) {
    return { updateData, changes }
  }

  if (!booking.bookingRef && parsed.bookingRef) {
    updateData.bookingRef = parsed.bookingRef
    changes.push(`bookingRef -> ${parsed.bookingRef}`)
  }

  if (!isCancellation) {
    if (parsed.tourName && parsed.tourName !== booking.tourName) {
      updateData.tourName = parsed.tourName
      changes.push(`tourName -> ${parsed.tourName}`)
    }

    if (parsed.tourDate && booking.tourDate?.getTime() !== parsed.tourDate.getTime()) {
      updateData.tourDate = parsed.tourDate
      changes.push(`tourDate -> ${parsed.tourDate.toISOString().split('T')[0]}`)
    }

    if (parsed.tourTime && parsed.tourTime !== booking.tourTime) {
      updateData.tourTime = parsed.tourTime
      changes.push(`tourTime -> ${parsed.tourTime}`)
    }

    if (typeof parsed.numberOfAdult === 'number' && parsed.numberOfAdult > 0 && parsed.numberOfAdult !== booking.numberOfAdult) {
      updateData.numberOfAdult = parsed.numberOfAdult
      changes.push(`adults -> ${parsed.numberOfAdult}`)
    }

    if (parsed.numberOfChild !== undefined && parsed.numberOfChild !== booking.numberOfChild) {
      updateData.numberOfChild = parsed.numberOfChild
      changes.push(`children -> ${parsed.numberOfChild}`)
    }

    if (parsed.mainContactName && !isPlaceholderName(parsed.mainContactName)) {
      if (isPlaceholderName(booking.mainContactName) || parsed.mainContactName !== booking.mainContactName) {
        updateData.mainContactName = parsed.mainContactName
        changes.push(`contactName -> ${parsed.mainContactName}`)
      }
    }

    if (parsed.mainContactEmail && !isPlaceholderEmail(parsed.mainContactEmail)) {
      if (isPlaceholderEmail(booking.mainContactEmail) || parsed.mainContactEmail !== booking.mainContactEmail) {
        updateData.mainContactEmail = parsed.mainContactEmail
        changes.push(`contactEmail -> ${parsed.mainContactEmail}`)
      }
    }

    if (parsed.phoneNumber && parsed.phoneNumber !== booking.phoneNumber) {
      updateData.phoneNumber = parsed.phoneNumber
      changes.push('phone -> updated')
    }

    if (parsed.meetingPoint && parsed.meetingPoint !== booking.meetingPoint) {
      updateData.meetingPoint = parsed.meetingPoint
      changes.push('meetingPoint -> updated')
    }

    const currentPrice = Number(booking.totalPrice || 0)
    if (parsed.totalPrice && parsed.totalPrice > 0 && parsed.totalPrice !== currentPrice) {
      updateData.totalPrice = parsed.totalPrice
      changes.push(`totalPrice -> ${parsed.totalPrice}`)
    }

    if (parsed.currency && parsed.currency !== booking.currency) {
      updateData.currency = parsed.currency
      changes.push(`currency -> ${parsed.currency}`)
    }
  }

  if (options.updateStatus) {
    if (relationType === 'CANCELLED' || isCancellation) {
      if (booking.status !== 'CANCELLED') {
        updateData.status = 'CANCELLED'
        updateData.assignedDriverId = null
        changes.push('status -> CANCELLED')
      }
    } else if (relationType === 'UPDATED') {
      if (booking.status !== 'CANCELLED') {
        updateData.status = 'UPDATED'
        changes.push('status -> UPDATED')
      }
    }
  }

  if (options.updateSource && parsed.source && parsed.source !== booking.source) {
    updateData.source = parsed.source
    changes.push(`source -> ${parsed.source}`)
  }

  if (changes.length > 0) {
    const notePrefix = `[REPROCESS ${new Date().toISOString()}]`
    const subject = truncate(email.subject || '')
    const meta = `Email: ${subject} (${email.from})`
    updateData.note = `${booking.note || ''}\n\n${notePrefix}\n${meta}\nChanges: ${changes.join('; ')}`
  }

  return { updateData, changes }
}

async function main() {
  const options = parseArgs()

  console.log('Reprocess booking emails')
  console.log('Options:', {
    ...options,
    sources: options.sources?.join(', ') || 'ALL',
  })
  console.log('')

  const where: any = { bookingEmails: { some: {} } }
  if (options.bookingId) where.id = options.bookingId
  if (options.sources?.length) where.source = { in: options.sources }
  if (options.relationType && options.relationType !== 'ANY') {
    where.bookingEmails = { some: { relationType: options.relationType } }
  }
  if (options.onlyZeroPrice) {
    where.totalPrice = 0
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      bookingEmails: {
        include: { email: true },
      },
    },
    orderBy: { id: 'asc' },
    take: options.limit,
  })

  console.log(`Found ${bookings.length} bookings with related emails\n`)

  let processed = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const booking of bookings) {
    if (options.onlyMissing && shouldSkipForMissingOnly(booking)) {
      skipped++
      continue
    }

    processed++
    try {
      const selected = await selectParsedBooking(booking, options)
      if (!selected) {
        skipped++
        continue
      }

      const { updateData, changes } = buildUpdateData(
        booking,
        selected.parsed,
        selected.email,
        selected.relationType,
        options
      )

      if (changes.length === 0) {
        if (options.verbose) {
          console.log(`No changes for booking ${booking.id}`)
        }
        skipped++
        continue
      }

      if (options.dryRun) {
        console.log(`DRY RUN booking ${booking.id}: ${changes.join('; ')}`)
        updated++
        continue
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: updateData,
      })

      if (options.verbose) {
        console.log(`Updated booking ${booking.id}: ${changes.join('; ')}`)
      }

      updated++
    } catch (error) {
      console.error(`Error processing booking ${booking.id}:`, error)
      errors++
    }
  }

  console.log('\nSummary')
  console.log(`Processed: ${processed}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
