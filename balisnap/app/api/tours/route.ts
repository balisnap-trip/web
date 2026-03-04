import { apiSuccess, handleApiError } from '@/lib/api/http'
import { getAllTours } from '@/lib/public-data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    return apiSuccess(await getAllTours(), 200)
  } catch (error) {
    return handleApiError('api/tours', error)
  }
}
