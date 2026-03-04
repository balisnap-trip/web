import { apiSuccess, handleApiError } from '@/lib/api/http'
import { getLatestReviews } from '@/lib/public-data'

export async function GET() {
  try {
    return apiSuccess(await getLatestReviews(), 200)
  } catch (error) {
    return handleApiError('api/tours/review', error)
  }
}
