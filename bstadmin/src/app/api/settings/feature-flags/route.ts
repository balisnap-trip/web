import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

function parseEnabledValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
    return null
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && 'enabled' in value) {
    const maybeEnabled = value as { enabled?: unknown }
    return parseEnabledValue(maybeEnabled.enabled)
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

/**
 * GET /api/settings/feature-flags
 * Returns feature toggles (whatsapp, cron)
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [waSetting, cronSetting, cronConfig, cronLastRun, cronStatus] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'whatsapp_enabled' } }),
      prisma.systemSetting.findUnique({ where: { key: 'cron_enabled' } }),
      prisma.systemSetting.findUnique({ where: { key: 'cron_config' } }),
      prisma.systemSetting.findUnique({ where: { key: 'cron_last_run' } }),
      prisma.systemSetting.findUnique({ where: { key: 'cron_status' } }),
    ])

    const envWaEnabled = parseEnabledValue(process.env.WHATSAPP_ENABLED)
    const whatsappEnabled = parseEnabledValue(waSetting?.value) ?? envWaEnabled ?? true

    const cronEnabled = parseEnabledValue(cronSetting?.value) ?? true
    const cronConfigValue = asRecord(cronConfig?.value)
    const cronLastRunValue = asRecord(cronLastRun?.value)
    const cronStatusValue = asRecord(cronStatus?.value) ?? undefined

    const cronInterval =
      typeof cronConfigValue?.interval === 'string' ? cronConfigValue.interval : 'hourly'
    const cronCustomMinutes =
      cronConfigValue && (typeof cronConfigValue.customMinutes === 'number' || typeof cronConfigValue.customMinutes === 'string')
        ? Number(cronConfigValue.customMinutes)
        : 60
    const cronLastRunAt =
      typeof cronLastRunValue?.at === 'string'
        ? cronLastRunValue.at
        : undefined

    return NextResponse.json({
      success: true,
      whatsappEnabled,
      cronEnabled,
      cronInterval,
      cronCustomMinutes,
      cronLastRunAt,
      cronStatus: cronStatusValue,
    })
  } catch (error) {
    console.error('[API /settings/feature-flags] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/feature-flags
 * Update feature toggles (admin only)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const whatsappEnabled = parseEnabledValue(body?.whatsappEnabled) ?? false
    const cronEnabled = parseEnabledValue(body?.cronEnabled) ?? false
    const cronInterval = String(body?.cronInterval || 'hourly')
    const cronCustomMinutes = Number(body?.cronCustomMinutes || 60)

    await prisma.systemSetting.upsert({
      where: { key: 'whatsapp_enabled' },
      update: { value: { enabled: whatsappEnabled } },
      create: { key: 'whatsapp_enabled', value: { enabled: whatsappEnabled }, category: 'system' },
    })

    await prisma.systemSetting.upsert({
      where: { key: 'cron_enabled' },
      update: { value: { enabled: cronEnabled } },
      create: { key: 'cron_enabled', value: { enabled: cronEnabled }, category: 'system' },
    })

    await prisma.systemSetting.upsert({
      where: { key: 'cron_config' },
      update: { value: { interval: cronInterval, customMinutes: cronCustomMinutes } },
      create: { key: 'cron_config', value: { interval: cronInterval, customMinutes: cronCustomMinutes }, category: 'system' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /settings/feature-flags] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
