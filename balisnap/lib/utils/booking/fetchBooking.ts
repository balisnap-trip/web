import { resolveApiUrl } from '../apiUrl'

// lib/fetchTours.js
const fetchBookings = async () => {
  const apiUrl = resolveApiUrl('/api/bookings')

  try {
    const res = await fetch(apiUrl, {
      cache: 'no-cache'
    })

    if (!res.ok) {
      throw new Error('Network response was not ok')
    }

    const data = await res.json()

    return data
  } catch (error) {
    return [] // Return empty array on error
  }
}

const fetchBookingById = async (id: string) => {
  const apiUrl = resolveApiUrl(`/api/booking/${id}`)

  try {
    const res = await fetch(apiUrl, {
      cache: 'no-cache'
    })

    if (!res.ok) {
      throw new Error('Network response was not ok')
    }

    const data = await res.json()

    return data
  } catch (error) {
    return [] // Return empty array on error
  }
}

export { fetchBookingById, fetchBookings }
