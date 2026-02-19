'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Users, 
  AlertCircle,
  CheckCircle,
  Clock,
  Package
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { useNotifications } from '@/hooks/use-notifications'

interface DashboardStats {
  totalBookings: number
  monthBookings: number
  todayTours: number
  pendingAssignments: number
  totalRevenue: number
  monthRevenue: number
}

interface SourceBreakdown {
  source: string
  count: number
}

interface BookingTrend {
  date: string
  count: number
}

interface RevenueTrend {
  date: string
  revenue: number
}

interface RecentBooking {
  id: number
  bookingRef: string | null
  mainContactName: string
  tourDate: Date
  totalPrice: number
  currency: string
  source: string
  status: string
  createdAt: Date
  tourName: string
}

interface CoreApiDashboardMetrics {
  api: {
    ok: boolean
    status: number
    data: {
      rates: {
        error5xxRate: number
      }
      latencyMs: {
        p95: number
      }
      totals: {
        requests: number
      }
    } | null
    error: string | null
  }
  ingestQueue: {
    ok: boolean
    status: number
    data: {
      queue: {
        waiting: number
      }
      deadLetter: {
        total: number
      }
    } | null
    error: string | null
  }
  ingestProcessing: {
    ok: boolean
    status: number
    data: {
      successRate: number
      latenciesMs: {
        p95: number
      }
    } | null
    error: string | null
  }
  reconciliation: {
    ok: boolean
    status: number
    data: {
      result: 'PASS' | 'FAIL'
      metrics: {
        globalMismatchRatio: number
        opsDoneNotPaidRatio: number
        paymentOrphanRows: number
        unmappedRatioPercent: number | null
      }
      domains: {
        booking: { mismatchRows: number }
        payment: { mismatchRows: number }
        ingest: { mismatchRows: number }
        catalog: { mismatchRows: number }
      }
    } | null
    error: string | null
  }
}

interface OpsCutoverState {
  generatedAt: string
  read: {
    baseEnabled: boolean
    percentage: number
    enabledForActor: boolean
  }
  write: {
    baseEnabled: boolean
    percentage: number
    enabledForActor: boolean
  }
  writeStrict: boolean
}

const SOURCE_COLORS: Record<string, string> = {
  GYG: '#4F46E5',
  VIATOR: '#10B981',
  TRIPDOTCOM: '#F59E0B',
  BOKUN: '#8B5CF6',
  DIRECT: '#06B6D4',
  MANUAL: '#6B7280',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdown[]>([])
  const [bookingsTrend, setBookingsTrend] = useState<BookingTrend[]>([])
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend[]>([])
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([])
  const [coreMetrics, setCoreMetrics] = useState<CoreApiDashboardMetrics | null>(null)
  const [cutoverState, setCutoverState] = useState<OpsCutoverState | null>(null)
  const [loading, setLoading] = useState(true)
  const { notify } = useNotifications()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [dashboardRes, coreMetricsRes, cutoverRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/observability/core-api?windowMinutes=15&processingWindowMinutes=60'),
        fetch('/api/ops/cutover-state'),
      ])
      const data = await dashboardRes.json()
      const coreData = await coreMetricsRes.json().catch(() => null)
      const cutoverData = await cutoverRes.json().catch(() => null)
      
      if (data.stats) {
        setStats(data.stats)
        setSourceBreakdown(data.sourceBreakdown || [])
        setBookingsTrend(data.bookingsTrend || [])
        setRevenueTrend(data.revenueTrend || [])
        setRecentBookings(data.recentBookings || [])
      } else {
        notify({ type: 'error', title: 'Load Dashboard Failed', message: data.error || 'Unable to load dashboard.' })
      }

      if (coreData?.coreApi) {
        setCoreMetrics(coreData.coreApi)
      } else {
        setCoreMetrics(null)
      }

      if (cutoverData?.cutover) {
        setCutoverState(cutoverData.cutover)
      } else {
        setCutoverState(null)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      notify({ type: 'error', title: 'Load Dashboard Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  const cutoverBadge = (() => {
    if (!cutoverState) {
      return null
    }

    if (cutoverState.write.enabledForActor) {
      return {
        label:
          cutoverState.write.percentage >= 100
            ? 'write-core full'
            : `write-core ${cutoverState.write.percentage}%`,
        className: 'bg-emerald-100 text-emerald-700',
      }
    }

    if (cutoverState.read.enabledForActor) {
      return {
        label:
          cutoverState.read.percentage >= 100
            ? 'read-core full'
            : `read-core ${cutoverState.read.percentage}%`,
        className: 'bg-blue-100 text-blue-700',
      }
    }

    return {
      label: 'legacy mode',
      className: 'bg-gray-100 text-gray-600',
    }
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-gray-600">
          Overview of your booking operations
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Bookings</div>
              <div className="text-2xl font-bold text-gray-900 mt-2">
                {stats?.totalBookings || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">All time records</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
              <Calendar className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Tours This Month</div>
              <div className="text-2xl font-bold text-gray-900 mt-2">
                {stats?.monthBookings || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">By tour date</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/30">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">New / Unassigned</div>
              <div className="text-2xl font-bold text-yellow-600 mt-2">
                {stats?.pendingAssignments || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">Awaiting driver</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 shadow-lg shadow-yellow-500/30">
              <AlertCircle className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Today Tours</div>
              <div className="text-2xl font-bold text-indigo-600 mt-2">
                {stats?.todayTours || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">Ready + attention + updated</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30">
              <Calendar className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Month Revenue</div>
              <div className="text-xl font-bold text-emerald-600 mt-2">
                {formatCurrency(stats?.monthRevenue || 0, 'USD')}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">USD (month)</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer border-l-4 border-l-teal-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Revenue</div>
              <div className="text-xl font-bold text-teal-600 mt-2">
                {formatCurrency(stats?.totalRevenue || 0, 'USD')}
              </div>
              <div className="text-xs text-gray-500 mt-1.5">USD equivalent</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg shadow-teal-500/30">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
        </Card>
      </div>

      {/* Core API Observability */}
      <Card className="p-4 hover:shadow-md transition-shadow duration-200 border-l-4 border-l-violet-500">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Core API Health</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">15m window</span>
            {cutoverBadge ? (
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${cutoverBadge.className}`}>
                {cutoverBadge.label}
              </span>
            ) : null}
          </div>
        </div>

        {coreMetrics ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">API 5xx Rate</div>
              <div className={`text-xl font-bold mt-1 ${
                (coreMetrics.api.data?.rates.error5xxRate || 0) > 0.015 ? 'text-red-600' : 'text-green-600'
              }`}>
                {((coreMetrics.api.data?.rates.error5xxRate || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                requests: {coreMetrics.api.data?.totals.requests || 0}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">API Latency p95</div>
              <div className="text-xl font-bold text-indigo-600 mt-1">
                {Math.round(coreMetrics.api.data?.latencyMs.p95 || 0)} ms
              </div>
              <div className="text-xs text-gray-500 mt-1">
                status: {coreMetrics.api.ok ? 'OK' : `ERR (${coreMetrics.api.status})`}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ingest Queue Waiting</div>
              <div className="text-xl font-bold text-amber-600 mt-1">
                {coreMetrics.ingestQueue.data?.queue.waiting || 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                DLQ: {coreMetrics.ingestQueue.data?.deadLetter.total || 0}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ingest Success Rate</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">
                {((coreMetrics.ingestProcessing.data?.successRate || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                p95: {Math.round(coreMetrics.ingestProcessing.data?.latenciesMs.p95 || 0)} ms
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Reconciliation</div>
              <div className={`text-xl font-bold mt-1 ${
                (coreMetrics.reconciliation.data?.metrics.globalMismatchRatio || 0) > 0.01
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}>
                {((coreMetrics.reconciliation.data?.metrics.globalMismatchRatio || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {coreMetrics.reconciliation.data?.result || (coreMetrics.reconciliation.ok ? 'OK' : `ERR (${coreMetrics.reconciliation.status})`)}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                orphan payment: {coreMetrics.reconciliation.data?.metrics.paymentOrphanRows || 0}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-gray-50 p-6 text-sm text-gray-600">
            Core API metrics belum tersedia.
          </div>
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Bookings Trend */}
        <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Bookings Trend
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Last 30 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={bookingsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const d = new Date(value)
                  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                }}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => formatDate(value)}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#4F46E5" 
                strokeWidth={2}
                name="Bookings"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Source Breakdown */}
        <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Bookings by Source
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Distribution</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sourceBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ source, count, percent }) => 
                  `${source}: ${count} (${(percent * 100).toFixed(0)}%)`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {sourceBreakdown.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={SOURCE_COLORS[entry.source] || '#6B7280'} 
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Revenue Trend */}
      {revenueTrend.length > 0 && (
        <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Revenue Trend
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">Last 30 Days - USD</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const d = new Date(value)
                  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                }}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => formatDate(value)}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
              />
              <Legend />
              <Bar 
                dataKey="revenue" 
                fill="#10B981" 
                name="Revenue (USD)"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Recent Bookings */}
      <Card className="hover:shadow-lg transition-shadow duration-200">
        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Tours</h2>
            <span className="text-xs text-gray-500">By tour date</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Booking Ref
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Tour
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <Calendar className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900">No bookings yet</p>
                      <p className="text-xs text-gray-500">Process some emails to see bookings here!</p>
                    </div>
                  </td>
                </tr>
              ) : (
                recentBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-blue-50/30 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {booking.bookingRef || `#${booking.id}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{booking.mainContactName}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-700 truncate max-w-xs">
                        {booking.tourName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                      {formatDate(booking.tourDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {formatCurrency(booking.totalPrice, booking.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span 
                        className="inline-flex px-2.5 py-1 text-xs font-bold rounded-full"
                        style={{
                          backgroundColor: `${SOURCE_COLORS[booking.source]}20`,
                          color: SOURCE_COLORS[booking.source],
                        }}
                      >
                        {booking.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full ${
                        booking.status === 'READY' ? 'bg-blue-100 text-blue-800' :
                        booking.status === 'ATTENTION' ? 'bg-amber-100 text-amber-800' :
                        booking.status === 'UPDATED' ? 'bg-indigo-100 text-indigo-800' :
                        booking.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        booking.status === 'DONE' ? 'bg-emerald-100 text-emerald-800' :
                        booking.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status === 'READY' && <Clock className="h-3 w-3" />}
                        {booking.status === 'ATTENTION' && <AlertCircle className="h-3 w-3" />}
                        {booking.status === 'COMPLETED' && <CheckCircle className="h-3 w-3" />}
                        {booking.status === 'DONE' && <CheckCircle className="h-3 w-3" />}
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
