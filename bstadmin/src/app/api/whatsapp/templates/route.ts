import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  extractTemplateXmlFromSettingValue,
  getWhatsAppTemplateDefinition,
  getWhatsAppTemplateDefinitionsByScope,
  isWhatsAppTemplateKey,
  isWhatsAppTemplateScope,
  renderWhatsAppTemplateXml,
} from '@/lib/whatsapp/templates'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const scopeParam = searchParams.get('scope')
    if (!isWhatsAppTemplateScope(scopeParam)) {
      return NextResponse.json({ error: 'Invalid scope. Use driver or partner.' }, { status: 400 })
    }

    const definitions = getWhatsAppTemplateDefinitionsByScope(scopeParam)
    const keys = definitions.map((item) => item.key)
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    })
    const settingByKey = new Map<string, unknown>(settings.map((item) => [item.key, item.value]))

    const templates = definitions.map((definition) => {
      const storedXml = extractTemplateXmlFromSettingValue(settingByKey.get(definition.key))
      const xml = storedXml || definition.defaultXml
      return {
        key: definition.key,
        scope: definition.scope,
        title: definition.title,
        description: definition.description,
        placeholders: definition.placeholders,
        xml,
        isCustom: Boolean(storedXml),
      }
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('[API /whatsapp/templates] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const key = body?.key
    const xml = typeof body?.xml === 'string' ? body.xml : ''

    if (!isWhatsAppTemplateKey(key)) {
      return NextResponse.json({ error: 'Invalid template key.' }, { status: 400 })
    }

    const parsed = renderWhatsAppTemplateXml(xml, {})
    if (parsed.error) {
      return NextResponse.json({ error: `Template XML invalid: ${parsed.error}` }, { status: 400 })
    }

    const definition = getWhatsAppTemplateDefinition(key)
    await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: { xml },
        category: 'whatsapp_template',
        updatedBy: session.user.id,
      },
      create: {
        key,
        value: { xml },
        category: 'whatsapp_template',
        updatedBy: session.user.id,
      },
    })

    return NextResponse.json({
      success: true,
      key: definition.key,
      title: definition.title,
      message: 'Template updated',
    })
  } catch (error) {
    console.error('[API /whatsapp/templates] PUT error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
