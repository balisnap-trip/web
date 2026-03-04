import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { getTourBySlug } from '@/lib/public-data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug?.trim()

    if (!slug) {
      throw new ApiError(400, 'Invalid slug', 'VALIDATION_ERROR')
    }

    const tour = await getTourBySlug(slug)

    if (!tour) {
      throw new ApiError(404, 'Tour not found', 'NOT_FOUND')
    }

    return apiSuccess(tour, 200)
  } catch (error) {
    return handleApiError('api/tours/[slug]', error)
  }
}
