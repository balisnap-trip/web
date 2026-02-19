import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const DIRECTION_OPTIONS = ['EXPENSE', 'INCOME']
const PAYEE_OPTIONS = ['DRIVER_ONLY', 'PARTNER_ONLY', 'EITHER', 'NONE']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === '1'
    const categories = await prisma.tourItemCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ categories })
  } catch (error) {
    console.error('[API /tour-item-categories] Error:', error)
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

    if (!code || !name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 })
    }

    const normalizedCode = String(code).trim().toUpperCase()

    const normalizedDirection = defaultDirection ? String(defaultDirection).trim().toUpperCase() : 'EXPENSE'
    if (!DIRECTION_OPTIONS.includes(normalizedDirection)) {
      return NextResponse.json({ error: 'Invalid default direction' }, { status: 400 })
    }

    const normalizedPayee = payeeMode ? String(payeeMode).trim().toUpperCase() : 'PARTNER_ONLY'
    if (!PAYEE_OPTIONS.includes(normalizedPayee)) {
      return NextResponse.json({ error: 'Invalid payee mode' }, { status: 400 })
    }

    const category = await prisma.tourItemCategory.create({
      data: {
        code: normalizedCode,
        name: String(name).trim(),
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        defaultDirection: normalizedDirection as any,
        payeeMode: normalizedPayee as any,
        autoDriverFromBooking: Boolean(autoDriverFromBooking),
        isCommission: Boolean(isCommission),
        allowRelatedItem: Boolean(allowRelatedItem),
        requirePartner: Boolean(requirePartner),
      },
    })

    return NextResponse.json({ success: true, category })
  } catch (error) {
    console.error('[API /tour-item-categories] Error creating category:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
