import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  loadPartnerTemplateMap,
  savePartnerTemplateMap,
  type PartnerTemplateMap,
} from '@/lib/whatsapp/partner-templates'
import { renderWhatsAppTemplateXml } from '@/lib/whatsapp/templates'

type TemplatePayload = {
  provided: boolean
  xml: string | null
  error: string | null
}

function parseTemplatePayload(
  body: Record<string, unknown>,
  field: string,
  label: string
): TemplatePayload {
  if (!Object.prototype.hasOwnProperty.call(body, field)) {
    return { provided: false, xml: null, error: null }
  }

  const raw = body[field]
  if (raw === null || raw === undefined) {
    return { provided: true, xml: null, error: null }
  }

  if (typeof raw !== 'string') {
    return { provided: true, xml: null, error: `${label} harus berupa string.` }
  }

  const xml = raw.trim()
  if (!xml) {
    return { provided: true, xml: null, error: null }
  }

  const parsed = renderWhatsAppTemplateXml(xml, {})
  if (parsed.error) {
    return { provided: true, xml: null, error: `${label} tidak valid: ${parsed.error}` }
  }

  return { provided: true, xml, error: null }
}

const withFinanceCategoryAlias = <
  T extends { id: number; tourItemCategoryId?: number | null; tourItemCategoryRef?: unknown | null }
>(
  partner: T,
  readyTemplateMap: PartnerTemplateMap = {},
  doneInvoiceTemplateMap: PartnerTemplateMap = {}
) => ({
  ...partner,
  financeCategoryId: partner.tourItemCategoryId ?? null,
  financeCategoryRef: partner.tourItemCategoryRef ?? null,
  waReadyTemplateXml: readyTemplateMap[String(partner.id)] ?? null,
  waReadyTemplateIsCustom: Boolean(readyTemplateMap[String(partner.id)]),
  waDoneInvoiceTemplateXml: doneInvoiceTemplateMap[String(partner.id)] ?? null,
  waDoneInvoiceTemplateIsCustom: Boolean(doneInvoiceTemplateMap[String(partner.id)]),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [partners, readyTemplateMap, doneInvoiceTemplateMap] = await Promise.all([
      prisma.partner.findMany({
        orderBy: { name: 'asc' },
        include: { tourItemCategoryRef: true },
      }),
      loadPartnerTemplateMap('ready'),
      loadPartnerTemplateMap('done_invoice'),
    ])

    return NextResponse.json({
      partners: partners.map((partner) =>
        withFinanceCategoryAlias(partner, readyTemplateMap, doneInvoiceTemplateMap)
      ),
    })
  } catch (error) {
    console.error('[API /partners] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const {
      name,
      financeCategoryId,
      tourItemCategoryId,
      categoryId,
      picName,
      picWhatsapp,
      notes,
      isActive,
    } = body
    const readyTemplate = parseTemplatePayload(
      body,
      'waReadyTemplateXml',
      'Template XML READY partner'
    )
    if (readyTemplate.error) {
      return NextResponse.json({ error: readyTemplate.error }, { status: 400 })
    }
    const doneInvoiceTemplate = parseTemplatePayload(
      body,
      'waDoneInvoiceTemplateXml',
      'Template XML DONE invoice partner'
    )
    if (doneInvoiceTemplate.error) {
      return NextResponse.json({ error: doneInvoiceTemplate.error }, { status: 400 })
    }

    if (!name || String(name).trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const resolvedCategoryId = financeCategoryId ?? tourItemCategoryId ?? categoryId ?? null
    const parsedCategoryId = resolvedCategoryId ? Number(resolvedCategoryId) : null
    const category =
      parsedCategoryId
        ? await prisma.tourItemCategory.findUnique({ where: { id: parsedCategoryId } })
        : null

    if (resolvedCategoryId !== null && resolvedCategoryId !== undefined && !category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

    const partner = await prisma.partner.create({
      data: {
        name: String(name).trim(),
        category: category ? category.code : null,
        tourItemCategoryId: category ? category.id : null,
        picName: picName ? String(picName).trim() : null,
        picWhatsapp: picWhatsapp ? String(picWhatsapp).trim() : null,
        notes: notes ? String(notes).trim() : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
      include: { tourItemCategoryRef: true },
    })

    let readyTemplateMap: PartnerTemplateMap = {}
    let doneInvoiceTemplateMap: PartnerTemplateMap = {}
    if (readyTemplate.provided || doneInvoiceTemplate.provided) {
      const maps = await Promise.all([
        loadPartnerTemplateMap('ready'),
        loadPartnerTemplateMap('done_invoice'),
      ])
      readyTemplateMap = maps[0]
      doneInvoiceTemplateMap = maps[1]
      const partnerKey = String(partner.id)
      if (readyTemplate.provided) {
        if (readyTemplate.xml) readyTemplateMap[partnerKey] = readyTemplate.xml
        else delete readyTemplateMap[partnerKey]
      }
      if (doneInvoiceTemplate.provided) {
        if (doneInvoiceTemplate.xml) doneInvoiceTemplateMap[partnerKey] = doneInvoiceTemplate.xml
        else delete doneInvoiceTemplateMap[partnerKey]
      }
      await Promise.all([
        savePartnerTemplateMap('ready', readyTemplateMap),
        savePartnerTemplateMap('done_invoice', doneInvoiceTemplateMap),
      ])
    }

    return NextResponse.json({
      success: true,
      partner: withFinanceCategoryAlias(partner, readyTemplateMap, doneInvoiceTemplateMap),
    })
  } catch (error) {
    console.error('[API /partners] Error creating partner:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
