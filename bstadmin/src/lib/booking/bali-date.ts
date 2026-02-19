const BALI_UTC_OFFSET_HOURS = 8
const MS_PER_HOUR = 60 * 60 * 1000

export const toBaliDateKey = (date: Date) => {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  const baliMs = utcMs + BALI_UTC_OFFSET_HOURS * MS_PER_HOUR
  const bali = new Date(baliMs)
  const year = bali.getUTCFullYear()
  const month = String(bali.getUTCMonth() + 1).padStart(2, '0')
  const day = String(bali.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isTourDayOrPastBali = (tourDate: Date, now: Date) =>
  toBaliDateKey(tourDate) <= toBaliDateKey(now)
