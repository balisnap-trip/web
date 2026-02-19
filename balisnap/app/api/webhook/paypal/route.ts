import { apiSuccess, handleApiError } from '@/lib/api/http'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body?.event_type) {
      return apiSuccess({ message: 'Ignored webhook event' }, 200)
    }

    if (body.event_type === 'PAYMENT.SALE.COMPLETED') {
      // TODO: implement payment completion sync
    } else if (body.event_type === 'PAYMENT.SALE.DENIED') {
      // TODO: implement payment denied sync
    }

    return apiSuccess({ message: 'Webhook received successfully' }, 200)
  } catch (error) {
    return handleApiError('api/webhook/paypal', error)
  }
}
