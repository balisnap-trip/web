'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleTabs } from '@/components/layout/module-tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import {
  Search,
  Filter,
  Calendar,
  User,
  Users,
  MapPin,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  Car,
  Package,
  RefreshCw
} from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { formatDate, getDaysUntil, isUpcoming, isPast } from '@/lib/date-format'
import { useNotifications } from '@/hooks/use-notifications'

interface Booking {
  id: number
  bookingRef: string | null
  mainContactName: string
  mainContactEmail: string
  phoneNumber: string
  tourDate: Date
  totalPrice: number
  currency: string
  numberOfAdult: number
  numberOfChild: number | null
  source: string
  status: string
  assignedDriverId: number | null
  meetingPoint: string
  createdAt: Date
  package: {
    packageName: string
  } | null
  driver: {
    name: string
  } | null
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-800',
  READY: 'bg-blue-100 text-blue-800',
  ATTENTION: 'bg-amber-100 text-amber-800',
  UPDATED: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-green-100 text-green-800',
  DONE: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
}

const SOURCE_COLORS: Record<string, string> = {
  GYG: 'bg-indigo-100 text-indigo-800',
  VIATOR: 'bg-green-100 text-green-800',
  TRIPDOTCOM: 'bg-amber-100 text-amber-800',
  BOKUN: 'bg-purple-100 text-purple-800',
  DIRECT: 'bg-cyan-100 text-cyan-800',
  MANUAL: 'bg-gray-100 text-gray-800',
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [sourceFilter, setSourceFilter] = useState<string>('ALL')
  const [fetching, setFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState<{ percentage: number; status: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'DONE'>('ACTIVE')
  const [reprocessingBookings, setReprocessingBookings] = useState(false)
  const [showReprocessBookingsModal, setShowReprocessBookingsModal] = useState(false)
  const { notify } = useNotifications()
  const getDoneCount = () => {
    const doneStatuses = ['DONE', 'NO_SHOW', 'CANCELLED']
    return bookings.filter(b => doneStatuses.includes(b.status) && isPast(b.tourDate)).length
  }
  const getActiveCount = () => bookings.length - getDoneCount()
  const getUnassignedCount = () =>
    bookings.filter(b => !b.assignedDriverId && ['NEW', 'UPDATED', 'ATTENTION'].includes(b.status)).length
  const getUpcomingCount = () =>
    bookings.filter(b => isUpcoming(b.tourDate)).length

  const cleanGuestName = (name: string) => {
    const trimmed = name.trim()
    const cleaned = trimmed.replace(/\s+(costumer|customer)\.?$/i, '').trim()
    if (!cleaned || /^(costumer|customer)\.?$/i.test(trimmed)) {
      return 'Guest'
    }
    return cleaned
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  useEffect(() => {
    filterBookings()
  }, [searchTerm, statusFilter, sourceFilter, bookings, activeTab])

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/bookings')
      const data = await res.json()

      if (data.bookings) {
        setBookings(data.bookings)
        setFilteredBookings(data.bookings)
      } else {
        notify({ type: 'error', title: 'Load Bookings Failed', message: data.error || 'Unable to load bookings.' })
      }
    } catch (error) {
      console.error('Error fetching bookings:', error)
      notify({ type: 'error', title: 'Load Bookings Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const handleFetchBookings = async () => {
    setFetching(true)
    setFetchProgress({ percentage: 0, status: 'Starting...' })

    try {
      const response = await fetch('/api/bookings/fetch', { method: 'POST' })

      if (!response.ok) {
        throw new Error('Failed to start fetch')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let finalResults: any = null
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n')
          let event = 'message'
          let dataPayload = ''

          for (const line of lines) {
            if (line.startsWith('event:')) {
              event = line.replace('event:', '').trim()
            }
            if (line.startsWith('data:')) {
              dataPayload += line.replace('data:', '').trim()
            }
          }

          if (!dataPayload) continue
          const data = JSON.parse(dataPayload)

          if (event === 'progress') {
            setFetchProgress({ percentage: data.percentage, status: data.status })
          } else if (event === 'complete') {
            finalResults = data.results
            setFetchProgress({ percentage: 100, status: 'Fetch complete!' })
          } else if (event === 'error') {
            notify({ type: 'error', title: 'Booking Fetch Error', message: data.error })
          }
        }
      }

      if (finalResults) {
        setTimeout(() => {
          notify({
            type: 'success',
            title: 'Booking Fetch Complete',
            message: `Processed: ${finalResults.processed}\nCreated: ${finalResults.created}\nUpdated: ${finalResults.updated}\nCancelled: ${finalResults.cancelled}\nIgnored: ${finalResults.ignored}\nFailed: ${finalResults.failed}`,
          })
          fetchBookings() // Refresh data
          setFetchProgress(null)
        }, 1000)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      const message = String(error)
      if (message.toLowerCase().includes('network') || message.toLowerCase().includes('failed to fetch')) {
        notify({
          type: 'warning',
          title: 'Booking Fetch Connection Lost',
          message: 'Fetch may still be running in the background. Please wait a moment and refresh the bookings.',
        })
      } else {
        notify({ type: 'error', title: 'Booking Fetch Error', message })
      }
      setFetchProgress(null)
    } finally {
      setFetching(false)
    }
  }

  const handleReprocessBookings = async () => {
    setReprocessingBookings(true)
    try {
      const res = await fetch('/api/settings/reprocess-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reprocess bookings')
      }

      notify({
        type: 'success',
        title: 'Bookings Reprocessed',
        message: `Processed ${data.processed || 0} bookings. Updated ${data.updated || 0}.`,
      })
      fetchBookings()
    } catch (error) {
      notify({
        type: 'error',
        title: 'Reprocess Bookings Failed',
        message: error instanceof Error ? error.message : 'Failed to reprocess bookings',
      })
    } finally {
      setReprocessingBookings(false)
    }
  }

  const filterBookings = () => {
    let filtered = bookings
    const isDoneBooking = (booking: Booking) => {
      const doneStatuses = ['DONE', 'NO_SHOW', 'CANCELLED']
      return doneStatuses.includes(booking.status) && isPast(booking.tourDate)
    }

    if (activeTab === 'ACTIVE') {
      filtered = filtered.filter(booking => !isDoneBooking(booking))
    } else {
      filtered = filtered.filter(booking => isDoneBooking(booking))
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(booking =>
        booking.mainContactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.bookingRef?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        booking.mainContactEmail.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(booking => booking.status === statusFilter)
    }

    // Source filter
    if (sourceFilter !== 'ALL') {
      filtered = filtered.filter(booking => booking.source === sourceFilter)
    }

    setFilteredBookings(filtered)
  }


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'NEW': return <Clock className="h-4 w-4" />
      case 'READY': return <Clock className="h-4 w-4" />
      case 'ATTENTION': return <AlertCircle className="h-4 w-4" />
      case 'UPDATED': return <RefreshCw className="h-4 w-4" />
      case 'COMPLETED': return <CheckCircle className="h-4 w-4" />
      case 'DONE': return <CheckCircle className="h-4 w-4" />
      case 'CANCELLED': return <XCircle className="h-4 w-4" />
      case 'NO_SHOW': return <AlertCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Loading bookings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="bookings" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-gray-600">
            Manage tour bookings and driver assignments
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleFetchBookings}
            disabled={fetching}
            variant="outline"
            size="default"
          >
            {fetching ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Fetching...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Fetch Booking</>
            )}
          </Button>
          <Button
            onClick={() => setShowReprocessBookingsModal(true)}
            disabled={reprocessingBookings}
            variant="outline"
            size="default"
          >
            {reprocessingBookings ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Reprocessing...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Reprocess</>
            )}
          </Button>
          <Link href="/bookings/new">
            <Button size="default" className="shadow-lg">
              <Calendar className="h-4 w-4" />
              New Booking
            </Button>
          </Link>
        </div>
      </div>

      {/* Fetch Progress */}
      {fetching && fetchProgress && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="font-semibold text-blue-900">
                  Fetching Bookings - {fetchProgress.percentage}%
                </span>
              </div>
            </div>
            <Progress value={fetchProgress.percentage} className="h-3" />
            <p className="text-sm text-blue-700">{fetchProgress.status}</p>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-gray-400">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{bookings.length}</div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <Package className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ready</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {bookings.filter(b => b.status === 'READY').length}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Unassigned</div>
              <div className="text-2xl font-bold text-yellow-600 mt-1">
                {getUnassignedCount()}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Completed</div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {bookings.filter(b => b.status === 'COMPLETED').length}
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              variant={activeTab === 'ACTIVE' ? 'default' : 'secondary'}
              className="font-semibold"
            >
              <span className="flex items-center gap-2">
                Booking
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {getActiveCount()}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              onClick={() => setActiveTab('DONE')}
              variant={activeTab === 'DONE' ? 'default' : 'secondary'}
              className="font-semibold"
            >
              <span className="flex items-center gap-2">
                Done
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'DONE' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                  {getDoneCount()}
                </span>
              </span>
            </Button>
          </div>
          <div className="text-xs text-gray-500">
            {activeTab === 'ACTIVE'
              ? 'Active bookings (excluding done/no-show/cancelled in the past)'
              : 'Done / No-show / Cancelled that already passed'}
          </div>
        </div>
      </Card>

      <Card className="p-4 hover:shadow-md transition-shadow duration-200">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, ref, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4"
          >
            <option value="ALL">All Status</option>
            <option value="NEW">New</option>
            <option value="READY">Ready</option>
            <option value="ATTENTION">Attention</option>
            <option value="UPDATED">Updated</option>
            <option value="COMPLETED">Completed</option>
            <option value="DONE">Done</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No Show</option>
          </Select>

          {/* Source Filter */}
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-4"
          >
            <option value="ALL">All Sources</option>
            <option value="GYG">GetYourGuide</option>
            <option value="VIATOR">Viator</option>
            <option value="TRIPDOTCOM">Trip.com</option>
            <option value="BOKUN">Bokun</option>
            <option value="DIRECT">Direct</option>
            <option value="MANUAL">Manual</option>
          </Select>
        </div>
      </Card>

      {/* Bookings Table */}
      <Card className="hover:shadow-lg transition-shadow duration-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  View
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Booking
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Tour Date
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Pax
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Driver
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
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        {searchTerm || statusFilter !== 'ALL' || sourceFilter !== 'ALL' ? (
                          <Filter className="h-6 w-6 text-gray-400" />
                        ) : (
                          <Calendar className="h-6 w-6 text-gray-400" />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {searchTerm || statusFilter !== 'ALL' || sourceFilter !== 'ALL'
                          ? 'No bookings match your filters'
                          : 'No bookings yet'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {searchTerm || statusFilter !== 'ALL' || sourceFilter !== 'ALL'
                          ? 'Try adjusting your search criteria'
                          : 'Process some emails to see bookings here!'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-blue-50/30 transition-colors duration-150">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Link href={`/bookings/${booking.id}`}>
                        <Button variant="outline" size="sm" className="hover:bg-blue-50">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {booking.bookingRef || `#${booking.id}`}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[150px]">
                        {booking.package?.packageName || 'Custom Tour'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 flex-shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {cleanGuestName(booking.mainContactName)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {booking.mainContactEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatDate(booking.tourDate)}
                          </div>
                          {isUpcoming(booking.tourDate) && (
                            <div className="text-xs text-amber-600 font-semibold">
                              {getDaysUntil(booking.tourDate)} days
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-900">
                        <Users className="h-4 w-4 text-gray-400" />
                        {booking.numberOfAdult}A
                        {booking.numberOfChild ? ` + ${booking.numberOfChild}C` : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm font-semibold text-gray-900">
                        <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                        {formatCurrency(booking.totalPrice, booking.currency)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {booking.driver ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-900">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
                            <Car className="h-4 w-4 text-green-600" />
                          </div>
                          <span className="font-medium">{booking.driver.name}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800">
                          <AlertCircle className="h-3 w-3" />
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${SOURCE_COLORS[booking.source] || 'bg-gray-100 text-gray-800'}`}>
                        {booking.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full ${STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-800'}`}>
                        {getStatusIcon(booking.status)}
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

      <Dialog
        open={showReprocessBookingsModal}
        onOpenChange={setShowReprocessBookingsModal}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reprocess Bookings</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reprocess will re-parse bookings from related emails and apply the latest parser fixes.
            It does not delete data, but it can update fields like pax, date, time, and customer details.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReprocessBookingsModal(false)}
              className="flex-1"
              disabled={reprocessingBookings}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleReprocessBookings()
                setShowReprocessBookingsModal(false)
              }}
              className="flex-1"
              disabled={reprocessingBookings}
            >
              {reprocessingBookings ? 'Reprocessing...' : 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
