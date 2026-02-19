import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    const whatsappEnabled =
      typeof waSetting?.value === 'object' && waSetting?.value && 'enabled' in waSetting.value
        ? Boolean((waSetting.value as any).enabled)
        : process.env.WHATSAPP_ENABLED !== 'false'

    const cronEnabled =
      typeof cronSetting?.value === 'object' && cronSetting?.value && 'enabled' in cronSetting.value
        ? Boolean((cronSetting.value as any).enabled)
        : true

    const cronInterval =
      typeof cronConfig?.value === 'object' && cronConfig?.value && 'interval' in cronConfig.value
        ? String((cronConfig.value as any).interval)
        : 'hourly'
    const cronCustomMinutes =
      typeof cronConfig?.value === 'object' && cronConfig?.value && 'customMinutes' in cronConfig.value
        ? Number((cronConfig.value as any).customMinutes)
        : 60
    const cronLastRunAt =
      typeof cronLastRun?.value === 'object' && cronLastRun?.value && 'at' in cronLastRun.value
        ? String((cronLastRun.value as any).at)
        : undefined
    const cronStatusValue =
      typeof cronStatus?.value === 'object' && cronStatus?.value
        ? cronStatus.value as any
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
    const whatsappEnabled = Boolean(body?.whatsappEnabled)
    const cronEnabled = Boolean(body?.cronEnabled)
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
