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
    const tours = await prisma.tour.findMany({
      orderBy: { tourName: 'asc' },
    })

    return NextResponse.json({ tours })
  } catch (error) {
    console.error('[API /tours] Error:', error)
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
    const { tourName, slug, description, isActive } = body

    if (!tourName || String(tourName).trim().length === 0) {
      return NextResponse.json({ error: 'Tour name is required' }, { status: 400 })
    }
    if (!slug || String(slug).trim().length === 0) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 })
    }

    const tour = await prisma.tour.create({
      data: {
        tourName: String(tourName).trim(),
        slug: String(slug).trim(),
        description: description ? String(description).trim() : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    })

    return NextResponse.json({ success: true, tour })
  } catch (error) {
    console.error('[API /tours] Error creating tour:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
