import { getServerSession } from 'next-auth'

import { apiSuccess, handleApiError } from '@/lib/api/http'
import { authOptions } from '@/lib/auth'
import { getBookingsForSessionUser } from '@/lib/customer-bookings'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as
      | { id?: string; email?: string }
      | undefined

    return apiSuccess(await getBookingsForSessionUser(sessionUser), 200)
  } catch (error) {
    return handleApiError('api/bookings', error)
  }
}
