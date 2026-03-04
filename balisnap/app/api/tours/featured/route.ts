import { apiSuccess, handleApiError } from '@/lib/api/http'
import { getFeaturedTours } from '@/lib/public-data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    return apiSuccess(await getFeaturedTours(), 200)
  } catch (error) {
    return handleApiError('api/tours/featured', error)
  }
}
