import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  loadPatternItemOffsetMap,
  normalizeOffsetMinutes,
  savePatternItemOffsetMap,
} from '@/lib/whatsapp/partner-offsets'

function withOffset<T extends { items: Array<{ id: number; defaultPrice: unknown }> }>(
  pattern: T,
  offsetMap: Record<string, number>
) {
  return {
    ...pattern,
    items: pattern.items.map((item) => ({
      ...item,
      defaultPrice: Number(item.defaultPrice),
      partnerTimeOffsetMinutes: offsetMap[String(item.id)] ?? 0,
    })),
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const packageIdParam = searchParams.get('packageId')
    const packageId = packageIdParam ? parseInt(packageIdParam) : null

    const patterns = await prisma.tourCostPattern.findMany({
      where: packageId ? { packageId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        package: { include: { tour: true } },
        items: { include: { serviceItem: true, defaultPartner: true }, orderBy: { position: 'asc' } },
      },
    })
    const offsetMap = await loadPatternItemOffsetMap()

    return NextResponse.json({
      patterns: patterns.map((pattern) => withOffset(pattern, offsetMap)),
    })
  } catch (error) {
    console.error('[API /finance/patterns] Error:', error)
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
    const { name, packageId, isActive, items } = body

    if (!name || !packageId) {
      return NextResponse.json({ error: 'Name and package are required' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items are required' }, { status: 400 })
    }

    const hasInvalidService = items.some((item: any) => !Number.isFinite(Number(item.serviceItemId)))
    if (hasInvalidService) {
      return NextResponse.json({ error: 'Invalid service item' }, { status: 400 })
    }

    const pattern = await prisma.tourCostPattern.create({
      data: {
        name: String(name).trim(),
        packageId: parseInt(packageId),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        items: {
          createMany: {
            data: items.map((item: any, index: number) => ({
              serviceItemId: Number(item.serviceItemId),
              defaultPartnerId: item.defaultPartnerId ? parseInt(item.defaultPartnerId) : null,
              defaultUnitType: item.defaultUnitType,
              defaultQty: Number.isFinite(Number(item.defaultQty)) ? Number(item.defaultQty) : 1,
              defaultPrice: Number.isFinite(Number(item.defaultPrice)) ? Number(item.defaultPrice) : 0,
              position: item.position ?? index,
            })),
          },
        },
      },
      include: {
        package: { include: { tour: true } },
        items: { include: { serviceItem: true, defaultPartner: true }, orderBy: { position: 'asc' } },
      },
    })
    const offsetMap = await loadPatternItemOffsetMap()
    const nextOffsetMap: Record<string, number> = { ...offsetMap }
    pattern.items.forEach((item, index) => {
      const input = items[index] as { partnerTimeOffsetMinutes?: unknown } | undefined
      const normalized = normalizeOffsetMinutes(input?.partnerTimeOffsetMinutes)
      if (normalized === null || normalized === 0) {
        delete nextOffsetMap[String(item.id)]
      } else {
        nextOffsetMap[String(item.id)] = normalized
      }
    })
    await savePatternItemOffsetMap(nextOffsetMap)

    return NextResponse.json({
      success: true,
      pattern: withOffset(pattern, nextOffsetMap),
    })
  } catch (error) {
    console.error('[API /finance/patterns] Error creating pattern:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
