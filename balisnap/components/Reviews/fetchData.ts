import { resolveApiUrl } from '@/lib/utils/apiUrl'

const fetchReviews = async () => {
  const apiUrl = resolveApiUrl('/api/tours/review')

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

export { fetchReviews }
