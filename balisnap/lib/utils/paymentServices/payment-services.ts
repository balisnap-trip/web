import { ApiError } from '@/lib/api/errors'

interface CreateOrderPayload {
  amount: number
  bookingId: number
  bookingRef?: string | null
}

export const generateAccessToken = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_SECRET
  const paypalApiUrl = process.env.PAYPAL_API_URL

  if (!clientId || !clientSecret || !paypalApiUrl) {
    throw new ApiError(
      500,
      'PayPal credentials are not configured',
      'PAYPAL_CONFIG_ERROR'
    )
  }

  const response = await fetch(`${paypalApiUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials'
    })
  })

  if (!response.ok) {
    const rawPayload = await response.text()
    let errorPayload: unknown = { raw: rawPayload }

    try {
      errorPayload = rawPayload ? JSON.parse(rawPayload) : {}
    } catch {
      errorPayload = { raw: rawPayload }
    }

    throw new ApiError(
      502,
      'Failed to get PayPal access token',
      'PAYPAL_TOKEN_ERROR',
      errorPayload
    )
  }

  const json = await response.json()

  if (!json.access_token) {
    throw new ApiError(
      502,
      'PayPal access token response is invalid',
      'PAYPAL_TOKEN_ERROR',
      json
    )
  }

  return json.access_token as string
}

export const handleResponse = async (response: Response) => {
  const rawBody = await response.text()

  try {
    const jsonResponse = rawBody ? JSON.parse(rawBody) : {}

    return {
      jsonResponse,
      httpStatusCode: response.status
    }
  } catch (error) {
    throw new ApiError(
      502,
      rawBody || 'Invalid PayPal response',
      'PAYPAL_ERROR'
    )
  }
}

export const createOrder = async (payload: CreateOrderPayload) => {
  const amount = Number(payload.amount)

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(
      400,
      'Booking amount must be greater than zero',
      'VALIDATION_ERROR'
    )
  }

  const accessToken = await generateAccessToken()
  const paypalApiUrl = process.env.PAYPAL_API_URL

  if (!paypalApiUrl) {
    throw new ApiError(500, 'PayPal API URL is missing', 'PAYPAL_CONFIG_ERROR')
  }

  const orderPayload = {
    intent: 'CAPTURE',
    payment_source: {
      paypal: {
        experience_context: {
          shipping_preference: 'NO_SHIPPING'
        }
      }
    },
    purchase_units: [
      {
        custom_id: String(payload.bookingId),
        invoice_id: payload.bookingRef || undefined,
        amount: {
          currency_code: 'USD',
          value: amount.toFixed(2)
        }
      }
    ]
  }

  const response = await fetch(`${paypalApiUrl}/v2/checkout/orders`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    method: 'POST',
    body: JSON.stringify(orderPayload)
  })

  return handleResponse(response)
}
