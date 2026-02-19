import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const pattern = await prisma.tourCostPattern.findUnique({
      where: { id: parseInt(id) },
      include: {
        package: { include: { tour: true } },
        items: { include: { serviceItem: true, defaultPartner: true }, orderBy: { position: 'asc' } },
      },
    })

    if (!pattern) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({
      pattern: {
        ...pattern,
        items: pattern.items.map((item) => ({
          ...item,
          defaultPrice: Number(item.defaultPrice),
        })),
      },
    })
  } catch (error) {
    console.error('[API /finance/patterns/[id]] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

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
    const { name, packageId, isActive, items } = body
    const patternId = parseInt(id)

    const parsedPackageId =
      packageId !== undefined && packageId !== null && String(packageId).trim() !== ''
        ? Number(packageId)
        : undefined

    if (Number.isNaN(patternId)) {
      return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 })
    }
    if (parsedPackageId !== undefined && !Number.isFinite(parsedPackageId)) {
      return NextResponse.json({ error: 'Invalid package id' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items are required' }, { status: 400 })
    }

    const hasInvalidService = items.some((item: any) => !Number.isFinite(Number(item.serviceItemId)))
    if (hasInvalidService) {
      return NextResponse.json({ error: 'Invalid service item' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.tourCostPattern.update({
        where: { id: patternId },
        data: {
          name: name !== undefined ? String(name).trim() : undefined,
          packageId: parsedPackageId,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        },
      }),
      prisma.tourCostPatternItem.deleteMany({ where: { patternId } }),
      prisma.tourCostPatternItem.createMany({
        data: items.map((item: any, index: number) => ({
          patternId,
          serviceItemId: Number(item.serviceItemId),
          defaultPartnerId: item.defaultPartnerId ? parseInt(item.defaultPartnerId) : null,
          defaultUnitType: item.defaultUnitType,
          defaultQty: Number.isFinite(Number(item.defaultQty)) ? Number(item.defaultQty) : 1,
          defaultPrice: Number.isFinite(Number(item.defaultPrice)) ? Number(item.defaultPrice) : 0,
          position: item.position ?? index,
        })),
      }),
    ])

    const updated = await prisma.tourCostPattern.findUnique({
      where: { id: patternId },
      include: {
        package: { include: { tour: true } },
        items: { include: { serviceItem: true, defaultPartner: true }, orderBy: { position: 'asc' } },
      },
    })

    return NextResponse.json({
      success: true,
      pattern: updated
        ? {
            ...updated,
            items: updated.items.map((item) => ({
              ...item,
              defaultPrice: Number(item.defaultPrice),
            })),
          }
        : null,
    })
  } catch (error) {
    console.error('[API /finance/patterns/[id]] Error updating pattern:', error)
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
    await prisma.tourCostPattern.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /finance/patterns/[id]] Error deleting pattern:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete pattern' },
      { status: 500 }
    )
  }
}
