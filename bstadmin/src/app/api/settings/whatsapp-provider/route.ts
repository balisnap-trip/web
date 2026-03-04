import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  loadWhatsAppProviderSettings,
  saveWhatsAppProviderSettings,
} from '@/lib/whatsapp/provider-settings'

/**
 * GET /api/settings/whatsapp-provider
 * Returns the active WhatsApp provider and stored provider configs.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settings = await loadWhatsAppProviderSettings()
    return NextResponse.json({
      success: true,
      ...settings,
    })
  } catch (error) {
    console.error('[API /settings/whatsapp-provider] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/whatsapp-provider
 * Update provider selection and provider-specific config (admin only).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const settings = await saveWhatsAppProviderSettings(body, session.user.email || session.user.name || null)

    return NextResponse.json({
      success: true,
      ...settings,
    })
  } catch (error) {
    console.error('[API /settings/whatsapp-provider] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
