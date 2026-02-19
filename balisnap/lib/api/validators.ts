import { ApiError } from './errors'

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getNumber = (
  value: unknown,
  field: string,
  {
    integer = false,
    min
  }: {
    integer?: boolean
    min?: number
  } = {}
) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    throw new ApiError(
      400,
      `${field} must be a valid number`,
      'VALIDATION_ERROR'
    )
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new ApiError(400, `${field} must be an integer`, 'VALIDATION_ERROR')
  }

  if (min !== undefined && parsed < min) {
    throw new ApiError(
      400,
      `${field} must be greater than or equal to ${min}`,
      'VALIDATION_ERROR'
    )
  }

  return parsed
}

const getString = (
  value: unknown,
  field: string,
  {
    minLength = 1,
    maxLength = 5000,
    required = true
  }: {
    minLength?: number
    maxLength?: number
    required?: boolean
  } = {}
) => {
  if (value === undefined || value === null) {
    if (!required) return ''
    throw new ApiError(400, `${field} is required`, 'VALIDATION_ERROR')
  }

  if (typeof value !== 'string') {
    throw new ApiError(400, `${field} must be a string`, 'VALIDATION_ERROR')
  }

  const trimmed = value.trim()

  if (required && trimmed.length < minLength) {
    throw new ApiError(
      400,
      `${field} must be at least ${minLength} characters`,
      'VALIDATION_ERROR'
    )
  }

  if (trimmed.length > maxLength) {
    throw new ApiError(
      400,
      `${field} must be at most ${maxLength} characters`,
      'VALIDATION_ERROR'
    )
  }

  return trimmed
}

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.toLowerCase())

export interface CreateBookingInput {
  variantId: number
  packageId?: number
  departureId?: number
  bookingRef: string
  bookingDate: Date
  numberOfAdult: number
  numberOfChild: number
  mainContactName: string
  mainContactEmail: string
  phoneNumber: string
  pickupLocation: string
  note?: string
}

export const validateCreateBookingInput = (
  value: unknown
): CreateBookingInput => {
  if (!isRecord(value)) {
    throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR')
  }

  const variantId = getNumber(value.variantId ?? value.packageId, 'variantId', {
    integer: true,
    min: 1
  })
  const packageId =
    value.packageId === undefined || value.packageId === null
      ? undefined
      : getNumber(value.packageId, 'packageId', {
          integer: true,
          min: 1
        })
  const departureId =
    value.departureId === undefined ||
    value.departureId === null ||
    value.departureId === ''
      ? undefined
      : getNumber(value.departureId, 'departureId', {
          integer: true,
          min: 1
        })
  const bookingRef = getString(value.bookingRef, 'bookingRef', {
    minLength: 4,
    maxLength: 64
  })
  const bookingDateString = getString(value.bookingDate, 'bookingDate', {
    minLength: 8,
    maxLength: 64
  })
  const bookingDate = new Date(bookingDateString)

  if (Number.isNaN(bookingDate.getTime())) {
    throw new ApiError(400, 'bookingDate is invalid', 'VALIDATION_ERROR')
  }

  const numberOfAdult = getNumber(value.numberOfAdult, 'numberOfAdult', {
    integer: true,
    min: 1
  })
  const numberOfChild = getNumber(value.numberOfChild ?? 0, 'numberOfChild', {
    integer: true,
    min: 0
  })
  const mainContactName = getString(value.mainContactName, 'mainContactName', {
    minLength: 2,
    maxLength: 120
  })
  const mainContactEmail = getString(
    value.mainContactEmail,
    'mainContactEmail',
    {
      minLength: 5,
      maxLength: 120
    }
  )

  if (!isValidEmail(mainContactEmail)) {
    throw new ApiError(400, 'mainContactEmail is invalid', 'VALIDATION_ERROR')
  }

  const phoneNumber = getString(value.phoneNumber, 'phoneNumber', {
    minLength: 8,
    maxLength: 24
  })
  const pickupLocation = getString(value.pickupLocation, 'pickupLocation', {
    minLength: 2,
    maxLength: 255
  })
  const note = getString(value.note, 'note', {
    required: false,
    minLength: 0,
    maxLength: 1000
  })

  return {
    variantId,
    packageId,
    departureId,
    bookingRef,
    bookingDate,
    numberOfAdult,
    numberOfChild,
    mainContactName,
    mainContactEmail,
    phoneNumber,
    pickupLocation,
    note: note || undefined
  }
}

export const validateBookingIdInput = (value: unknown) => {
  if (!isRecord(value)) {
    throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR')
  }

  return getNumber(value.bookingId, 'bookingId', { integer: true, min: 1 })
}

export interface CreateReviewInput {
  rating: number
  review: string
  booking_id: number
}

export const validateCreateReviewInput = (
  value: unknown
): CreateReviewInput => {
  if (!isRecord(value)) {
    throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR')
  }

  const rating = getNumber(value.rating, 'rating', { integer: true, min: 1 })

  if (rating > 5) {
    throw new ApiError(
      400,
      'rating must be between 1 and 5',
      'VALIDATION_ERROR'
    )
  }

  const review = getString(value.review, 'review', {
    minLength: 5,
    maxLength: 1000
  })
  const booking_id = getNumber(value.booking_id, 'booking_id', {
    integer: true,
    min: 1
  })

  return { rating, review, booking_id }
}
