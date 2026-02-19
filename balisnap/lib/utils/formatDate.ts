import { format } from 'date-fns'
import { format as formatUTC, toZonedTime } from 'date-fns-tz'

export const dateToTimeFormat = (dateString: string) => {
  // Ubah string menjadi objek Date
  const date = new Date(dateString)

  // Konversi waktu ke waktu UTC untuk zona waktu tertentu
  const utcDate = toZonedTime(date, 'UTC')

  // Format waktu menggunakan date-fns
  const timeString = formatUTC(utcDate, 'hh:mm a') // Format 12-jam (AM/PM)

  return timeString
}

export const formatDate = (dateString: string) => {
  if (dateString) {
    const date = new Date(dateString)
    const formatDateString = format(date, 'MMMM dd, yyyy')

    return formatDateString
  }

  return null
}
