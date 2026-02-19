import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const packages = await prisma.tourPackage.findMany({
      orderBy: { packageName: 'asc' },
      include: { tour: true },
    })

    return NextResponse.json({ packages })
  } catch (error) {
    console.error('[API /tour-packages] Error:', error)
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
      packageName,
      slug,
      tourId,
      pricePerPerson,
      pricePerChild,
      baseCurrency,
      minBooking,
      maxBooking,
      isFeatured,
    } = body

    if (!packageName || String(packageName).trim().length === 0) {
      return NextResponse.json({ error: 'Package name is required' }, { status: 400 })
    }
    if (!slug || String(slug).trim().length === 0) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }
    if (!tourId) {
      return NextResponse.json({ error: 'Tour is required' }, { status: 400 })
    }
    const pkg = await prisma.tourPackage.create({
      data: {
        packageName: String(packageName).trim(),
        slug: String(slug).trim(),
        tourId: parseInt(tourId),
        pricePerPerson:
          pricePerPerson !== undefined && pricePerPerson !== null && String(pricePerPerson).length > 0
            ? Number(pricePerPerson)
            : null,
        pricePerChild:
          pricePerChild !== undefined && pricePerChild !== null && String(pricePerChild).length > 0
            ? Number(pricePerChild)
            : null,
        baseCurrency: baseCurrency ? String(baseCurrency).trim() : 'USD',
        minBooking: minBooking !== undefined && minBooking !== null ? Number(minBooking) : null,
        maxBooking: maxBooking !== undefined && maxBooking !== null ? Number(maxBooking) : null,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : false,
      },
      include: { tour: true },
    })

    return NextResponse.json({ success: true, package: pkg })
  } catch (error) {
    console.error('[API /tour-packages] Error creating package:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
