import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CategoryPayeeMode, FinanceDirection } from '@prisma/client'

const DIRECTION_OPTIONS = ['EXPENSE', 'INCOME']
const PAYEE_OPTIONS = ['DRIVER_ONLY', 'PARTNER_ONLY', 'EITHER', 'NONE']

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
      code,
      name,
      sortOrder,
      isActive,
      defaultDirection,
      payeeMode,
      autoDriverFromBooking,
      isCommission,
      allowRelatedItem,
      requirePartner,
    } = body

    const updateData: {
      code?: string
      name?: string
      sortOrder?: number | null
      isActive?: boolean
      defaultDirection?: FinanceDirection
      payeeMode?: CategoryPayeeMode
      autoDriverFromBooking?: boolean
      isCommission?: boolean
      allowRelatedItem?: boolean
      requirePartner?: boolean
    } = {}

    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase()
      updateData.code = normalizedCode
    }
    if (defaultDirection !== undefined) {
      const normalizedDirection = String(defaultDirection).trim().toUpperCase()
      if (!DIRECTION_OPTIONS.includes(normalizedDirection)) {
        return NextResponse.json({ error: 'Invalid default direction' }, { status: 400 })
      }
      updateData.defaultDirection = normalizedDirection as FinanceDirection
    }
    if (payeeMode !== undefined) {
      const normalizedPayee = String(payeeMode).trim().toUpperCase()
      if (!PAYEE_OPTIONS.includes(normalizedPayee)) {
        return NextResponse.json({ error: 'Invalid payee mode' }, { status: 400 })
      }
      updateData.payeeMode = normalizedPayee as CategoryPayeeMode
    }
    if (name !== undefined) updateData.name = String(name).trim()
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder === null || sortOrder === '' ? null : Number(sortOrder)
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (autoDriverFromBooking !== undefined) updateData.autoDriverFromBooking = Boolean(autoDriverFromBooking)
    if (isCommission !== undefined) updateData.isCommission = Boolean(isCommission)
    if (allowRelatedItem !== undefined) updateData.allowRelatedItem = Boolean(allowRelatedItem)
    if (requirePartner !== undefined) updateData.requirePartner = Boolean(requirePartner)

    const category = await prisma.tourItemCategory.update({
      where: { id: parseInt(id) },
      data: updateData,
    })

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('[API /tour-item-categories/[id]] Error updating category:', error)
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
    const categoryId = parseInt(id)

    const category = await prisma.tourItemCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('[API /tour-item-categories/[id]] Error deleting category:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete category' },
      { status: 500 }
    )
  }
}
