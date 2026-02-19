import { NextRequest } from 'next/server'

import { ApiError } from '@/lib/api/errors'
import { apiSuccess, handleApiError } from '@/lib/api/http'
import { generateAccessToken } from '@/lib/utils/paymentServices/payment-services'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      throw new ApiError(400, 'Order ID is required', 'VALIDATION_ERROR')
    }

    const paypalApiUrl = process.env.PAYPAL_API_URL

    if (!paypalApiUrl) {
      throw new ApiError(500, 'PayPal API URL is missing', 'PAYPAL_CONFIG_ERROR')
    }

    const accessToken = await generateAccessToken()
    const response = await fetch(`${paypalApiUrl}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const rawDetails = await response.text()
      let details: unknown = { raw: rawDetails }

      try {
        details = rawDetails ? JSON.parse(rawDetails) : {}
      } catch {
        details = { raw: rawDetails }
      }

      throw new ApiError(
        502,
        'Failed to fetch order status',
        'PAYPAL_STATUS_ERROR',
        details
      )
    }

    const data = await response.json()

    return apiSuccess({ status: data.status }, 200)
  } catch (error) {
    return handleApiError('api/orders/status', error)
  }
}
