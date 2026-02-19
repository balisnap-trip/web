import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const withFinanceCategoryAlias = <
  T extends { tourItemCategoryId?: number | null; tourItemCategoryRef?: unknown | null }
>(
  item: T
) => ({
  ...item,
  financeCategoryId: item.tourItemCategoryId ?? null,
  financeCategoryRef: item.tourItemCategoryRef ?? null,
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
    const body = await req.json()
    const {
      name,
      financeCategoryId,
      tourItemCategoryId,
      categoryId,
      isActive,
      partnerIds = [],
      driverIds = [],
      defaultPartnerId,
    } = body

    const itemId = parseInt(id)

    const resolvedCategoryId = financeCategoryId ?? tourItemCategoryId ?? categoryId ?? null
    const parsedCategoryId = resolvedCategoryId ? Number(resolvedCategoryId) : null
    const category =
      parsedCategoryId
        ? await prisma.tourItemCategory.findUnique({ where: { id: parsedCategoryId } })
        : null

    if (resolvedCategoryId !== null && resolvedCategoryId !== undefined && !category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

    const parsedDefaultPartnerId = defaultPartnerId ? Number(defaultPartnerId) : null
    const allowPartner = category
      ? category.payeeMode === 'PARTNER_ONLY' || category.payeeMode === 'EITHER'
      : true
    const normalizedPartnerIds = Array.isArray(partnerIds)
      ? partnerIds.map((partnerId: number) => Number(partnerId)).filter((id) => Number.isFinite(id))
      : []
    if (allowPartner && parsedDefaultPartnerId && !normalizedPartnerIds.includes(parsedDefaultPartnerId)) {
      normalizedPartnerIds.push(parsedDefaultPartnerId)
    }

    const [item] = await prisma.$transaction([
      prisma.serviceItem.update({
        where: { id: itemId },
        data: {
          name: name !== undefined ? String(name).trim() : undefined,
          tourItemCategoryId: category ? category.id : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
          defaultPartnerId:
            category
              ? allowPartner
                ? parsedDefaultPartnerId
                : null
              : defaultPartnerId !== undefined
                ? parsedDefaultPartnerId
                : undefined,
        },
      }),
      prisma.serviceItemPartner.deleteMany({ where: { serviceItemId: itemId } }),
      prisma.serviceItemDriver.deleteMany({ where: { serviceItemId: itemId } }),
      prisma.serviceItemPartner.createMany({
        data: allowPartner ? normalizedPartnerIds.map((partnerId) => ({ serviceItemId: itemId, partnerId })) : [],
      }),
      prisma.serviceItemDriver.createMany({
        data: Array.isArray(driverIds)
          ? driverIds.map((driverId: number) => ({ serviceItemId: itemId, driverId }))
          : [],
      }),
    ])

    const updated = await prisma.serviceItem.findUnique({
      where: { id: itemId },
      include: {
        partnerLinks: { include: { partner: true } },
        driverLinks: { include: { driver: true } },
        defaultPartner: true,
        tourItemCategoryRef: true,
      },
    })

    return NextResponse.json({
      success: true,
      item: updated
        ? {
            ...withFinanceCategoryAlias(updated),
            partners: updated.partnerLinks.map((link) => link.partner),
            drivers: updated.driverLinks.map((link) => link.driver),
          }
        : withFinanceCategoryAlias(item),
    })
  } catch (error) {
    console.error('[API /service-items/[id]] Error updating service item:', error)
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
    await prisma.serviceItem.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /service-items/[id]] Error deleting service item:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete service item' },
      { status: 500 }
    )
  }
}
