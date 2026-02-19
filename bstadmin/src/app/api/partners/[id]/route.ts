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
      picName,
      picWhatsapp,
      notes,
      isActive,
    } = body

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
      where: { id: parseInt(id) },
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

    return NextResponse.json({ success: true, partner: withFinanceCategoryAlias(partner) })
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
    await prisma.partner.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /partners/[id]] Error deleting partner:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete partner' },
      { status: 500 }
    )
  }
}
