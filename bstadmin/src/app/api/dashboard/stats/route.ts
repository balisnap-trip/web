import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BookingStatus } from '@prisma/client'

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  
  if (!session || session.user.role === 'CUSTOMER') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Date ranges
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const activeStatuses: BookingStatus[] = ['NEW', 'READY', 'ATTENTION', 'UPDATED', 'COMPLETED', 'DONE']
    const pendingAssignmentStatuses: BookingStatus[] = ['NEW', 'UPDATED', 'ATTENTION']

    // Total bookings
    const totalBookings = await prisma.booking.count()
    
    // This month bookings
    const monthBookings = await prisma.booking.count({
      where: {
        tourDate: { gte: startOfMonth, lte: endOfMonth },
        status: { in: activeStatuses },
      },
    })

    // Today's tours
    const todayTours = await prisma.booking.count({
      where: {
        tourDate: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: { in: activeStatuses },
      },
    })

    // Pending assignments
    const pendingAssignments = await prisma.booking.count({
      where: {
        assignedDriverId: null,
        status: { in: pendingAssignmentStatuses },
        tourDate: { gte: startOfDay },
      },
    })

    // Total revenue (all time, all currencies - we'll sum USD equivalent)
    const revenueByCurrency = await prisma.booking.groupBy({
      by: ['currency'],
      _sum: {
        totalPrice: true,
      },
      where: {
        isPaid: true,
        status: { in: activeStatuses },
      },
    })

    // Calculate total revenue in USD (simplified - in production you'd use exchange rates)
    let totalRevenue = 0
    revenueByCurrency.forEach((item) => {
      const amount = Number(item._sum?.totalPrice || 0)
      if (item.currency === 'USD') {
        totalRevenue += amount
      } else if (item.currency === 'IDR') {
        totalRevenue += amount / 15000 // Rough conversion
      } else if (item.currency === 'EUR') {
        totalRevenue += amount * 1.1 // Rough conversion
      } else {
        totalRevenue += amount // Assume USD equivalent
      }
    })

    // Month revenue
    const monthRevenue = await prisma.booking.aggregate({
      _sum: {
        totalPrice: true,
      },
      where: {
        tourDate: { gte: startOfMonth, lte: endOfMonth },
        isPaid: true,
        status: { in: activeStatuses },
        currency: 'USD', // Simplify for now
      },
    })

    // Source breakdown
    const sourceBreakdown = await prisma.booking.groupBy({
      by: ['source'],
      _count: {
        id: true,
      },
    })

    // Status breakdown
    const statusBreakdown = await prisma.booking.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    })

    // Recent bookings trend (last 30 days)
    const bookingsTrend = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT 
        DATE(tour_date) as date,
        COUNT(*)::int as count
      FROM bookings
      WHERE tour_date >= ${thirtyDaysAgo}
      GROUP BY DATE(tour_date)
      ORDER BY date ASC
    `

    // Revenue trend (last 30 days, USD only for simplicity)
    const revenueTrend = await prisma.$queryRaw<Array<{ date: Date; revenue: number }>>`
      SELECT 
        DATE(tour_date) as date,
        SUM(total_price)::float as revenue
      FROM bookings
      WHERE tour_date >= ${thirtyDaysAgo}
        AND currency = 'USD'
        AND is_paid = true
      GROUP BY DATE(tour_date)
      ORDER BY date ASC
    `

    // Recent activities (last 10 bookings)
    const recentBookings = await prisma.booking.findMany({
      take: 10,
      orderBy: { tourDate: 'desc' },
      where: {
        status: { in: activeStatuses },
      },
      include: {
        package: {
          select: {
            packageName: true,
          },
        },
      },
    })

    // Top customers
    const topCustomers = await prisma.user.findMany({
      take: 5,
      where: {
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: {
        bookings: {
          _count: 'desc',
        },
      },
    })

    return NextResponse.json({
      stats: {
        totalBookings,
        monthBookings,
        todayTours,
        pendingAssignments,
        totalRevenue,
        monthRevenue: Number(monthRevenue._sum?.totalPrice || 0),
      },
      sourceBreakdown: sourceBreakdown.map((item) => ({
        source: item.source,
        count: item._count.id,
      })),
      statusBreakdown: statusBreakdown.map((item) => ({
        status: item.status,
        count: item._count.id,
      })),
      bookingsTrend: bookingsTrend.map((item) => ({
        date: item.date.toISOString().split('T')[0],
        count: Number(item.count),
      })),
      revenueTrend: revenueTrend.map((item) => ({
        date: item.date.toISOString().split('T')[0],
        revenue: Number(item.revenue),
      })),
      recentBookings: recentBookings.map((booking) => ({
        ...booking,
        totalPrice: Number(booking.totalPrice),
        tourName: booking.package?.packageName || 'Custom Tour',
      })),
      topCustomers: topCustomers.map((customer) => ({
        ...customer,
        bookingCount: customer._count.bookings,
      })),
    })
  } catch (error) {
    console.error('[API /dashboard/stats] Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
