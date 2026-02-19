import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    const pkg = await prisma.tourPackage.update({
      where: { id: parseInt(id) },
      data: {
        packageName: packageName !== undefined ? String(packageName).trim() : undefined,
        slug: slug !== undefined ? String(slug).trim() : undefined,
        tourId: tourId !== undefined ? (tourId ? parseInt(tourId) : null) : undefined,
        pricePerPerson:
          pricePerPerson !== undefined
            ? pricePerPerson === null || String(pricePerPerson).length === 0
              ? null
              : Number(pricePerPerson)
            : undefined,
        pricePerChild:
          pricePerChild !== undefined
            ? pricePerChild === null || String(pricePerChild).length === 0
              ? null
              : Number(pricePerChild)
            : undefined,
        baseCurrency: baseCurrency !== undefined ? String(baseCurrency).trim() : undefined,
        minBooking: minBooking !== undefined ? (minBooking !== null ? Number(minBooking) : null) : undefined,
        maxBooking: maxBooking !== undefined ? (maxBooking !== null ? Number(maxBooking) : null) : undefined,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : undefined,
      },
      include: { tour: true },
    })

    return NextResponse.json({ success: true, package: pkg })
  } catch (error) {
    console.error('[API /tour-packages/[id]] Error updating package:', error)
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
    await prisma.tourPackage.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /tour-packages/[id]] Error deleting package:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete package' },
      { status: 500 }
    )
  }
}
