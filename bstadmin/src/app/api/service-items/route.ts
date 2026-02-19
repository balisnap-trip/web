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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await prisma.serviceItem.findMany({
      orderBy: { name: 'asc' },
      include: {
        partnerLinks: { include: { partner: true } },
        driverLinks: { include: { driver: true } },
        defaultPartner: true,
        tourItemCategoryRef: true,
      },
    })

    return NextResponse.json({
      items: items.map((item) => {
        const normalized = withFinanceCategoryAlias(item)
        return {
          ...normalized,
          partners: item.partnerLinks.map((link) => link.partner),
          drivers: item.driverLinks.map((link) => link.driver),
        }
      }),
    })
  } catch (error) {
    console.error('[API /service-items] Error:', error)
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

    if (!name || String(name).trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const resolvedCategoryId = financeCategoryId ?? tourItemCategoryId ?? categoryId ?? null
    const parsedCategoryId = resolvedCategoryId ? Number(resolvedCategoryId) : null
    const category =
      parsedCategoryId
        ? await prisma.tourItemCategory.findUnique({ where: { id: parsedCategoryId } })
        : null

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 })
    }

    const parsedDefaultPartnerId = defaultPartnerId ? Number(defaultPartnerId) : null
    const allowPartner = category.payeeMode === 'PARTNER_ONLY' || category.payeeMode === 'EITHER'
    const normalizedPartnerIds = Array.isArray(partnerIds)
      ? partnerIds.map((id: number) => Number(id)).filter((id) => Number.isFinite(id))
      : []
    if (allowPartner && parsedDefaultPartnerId && !normalizedPartnerIds.includes(parsedDefaultPartnerId)) {
      normalizedPartnerIds.push(parsedDefaultPartnerId)
    }

    const item = await prisma.serviceItem.create({
      data: {
        name: String(name).trim(),
        tourItemCategoryId: category.id,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        defaultPartnerId: allowPartner ? parsedDefaultPartnerId : null,
        partnerLinks: {
          createMany: {
            data: allowPartner ? normalizedPartnerIds.map((id) => ({ partnerId: id })) : [],
          },
        },
        driverLinks: {
          createMany: {
            data: Array.isArray(driverIds)
              ? driverIds.map((id: number) => ({ driverId: id }))
              : [],
          },
        },
      },
      include: {
        partnerLinks: { include: { partner: true } },
        driverLinks: { include: { driver: true } },
        defaultPartner: true,
        tourItemCategoryRef: true,
      },
    })

    return NextResponse.json({
      success: true,
      item: {
        ...withFinanceCategoryAlias(item),
        partners: item.partnerLinks.map((link) => link.partner),
        drivers: item.driverLinks.map((link) => link.driver),
      },
    })
  } catch (error) {
    console.error('[API /service-items] Error creating service item:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
