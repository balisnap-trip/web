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
    const { tourName, slug, description, isActive } = body

    const tour = await prisma.tour.update({
      where: { id: parseInt(id) },
      data: {
        tourName: tourName !== undefined ? String(tourName).trim() : undefined,
        slug: slug !== undefined ? String(slug).trim() : undefined,
        description: description !== undefined ? (description ? String(description).trim() : null) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    })

    return NextResponse.json({ success: true, tour })
  } catch (error) {
    console.error('[API /tours/[id]] Error updating tour:', error)
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
    await prisma.tour.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /tours/[id]] Error deleting tour:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete tour' },
      { status: 500 }
    )
  }
}
