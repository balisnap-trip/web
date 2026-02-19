import { getServerSession } from 'next-auth'
import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { validateCreateReviewInput } from '@/lib/api/validators'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as { id?: string; email?: string } | undefined

    if (!sessionUser?.id && !sessionUser?.email) {
      throw new ApiError(401, 'Unauthorized', 'UNAUTHORIZED')
    }

    const payload = validateCreateReviewInput(await req.json())

    const booking = await prisma.booking.findFirst({
      where: {
        booking_id: payload.booking_id,
        ...(sessionUser?.id
          ? { user_id: sessionUser.id }
          : {
              User: {
                email: sessionUser?.email
              }
            })
      },
      include: {
        Reviews: true
      }
    })

    if (!booking) {
      throw new ApiError(404, 'Booking not found', 'NOT_FOUND')
    }

    if (booking.Reviews.length > 0) {
      throw new ApiError(
        409,
        'Review already exists for this booking',
        'REVIEW_EXISTS'
      )
    }

    if (booking.status !== 'completed') {
      throw new ApiError(
        409,
        'Review can only be submitted for completed booking',
        'INVALID_BOOKING_STATUS'
      )
    }

    const review = await prisma.review.create({
      data: {
        rating: payload.rating,
        comment: payload.review,
        booking_id: payload.booking_id
      }
    })

    return apiSuccess({ review }, 201)
  } catch (error) {
    return handleApiError('api/review', error)
  }
}
