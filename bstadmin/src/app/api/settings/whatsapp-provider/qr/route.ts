import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadWhatsAppProviderSettings } from '@/lib/whatsapp/provider-settings'

/**
 * GET /api/settings/whatsapp-provider/qr
 * Proxies the current WAHA QR image so logged-in staff can pair from the admin UI.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settings = await loadWhatsAppProviderSettings()
    const baseUrl = String(settings.waha.baseUrl || '').trim().replace(/\/+$/, '')
    const wahaSession = String(settings.waha.session || 'default').trim() || 'default'

    if (!baseUrl) {
      return NextResponse.json({ error: 'WAHA base URL is not configured' }, { status: 400 })
    }

    const headers: Record<string, string> = {}
    if (settings.waha.apiKey) {
      headers['X-Api-Key'] = settings.waha.apiKey
    }

    const response = await fetch(`${baseUrl}/api/${encodeURIComponent(wahaSession)}/auth/qr`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8'
      const body = await response.arrayBuffer()
      return new NextResponse(body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      })
    }

    const contentType = response.headers.get('content-type') || 'image/png'
    const body = await response.arrayBuffer()

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[API /settings/whatsapp-provider/qr] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
