import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { sendContactMail } from '@/lib/utils/sendMail/sendContactMail'

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json()

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof message !== 'string'
    ) {
      throw new ApiError(400, 'All fields are required', 'VALIDATION_ERROR')
    }

    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedMessage = message.trim()

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      throw new ApiError(400, 'All fields are required', 'VALIDATION_ERROR')
    }

    if (!isValidEmail(trimmedEmail)) {
      throw new ApiError(400, 'Invalid email format', 'VALIDATION_ERROR')
    }

    const result = await sendContactMail({
      name: trimmedName,
      email: trimmedEmail,
      message: trimmedMessage
    })

    if (result.status !== 'ok') {
      throw new ApiError(500, 'Failed to send email', 'EMAIL_SEND_ERROR')
    }

    return apiSuccess({ message: 'Email sent successfully' }, 200)
  } catch (error) {
    return handleApiError('api/mail/contact', error)
  }
}
