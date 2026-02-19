import { resolveApiUrl } from '@/lib/utils/apiUrl'

// lib/fetchTours.js
const fetchFeaturedTours = async () => {
  const apiUrl = resolveApiUrl('/api/tours/featured')

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

const fetchTourBySlug = async (slug: string) => {
  const apiUrl = resolveApiUrl(`/api/tours/${slug}`)

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

export { fetchFeaturedTours, fetchTourBySlug }
