import { NextResponse } from 'next/server'

import { isApiError } from './errors'

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return { value: error }
}

export const apiSuccess = <T>(data: T, status = 200) =>
  NextResponse.json(data, { status })

export const apiError = (
  message: string,
  status = 500,
  code = 'INTERNAL_ERROR',
  details?: unknown
) =>
  NextResponse.json(
    details ? { error: message, code, details } : { error: message, code },
    { status }
  )

export const logApiError = (
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
) => {
  console.error(`[${context}]`, {
    ...normalizeError(error),
    ...(meta || {})
  })
}

export const handleApiError = (context: string, error: unknown) => {
  if (isApiError(error)) {
    if (error.status >= 500) {
      logApiError(context, error, { code: error.code, details: error.details })
    }

    return apiError(error.message, error.status, error.code, error.details)
  }

  logApiError(context, error)

  return apiError('Internal server error', 500, 'INTERNAL_ERROR')
}
