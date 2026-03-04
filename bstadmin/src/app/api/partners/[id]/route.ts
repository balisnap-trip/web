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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
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
    const partnerId = parseInt(id)
    if (Number.isNaN(partnerId)) {
      return NextResponse.json({ error: 'Invalid partner id' }, { status: 400 })
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

    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: {
        name: name !== undefined ? String(name).trim() : undefined,
        category: resolvedCategoryId !== null && resolvedCategoryId !== undefined ? (category ? category.code : null) : undefined,
        tourItemCategoryId:
          resolvedCategoryId !== null && resolvedCategoryId !== undefined ? (category ? category.id : null) : undefined,
        picName: picName !== undefined ? (picName ? String(picName).trim() : null) : undefined,
        picWhatsapp: picWhatsapp !== undefined ? (picWhatsapp ? String(picWhatsapp).trim() : null) : undefined,
        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
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
      const partnerKey = String(partnerId)
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
    console.error('[API /partners/[id]] Error updating partner:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const partnerId = parseInt(id)
    if (Number.isNaN(partnerId)) {
      return NextResponse.json({ error: 'Invalid partner id' }, { status: 400 })
    }

    await prisma.partner.delete({ where: { id: partnerId } })
    const partnerKey = String(partnerId)
    const [readyTemplateMap, doneInvoiceTemplateMap] = await Promise.all([
      loadPartnerTemplateMap('ready'),
      loadPartnerTemplateMap('done_invoice'),
    ])
    let shouldSaveReady = false
    let shouldSaveDoneInvoice = false
    if (Object.prototype.hasOwnProperty.call(readyTemplateMap, partnerKey)) {
      delete readyTemplateMap[partnerKey]
      shouldSaveReady = true
    }
    if (Object.prototype.hasOwnProperty.call(doneInvoiceTemplateMap, partnerKey)) {
      delete doneInvoiceTemplateMap[partnerKey]
      shouldSaveDoneInvoice = true
    }
    if (shouldSaveReady || shouldSaveDoneInvoice) {
      await Promise.all([
        shouldSaveReady
          ? savePartnerTemplateMap('ready', readyTemplateMap)
          : Promise.resolve(),
        shouldSaveDoneInvoice
          ? savePartnerTemplateMap('done_invoice', doneInvoiceTemplateMap)
          : Promise.resolve(),
      ])
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /partners/[id]] Error deleting partner:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete partner' },
      { status: 500 }
    )
  }
}
