import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const withFinanceCategoryAlias = <
  T extends { tourItemCategoryId?: number | null; tourItemCategoryRef?: unknown | null }
>(
  partner: T
) => ({
  ...partner,
  financeCategoryId: partner.tourItemCategoryId ?? null,
  financeCategoryRef: partner.tourItemCategoryRef ?? null,
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const partners = await prisma.partner.findMany({
      orderBy: { name: 'asc' },
      include: { tourItemCategoryRef: true },
    })

    return NextResponse.json({
      partners: partners.map((partner) => withFinanceCategoryAlias(partner)),
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
    const body = await req.json()
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

    return NextResponse.json({ success: true, partner: withFinanceCategoryAlias(partner) })
  } catch (error) {
    console.error('[API /partners] Error creating partner:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
