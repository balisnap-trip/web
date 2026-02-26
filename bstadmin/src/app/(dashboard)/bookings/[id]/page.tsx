'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { SourceBadge } from '@/components/ui/source-badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  User,
  Calendar,
  MapPin,
  Phone,
  Mail,
  DollarSign,
  Users,
  Car,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Edit,
  Trash2,
  AlertCircle,
  Wallet,
  Shapes,
  Package,
} from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { formatDate, formatDateFull, formatDateTime } from '@/lib/date-format'
import { useNotifications } from '@/hooks/use-notifications'

interface BookingDetails {
  id: number
  bookingRef: string | null
  bookingDate: Date
  tourName: string
  tourDate: Date
  totalPrice: number
  currency: string
  numberOfAdult: number
  numberOfChild: number | null
  status: string
  source: string
  mainContactName: string
  mainContactEmail: string
  phoneNumber: string
  pickupLocation: string
  meetingPoint: string
  note: string | null
  isPaid: boolean
  paidAt: Date | null
  assignedDriverId: number | null
  assignedAt: Date | null
  createdAt: Date
  otaReceivedAt?: Date | string | null
  package: {
    id: number
    packageName: string
    pricePerPerson: number | null
    baseCurrency: string
    tour?: {
      tourName: string
    } | null
  } | null
  driver: {
    id: number
    name: string
    phone: string
    vehicleType: string
    vehiclePlate: string | null
  } | null
  user: {
    name: string | null
    email: string | null
  }
}

interface Driver {
  id: number
  name: string
  phone: string
  vehicleType: string
  status: string
  assignmentCount?: number
  priorityLevel?: number
}

interface DriverSuggestion {
  primary: Driver | null
  reason: 'rotation' | 'none'
  alternatives: Driver[]
}

interface ReparseEmail {
  id: string
  subject: string
  from: string
  receivedAt: string
  bookingLinked: boolean
  errorMessage: string | null
}

interface CostPattern {
  id: number
  name: string
  isActive: boolean
}

interface BookingFinance {
  id: number
  patternId: number | null
  isLocked: boolean
  validatedAt: Date | null
  items: {
    amount: number
  }[]
}

interface PackageOption {
  id: number
  packageName: string
  tour?: { tourName: string } | null
}

type WhatsAppSendType =
  | 'BOOKING_GROUP'
  | 'BOOKING_GUEST'
  | 'READY_DRIVER'
  | 'READY_PARTNERS'
  | 'READY_GUEST'
  | 'ATTENTION_GUEST'
  | 'ATTENTION_DRIVER'
  | 'DONE_PAID_INVOICE'

interface WhatsAppMessageDraft {
  id: string
  target: string
  phone: string | null
  message: string
  canSend: boolean
  error?: string | null
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [booking, setBooking] = useState<BookingDetails | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [suggestedDrivers, setSuggestedDrivers] = useState<DriverSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [sendingWaType, setSendingWaType] = useState<WhatsAppSendType | null>(null)
  const [showWaPreviewModal, setShowWaPreviewModal] = useState(false)
  const [waPreviewType, setWaPreviewType] = useState<WhatsAppSendType | null>(null)
  const [waDrafts, setWaDrafts] = useState<WhatsAppMessageDraft[]>([])
  const [waEditEnabled, setWaEditEnabled] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [showConfirmDriverModal, setShowConfirmDriverModal] = useState(false)
  const [pendingDriverId, setPendingDriverId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showReparseModal, setShowReparseModal] = useState(false)
  const [reparseLoading, setReparseLoading] = useState(false)
  const [reparseEmails, setReparseEmails] = useState<ReparseEmail[]>([])
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([])
  const [reparsing, setReparsing] = useState(false)
  const [patterns, setPatterns] = useState<CostPattern[]>([])
  const [patternsLoading, setPatternsLoading] = useState(false)
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [finance, setFinance] = useState<BookingFinance | null>(null)
  const [showPatternModal, setShowPatternModal] = useState(false)
  const [selectedPatternId, setSelectedPatternId] = useState<number | null>(null)
  const [assigningPattern, setAssigningPattern] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null)
  const [assigningPackage, setAssigningPackage] = useState(false)
  const [showSetupFinanceModal, setShowSetupFinanceModal] = useState(false)
  const [setupFinanceSaving, setSetupFinanceSaving] = useState(false)
  const [showUnassignConfirmModal, setShowUnassignConfirmModal] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const { notify } = useNotifications()

  useEffect(() => {
    fetchBookingDetails()
    fetchDrivers()
    fetchSuggestedDrivers()
    fetchPackages()
  }, [resolvedParams.id])

  useEffect(() => {
    if (booking?.package?.id) {
      fetchPatterns(booking.package.id)
    }
    if (booking?.id) {
      fetchFinance(booking.id)
    }
  }, [booking?.id, booking?.package?.id])

  const fetchBookingDetails = async () => {
    try {
      const res = await fetch(`/api/bookings/${resolvedParams.id}`)
      const data = await res.json()
      
      if (data.booking) {
        setBooking(data.booking)
      }
    } catch (error) {
      console.error('Error fetching booking:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDrivers = async () => {
    try {
      const res = await fetch('/api/drivers')
      const data = await res.json()
      
      if (data.drivers) {
        setDrivers(data.drivers.filter((d: Driver) => d.status === 'AVAILABLE'))
      }
    } catch (error) {
      console.error('Error fetching drivers:', error)
    }
  }

  const fetchSuggestedDrivers = async () => {
    try {
      const res = await fetch(`/api/bookings/${resolvedParams.id}/suggest-driver`)
      const data = await res.json()
      
      if (data.suggestion) {
        setSuggestedDrivers(data.suggestion)
      }
    } catch (error) {
      console.error('Error fetching driver suggestions:', error)
    }
  }

  const fetchPackages = async () => {
    try {
      const res = await fetch('/api/tour-packages')
      const data = await res.json()
      if (data.packages) {
        setPackages(data.packages)
      }
    } catch (error) {
      console.error('Error fetching packages:', error)
    }
  }

  const fetchPatterns = async (packageId: number) => {
    try {
      setPatternsLoading(true)
      const res = await fetch(`/api/finance/patterns?packageId=${packageId}`)
      const data = await res.json()
      if (data.patterns) {
        setPatterns(data.patterns)
      }
    } catch (error) {
      console.error('Error fetching patterns:', error)
    } finally {
      setPatternsLoading(false)
    }
  }

  const fetchFinance = async (bookingId: number) => {
    try {
      const res = await fetch(`/api/finance/booking/${bookingId}`)
      const data = await res.json()
      if (data.booking?.finance) {
        setFinance({
          ...data.booking.finance,
          items: data.booking.finance.items.map((item: any) => ({
            amount: Number(item.amount),
          })),
        })
      } else {
        setFinance(null)
      }
    } catch (error) {
      console.error('Error fetching finance:', error)
    }
  }

  const handleAssignDriver = async (driverId?: number | null | unknown) => {
    const idToAssign = (typeof driverId === 'number' ? driverId : null) ?? selectedDriverId

    if (!idToAssign) {
      notify({ type: 'warning', title: 'Select Driver', message: 'Please select a driver first.' })
      return
    }

    setAssigning(true)
    try {
      const res = await fetch(`/api/bookings/${resolvedParams.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: idToAssign }),
      })

      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Driver Assigned' })
        setShowConfirmDriverModal(false)
        setPendingDriverId(null)
        setShowAssignModal(false)
        setSelectedDriverId(null)
        fetchBookingDetails() // Refresh
        fetchSuggestedDrivers() // Refresh suggestions
      } else {
        notify({ type: 'error', title: 'Assign Driver Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Assign Driver Error', message: String(error) })
    } finally {
      setAssigning(false)
    }
  }

  const handleConfirmAssignDriver = (driverId: number) => {
    setPendingDriverId(driverId)
    setShowConfirmDriverModal(true)
  }

  const handleAssignPattern = async () => {
    if (!booking || !selectedPatternId) {
      notify({ type: 'warning', title: 'Select Template', message: 'Please select a cost template first.' })
      return
    }

    setAssigningPattern(true)
    try {
      const res = await fetch('/api/finance/assign-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, patternId: selectedPatternId }),
      })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Template Assigned' })
        setShowPatternModal(false)
        setSelectedPatternId(null)
        fetchFinance(booking.id)
        fetchBookingDetails()
      } else {
        notify({ type: 'error', title: 'Assign Template Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Assign Template Error', message: String(error) })
    } finally {
      setAssigningPattern(false)
    }
  }

  const handleAssignPackage = async () => {
    if (!booking || !selectedPackageId) {
      notify({ type: 'warning', title: 'Select Package', message: 'Please select a package first.' })
      return
    }

    setAssigningPackage(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selectedPackageId }),
      })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Package Assigned' })
        setShowPackageModal(false)
        setSelectedPackageId(null)
        fetchBookingDetails()
      } else {
        notify({ type: 'error', title: 'Assign Package Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Assign Package Error', message: String(error) })
    } finally {
      setAssigningPackage(false)
    }
  }

  const openSetupFinanceModal = () => {
    if (!booking) return

    const currentPackageId = booking.package?.id ?? null
    const currentPatternId = finance?.patternId ?? null

    setSelectedPackageId(currentPackageId)
    setSelectedPatternId(currentPatternId)

    if (currentPackageId) {
      fetchPatterns(currentPackageId)
    } else {
      setPatterns([])
    }

    setShowSetupFinanceModal(true)
  }

  const handleSaveSetupFinance = async () => {
    if (!booking) return
    if (!selectedPackageId) {
      notify({ type: 'warning', title: 'Select Package', message: 'Please select a package first.' })
      return
    }

    setSetupFinanceSaving(true)
    try {
      // 1) Ensure booking has the selected package.
      if (booking.package?.id !== selectedPackageId) {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId: selectedPackageId }),
        })
        const data = await res.json()
        if (!data.success) {
          notify({ type: 'error', title: 'Assign Package Failed', message: data.error })
          return
        }
      }

      // 2) Assign cost template (optional but recommended).
      if (selectedPatternId) {
        const res = await fetch('/api/finance/assign-pattern', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id, patternId: selectedPatternId }),
        })
        const data = await res.json()
        if (!data.success) {
          notify({ type: 'error', title: 'Assign Template Failed', message: data.error })
          return
        }
      }

      notify({ type: 'success', title: 'Finance Updated' })
      setShowSetupFinanceModal(false)
      fetchBookingDetails()
      fetchFinance(booking.id)
      fetchSuggestedDrivers()
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSetupFinanceSaving(false)
    }
  }

  const handleUnassignDriver = async () => {
    try {
      const res = await fetch(`/api/bookings/${resolvedParams.id}/assign`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Driver Unassigned' })
        setShowUnassignConfirmModal(false)
        fetchBookingDetails()
      } else {
        notify({ type: 'error', title: 'Unassign Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Unassign Error', message: String(error) })
    }
  }

  const closeWaPreviewModal = () => {
    if (waSending) return
    setShowWaPreviewModal(false)
    setWaPreviewType(null)
    setWaDrafts([])
    setWaEditEnabled(false)
  }

  const handleOpenWhatsAppPreview = async (type: WhatsAppSendType) => {
    if (!booking?.id) return

    setSendingWaType(type)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, mode: 'preview' }),
      })
      const data = await res.json()

      if (!res.ok) {
        notify({ type: 'error', title: 'Preview WhatsApp Failed', message: data.error || 'Failed to load message preview.' })
        return
      }

      const rawDrafts: unknown[] = Array.isArray(data?.drafts) ? data.drafts : []
      const drafts: WhatsAppMessageDraft[] = rawDrafts.map((raw, index) => {
        const draft = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        return {
          id: typeof draft.id === 'string' ? draft.id : `draft-${index}`,
          target: typeof draft.target === 'string' ? draft.target : 'TARGET',
          phone: typeof draft.phone === 'string' ? draft.phone : null,
          message: typeof draft.message === 'string' ? draft.message : '',
          canSend: Boolean(draft.canSend),
          error: typeof draft.error === 'string' ? draft.error : null,
        }
      })

      if (drafts.length === 0) {
        notify({ type: 'warning', title: 'No Message', message: 'Tidak ada pesan yang bisa dikirim untuk aksi ini.' })
        return
      }

      setWaPreviewType(type)
      setWaDrafts(drafts)
      setWaEditEnabled(false)
      setShowWaPreviewModal(true)
    } catch (error) {
      notify({ type: 'error', title: 'Preview WhatsApp Error', message: String(error) })
    } finally {
      setSendingWaType(null)
    }
  }

  const handleWaDraftMessageChange = (id: string, message: string) => {
    setWaDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, message } : draft))
    )
  }

  const handleSendWhatsAppFromModal = async () => {
    if (!booking?.id || !waPreviewType) return

    setWaSending(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: waPreviewType,
          mode: 'send',
          drafts: waDrafts.map((draft) => ({
            id: draft.id,
            message: draft.message,
          })),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        notify({ type: 'error', title: 'WhatsApp Failed', message: data.error || 'Failed to send WhatsApp.' })
        return
      }

      const summary = data.summary
      const detail = summary
        ? `Sent ${summary.sent}/${summary.total}${summary.failed > 0 ? `, Failed ${summary.failed}` : ''}`
        : data.message

      notify({
        type: data.success ? 'success' : 'warning',
        title: data.success ? 'WhatsApp Sent' : 'WhatsApp Partial',
        message: detail,
      })

      closeWaPreviewModal()
    } catch (error) {
      notify({ type: 'error', title: 'WhatsApp Error', message: String(error) })
    } finally {
      setWaSending(false)
    }
  }

  const handleDeleteBooking = async () => {
    if (!booking) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Booking Deleted', message: `${booking.bookingRef || `#${booking.id}`} deleted.` })
        setShowDeleteConfirmModal(false)
        router.push('/bookings')
      } else {
        notify({ type: 'error', title: 'Delete Booking Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Booking Error', message: String(error) })
    } finally {
      setDeleting(false)
    }
  }

  const fetchReparseEmails = async () => {
    if (!booking) return
    setReparseLoading(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reparse`)
      const data = await res.json()
      if (data.success) {
        setReparseEmails(data.emails || [])
        const defaultIds = (data.emails || []).map((e: ReparseEmail) => e.id)
        setSelectedEmailIds(defaultIds)
      } else {
        notify({ type: 'error', title: 'Reparse Load Failed', message: data.error || 'Failed to load emails' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Reparse Load Error', message: String(error) })
    } finally {
      setReparseLoading(false)
    }
  }

  const handleReparse = async () => {
    if (!booking) return
    if (selectedEmailIds.length === 0) {
      notify({ type: 'warning', title: 'Select Email', message: 'Please select at least one email to reparse.' })
      return
    }
    setReparsing(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/reparse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailIds: selectedEmailIds }),
      })
      const data = await res.json()
      if (data.success) {
        notify({
          type: 'success',
          title: 'Reparse Complete',
          message: `Updated: ${data.updated || 0}\nSkipped: ${data.skipped || 0}\nErrors: ${data.errors || 0}`,
        })
        setShowReparseModal(false)
        fetchBookingDetails()
      } else {
        notify({ type: 'error', title: 'Reparse Failed', message: data.error || 'Failed to reparse booking' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Reparse Error', message: String(error) })
    } finally {
      setReparsing(false)
    }
  }

  const financeTotal = finance?.items.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0
  const financePatternName = finance?.patternId
    ? patterns.find((pattern) => pattern.id === finance.patternId)?.name
    : null
  const canAssignDriver = booking
    ? !booking.assignedDriverId && ['NEW', 'UPDATED', 'ATTENTION'].includes(booking.status)
    : false
  const hasGuestPhone = Boolean(booking?.phoneNumber?.trim())
  const hasDriverPhone = Boolean(booking?.driver?.phone?.trim())
  const isReadyStatus = booking?.status === 'READY'
  const isAttentionStatus = booking?.status === 'ATTENTION'
  const isDoneStatus = booking?.status === 'DONE'

  const waActionGroups: Array<{
    title: string
    actions: Array<{
      type: WhatsAppSendType
      label: string
      hint: string
      disabled: boolean
      reason?: string
    }>
  }> = [
    {
      title: '1. Notifikasi Booking',
      actions: [
        {
          type: 'BOOKING_GROUP',
          label: 'Booking baru ke group',
          hint: 'Kirim detail booking baru ke group internal.',
          disabled: false,
        },
        {
          type: 'BOOKING_GUEST',
          label: 'Booking diterima ke tamu',
          hint: 'Konfirmasi ke tamu bahwa booking sudah diterima.',
          disabled: !hasGuestPhone,
          reason: hasGuestPhone ? undefined : 'Nomor WA tamu belum tersedia.',
        },
      ],
    },
    {
      title: '2. Status READY',
      actions: [
        {
          type: 'READY_DRIVER',
          label: 'Penugasan ke driver',
          hint: 'Kirim detail booking + tugas ke driver.',
          disabled: !isReadyStatus || !hasDriverPhone,
          reason: !isReadyStatus ? 'Hanya aktif saat status READY.' : !hasDriverPhone ? 'Nomor WA driver belum tersedia.' : undefined,
        },
        {
          type: 'READY_PARTNERS',
          label: 'Detail booking ke partner',
          hint: 'Kirim detail booking ke partner terkait.',
          disabled: !isReadyStatus,
          reason: !isReadyStatus ? 'Hanya aktif saat status READY.' : undefined,
        },
        {
          type: 'READY_GUEST',
          label: 'Detail driver ke tamu',
          hint: 'Kirim info driver yang bertugas ke tamu.',
          disabled: !isReadyStatus || !hasGuestPhone || !booking?.driver,
          reason: !isReadyStatus
            ? 'Hanya aktif saat status READY.'
            : !booking?.driver
              ? 'Driver belum ditugaskan.'
              : !hasGuestPhone
                ? 'Nomor WA tamu belum tersedia.'
                : undefined,
        },
      ],
    },
    {
      title: '3. Status ATTENTION',
      actions: [
        {
          type: 'ATTENTION_GUEST',
          label: 'Terima kasih + review ke tamu',
          hint: 'Ucapan terima kasih dan permintaan review.',
          disabled: !isAttentionStatus || !hasGuestPhone,
          reason: !isAttentionStatus ? 'Hanya aktif saat status ATTENTION.' : !hasGuestPhone ? 'Nomor WA tamu belum tersedia.' : undefined,
        },
        {
          type: 'ATTENTION_DRIVER',
          label: 'Terima kasih + laporan ke driver',
          hint: 'Minta laporan perjalanan dan laporan komisi/keuangan.',
          disabled: !isAttentionStatus || !hasDriverPhone,
          reason: !isAttentionStatus ? 'Hanya aktif saat status ATTENTION.' : !hasDriverPhone ? 'Nomor WA driver belum tersedia.' : undefined,
        },
      ],
    },
    {
      title: '4. Status DONE',
      actions: [
        {
          type: 'DONE_PAID_INVOICE',
          label: 'Paid invoice ke partner/driver',
          hint: 'Kirim informasi invoice berstatus paid.',
          disabled: !isDoneStatus,
          reason: !isDoneStatus ? 'Hanya aktif saat status DONE.' : undefined,
        },
      ],
    },
  ]
  const waActionLabelMap = waActionGroups
    .flatMap((group) => group.actions)
    .reduce((acc, action) => {
      acc[action.type] = action.label
      return acc
    }, {} as Record<WhatsAppSendType, string>)
  const waPreviewLabel = waPreviewType ? waActionLabelMap[waPreviewType] || waPreviewType : 'Preview Pesan'
  const waSendableCount = waDrafts.filter((draft) => draft.canSend).length

  const pendingDriver =
    pendingDriverId == null
      ? null
      : suggestedDrivers?.primary?.id === pendingDriverId
        ? suggestedDrivers.primary
        : suggestedDrivers?.alternatives.find((d) => d.id === pendingDriverId) ||
          drivers.find((d) => d.id === pendingDriverId) ||
          null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Loading booking details...</p>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Booking Not Found</h2>
        <Link href="/bookings">
          <Button>Back to Bookings</Button>
        </Link>
      </div>
    )
  }

  const tourDisplay = (() => {
    let tourName =
      booking.package?.tour?.tourName ||
      booking.package?.packageName ||
      booking.tourName ||
      'Tour Booking'
    let tourCode = ''
    let packageName = booking.package?.packageName || ''

    if (booking.note) {
      const tourLine = booking.note.split('\n').find(line => line.trim().startsWith('Tour:'))
      if (tourLine) {
        const tourInfo = tourLine.replace('Tour:', '').trim()
        const parts = tourInfo.split('-')
        if (parts.length > 1) {
          tourCode = parts[0].trim()
          tourName = parts.slice(1).join('-').trim() || tourName
        } else {
          tourName = tourInfo
        }
      }

      if (!packageName) {
        const packageLine = booking.note.split('\n').find(line => line.trim().startsWith('Package:'))
        if (packageLine) {
          packageName = packageLine.replace('Package:', '').trim()
        }
      }
    }

    if (!tourCode && booking.tourName) {
      const parts = booking.tourName.split('-')
      if (parts.length > 1) {
        const possibleCode = parts[0].trim()
        const possibleName = parts.slice(1).join('-').trim()
        if (possibleName) {
          tourCode = possibleCode
          tourName = possibleName
        }
      }
    }

    return { tourName, tourCode, packageName }
  })()

  // Booking "created" date should reflect OTA first booking email receivedAt (relationType=CREATED),
  // not the system insert time.
  const bookingCreatedOta = booking.otaReceivedAt || booking.createdAt

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/bookings">
            <Button variant="outline" size="sm" className="hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900 tracking-tight">
              Booking {booking.bookingRef || `#${booking.id}`}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Created {formatDate(bookingCreatedOta)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {canAssignDriver && (
            <Button onClick={() => setShowAssignModal(true)} className="shadow-lg">
              <Car className="h-4 w-4" />
              Assign Driver
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setShowReparseModal(true)
              fetchReparseEmails()
            }}
          >
            Reparse Booking
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirmModal(true)}
            disabled={deleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>

      {/* Tour & Package Banner */}
      <Card className="p-4 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow duration-200">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg flex-shrink-0">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">
              {booking.package ? 'Tour Package' : 'Tour Details'}
            </div>
            
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tour</div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {tourDisplay.tourName}
            </h2>
            {tourDisplay.tourCode && (
              <div className="text-sm text-gray-600 font-mono mt-1">
                Code: {tourDisplay.tourCode}
              </div>
            )}
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</div>
              <div className="text-sm font-semibold text-purple-700">
                {tourDisplay.packageName || 'Belum diisi'}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 rounded-full text-xs font-semibold text-gray-700 shadow-sm">
                <Calendar className="h-3 w-3" />
                {formatDate(booking.tourDate)}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 rounded-full text-xs font-semibold text-gray-700 shadow-sm">
                <Users className="h-3 w-3" />
                {booking.numberOfAdult}A{booking.numberOfChild ? ` + ${booking.numberOfChild}C` : ''}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 rounded-full text-xs font-semibold text-purple-700 shadow-sm">
                <FileText className="h-3 w-3" />
                Tour: {tourDisplay.tourName}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 rounded-full text-xs font-semibold text-indigo-700 shadow-sm">
                <Package className="h-3 w-3" />
                Package: {tourDisplay.packageName || 'Belum diisi'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Status Banner */}
      <Card className="p-4 border-l-4 border-l-slate-300 bg-gradient-to-r from-slate-50 to-white transition-shadow duration-200 hover:shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <span>Status:</span>
                <StatusBadge status={booking.status} label={booking.status} showIcon className="font-bold" />
              </div>
              {booking.isPaid && (
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  Paid {booking.paidAt ? `on ${formatDate(booking.paidAt)}` : ''}
                </div>
              )}
            </div>
          </div>

        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tour Information */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Schedule & Location
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tour Date & Time</div>
                  <div className="font-semibold text-base text-gray-900 mt-0.5">
                    {formatDateFull(booking.tourDate)}
                  </div>
                </div>
              </div>

              {booking.pickupLocation?.trim() && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
                    <MapPin className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pickup Location</div>
                    <div className="font-medium text-gray-900 mt-0.5">{booking.pickupLocation}</div>
                  </div>
                </div>
              )}

              {booking.meetingPoint?.trim() && booking.meetingPoint !== booking.pickupLocation && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
                    <MapPin className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Meeting Point</div>
                    <div className="font-medium text-gray-900 mt-0.5">{booking.meetingPoint}</div>
                  </div>
                </div>
              )}
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Group Size</div>
                  <div className="font-medium text-gray-900 mt-0.5">
                    {booking.numberOfAdult} Adult{booking.numberOfAdult > 1 ? 's' : ''}
                    {booking.numberOfChild ? ` + ${booking.numberOfChild} Child${booking.numberOfChild > 1 ? 'ren' : ''}` : ''}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Customer Information */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Customer Information
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 flex-shrink-0">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</div>
                  <div className="font-medium text-gray-900 mt-0.5">{booking.mainContactName}</div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 flex-shrink-0">
                  <Mail className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</div>
                  <div className="font-medium text-gray-900 mt-0.5 break-all">{booking.mainContactEmail}</div>
                </div>
              </div>

              {booking.phoneNumber && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-150">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
                    <Phone className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Phone</div>
                    <div className="font-medium text-gray-900 mt-0.5">{booking.phoneNumber}</div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Notes + Meta (Single Place) */}
          <Card className="p-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Booking Details
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Source</span>
                <SourceBadge source={booking.source} label={booking.source} className="font-bold" />
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Booking Date</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatDate(booking.bookingDate)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Booking Created</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatDate(bookingCreatedOta)}
                </span>
              </div>
            </div>

            {!booking.note ? (
              <div className="text-sm text-gray-600">No additional notes found for this booking.</div>
            ) : (
              <div className="space-y-1 text-xs leading-snug">
                {booking.note.split('\n').filter(line => line.trim()).map((line, idx) => {
                  const trimmedLine = line.trim()
                  
                  // Main Tour info
                  if (trimmedLine.startsWith('Tour:')) {
                    return (
                      <div key={idx} className="font-bold text-sm text-gray-900 bg-blue-50 px-3 py-2 rounded-lg mb-2">
                        {trimmedLine}
                      </div>
                    )
                  }
                  
                  // Rate, Viator amount, Bokun Ref, Confirmation
                  if (trimmedLine.match(/^(Rate:|Viator amount:|Bokun Ref:|Confirmation:)/i)) {
                    const parts = trimmedLine.split(':')
                    return (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded">
                        <span className="font-semibold text-gray-700">{parts[0]}:</span>
                        <span className="text-gray-900">{parts.slice(1).join(':').trim()}</span>
                      </div>
                    )
                  }
                  
                  // Section headers (--- Something ---)
                  if (trimmedLine.startsWith('---') && trimmedLine.endsWith('---')) {
                    return (
                      <div key={idx} className="font-semibold text-blue-700 mt-3 pt-3 border-t border-blue-200 first:mt-0 first:border-0 first:pt-0 uppercase text-xs tracking-wide">
                        {trimmedLine.replace(/---/g, '').trim()}
                      </div>
                    )
                  }
                  
                  // Sub-headers like "Notes:", "Inclusions:"
                  if (trimmedLine.match(/^(Notes:|Inclusions:)/i) && !trimmedLine.startsWith('---')) {
                    return (
                      <div key={idx} className="font-semibold text-gray-800 mt-2 text-xs">
                        {trimmedLine}
                      </div>
                    )
                  }
                  
                  // Questions section items (key: value pairs)
                  if (trimmedLine.includes(':') && !trimmedLine.startsWith('-')) {
                    const colonIndex = trimmedLine.indexOf(':')
                    const key = trimmedLine.substring(0, colonIndex)
                    const value = trimmedLine.substring(colonIndex + 1).trim()
                    
                    // Check if it's a question/answer format
                    if (key.length < 50 && value) {
                      return (
                        <div key={idx} className="flex gap-2 py-0.5 pl-2">
                          <span className="text-gray-600 font-medium min-w-fit">{key}:</span>
                          <span className="text-gray-700">{value}</span>
                        </div>
                      )
                    }
                  }
                  
                  // List items or regular content
                  if (trimmedLine.length > 0) {
                    return (
                      <div key={idx} className="text-gray-600 pl-3 py-0.5 leading-tight">
                        {trimmedLine.startsWith('-') ? (
                          <span className="flex gap-2">
                            <span className="text-blue-500 font-bold">•</span>
                            <span>{trimmedLine.substring(1).trim()}</span>
                          </span>
                        ) : (
                          trimmedLine
                        )}
                      </div>
                    )
                  }
                  
                  return null
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Pricing */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-green-500">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Pricing
            </h3>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total Amount</span>
                <span className="text-2xl font-bold text-green-700">{formatCurrency(booking.totalPrice, booking.currency)}</span>
              </div>
            </div>
            {booking.isPaid && (
              <div className="mt-3 p-2 bg-green-50 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-semibold">Payment Confirmed</span>
              </div>
            )}
          </Card>

          {/* Driver Suggestion (NEW - only show if not assigned) */}
          {canAssignDriver && suggestedDrivers?.primary && (
            <Card className="p-4 hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-blue-50/30">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Car className="h-5 w-5 text-blue-600" />
                Suggested Driver
              </h3>

              {/* Primary Suggestion */}
              <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl border-2 border-blue-300 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 shadow-md flex-shrink-0">
                  <Car className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-lg text-gray-900">{suggestedDrivers.primary.name}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{suggestedDrivers.primary.phone}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{suggestedDrivers.primary.vehicleType}</div>
                  <div className="text-xs text-blue-700 mt-2 font-medium">
                    This month: {suggestedDrivers.primary.assignmentCount || 0}
                    {suggestedDrivers.primary.priorityLevel && (
                      <> • Priority: {suggestedDrivers.primary.priorityLevel}</>
                    )}
                  </div>
                </div>
              </div>

              <Button
                onClick={() => {
                  handleConfirmAssignDriver(suggestedDrivers.primary!.id)
                }}
                className="w-full mt-4 shadow-md bg-blue-600 hover:bg-blue-700"
                disabled={assigning}
              >
                {assigning ? 'Assigning...' : 'Assign Suggested Driver'}
              </Button>

              {/* Alternative Drivers */}
              {suggestedDrivers.alternatives.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-sm font-medium text-gray-700 mb-2">Or choose alternative:</div>
                  <div className="space-y-2">
                    {suggestedDrivers.alternatives.map(driver => (
                      <div key={driver.id} className="text-sm flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 transition-colors">
                        <span className="text-gray-700">
                          {driver.name} <span className="text-xs text-gray-500">(This month: {driver.assignmentCount || 0})</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            handleConfirmAssignDriver(driver.id)
                          }}
                        >
                          Select
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => setShowAssignModal(true)}
                className="w-full mt-2"
                size="sm"
              >
                Choose Different Driver
              </Button>
            </Card>
          )}

          {/* Driver Assignment */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Car className="h-5 w-5 text-blue-600" />
              Driver Assignment
            </h3>
            {booking.driver ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 shadow-md flex-shrink-0">
                    <Car className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{booking.driver.name}</div>
                    <div className="text-sm text-gray-600 mt-0.5">{booking.driver.phone}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{booking.driver.vehicleType}</div>
                  </div>
                </div>
                {booking.assignedAt && (
                  <div className="text-xs text-gray-500 px-2">
                    Assigned {formatDateTime(booking.assignedAt)}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnassignConfirmModal(true)}
                  className="w-full hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                >
                  <XCircle className="h-4 w-4" />
                  Unassign Driver
                </Button>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 mx-auto mb-3">
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="text-sm font-medium text-gray-900 mb-1">No driver assigned</div>
                <div className="text-xs text-gray-500 mb-4">Assign a driver to this booking</div>
                {canAssignDriver && (
                  <Button
                    size="sm"
                    onClick={() => setShowAssignModal(true)}
                    className="w-full shadow-md"
                  >
                    <Car className="h-4 w-4" />
                    Assign Driver
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* WhatsApp Manual Notifications */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-emerald-500">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Phone className="h-5 w-5 text-emerald-600" />
              WhatsApp Manual
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Semua WA dikirim manual lewat tombol. Sistem tidak mengirim WA otomatis.
            </p>

            <div className="space-y-4">
              {waActionGroups.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</div>
                  <div className="space-y-2">
                    {group.actions.map((action) => {
                      const isSending = sendingWaType === action.type
                      const disableButton = action.disabled || Boolean(sendingWaType)
                      return (
                        <div key={action.type} className="rounded-lg border border-gray-200 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">{action.label}</div>
                              <div className="text-xs text-gray-500">{action.hint}</div>
                              {action.reason && (
                                <div className="text-xs text-amber-600 mt-1">{action.reason}</div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant={action.disabled ? 'outline' : 'default'}
                              disabled={disableButton}
                              onClick={() => handleOpenWhatsAppPreview(action.type)}
                              className="shrink-0"
                            >
                              {isSending ? 'Sending...' : 'Kirim WA'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Finance */}
          <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-600" />
              Finance
            </h3>
            {!booking.package ? (
              <div className="text-center py-4">
                <div className="text-sm text-gray-600 mb-3">Package belum ditentukan</div>
                <Button
                  size="sm"
                  onClick={openSetupFinanceModal}
                  className="w-full"
                >
                  <Package className="h-4 w-4 mr-1" />
                  Setup Package + Template
                </Button>
              </div>
            ) : finance ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-700">
                  Cost Template:{' '}
                  <span className="font-semibold">
                    {financePatternName || (finance.patternId ? `#${finance.patternId}` : 'Not set')}
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  Total Cost: <span className="font-semibold">{formatCurrency(financeTotal, 'IDR')}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {finance.validatedAt ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Validated
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-yellow-600" />
                      Not validated
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" onClick={openSetupFinanceModal}>
                    <Package className="h-4 w-4 mr-1" />
                    Change Package/Template
                  </Button>
                  <Link href={`/finance/validate?bookingId=${booking.id}`}>
                    <Button size="sm" className="w-full">
                      <Wallet className="h-4 w-4 mr-1" />
                      Finance Review
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-sm text-gray-600 mb-3">Package sudah ada, cost template belum ditentukan</div>
                <Button size="sm" onClick={openSetupFinanceModal} className="w-full">
                  <Shapes className="h-4 w-4 mr-1" />
                  Setup Template
                </Button>
              </div>
            )}
          </Card>

        </div>
      </div>

      {/* Confirm Unassign Driver Modal */}
      <Dialog
        open={showUnassignConfirmModal}
        onOpenChange={(open) => {
          if (assigning) return
          setShowUnassignConfirmModal(open)
        }}
      >
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (assigning) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (assigning) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">Unassign Driver</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                This will remove the assigned driver from this booking.
              </DialogDescription>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <Button
              variant="outline"
              onClick={() => setShowUnassignConfirmModal(false)}
              className="flex-1"
              disabled={assigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnassignDriver}
              className="flex-1 shadow-lg bg-red-600 hover:bg-red-700"
              disabled={assigning}
            >
              {assigning ? 'Unassigning...' : 'Unassign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Booking Modal */}
      <Dialog
        open={showDeleteConfirmModal}
        onOpenChange={(open) => {
          if (deleting) return
          setShowDeleteConfirmModal(open)
        }}
      >
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (deleting) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (deleting) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">Delete Booking</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Delete {booking.bookingRef || `#${booking.id}`}? This cannot be undone.
              </DialogDescription>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmModal(false)}
              className="flex-1"
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteBooking}
              className="flex-1 shadow-lg bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Assign Driver Modal */}
      <Dialog
        open={showConfirmDriverModal}
        onOpenChange={(open) => {
          if (assigning) return
          setShowConfirmDriverModal(open)
          if (!open) setPendingDriverId(null)
        }}
      >
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (assigning) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (assigning) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Car className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">Confirm Assignment</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Assign this driver to the booking?
              </DialogDescription>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <div className="font-semibold text-gray-900">
              {pendingDriver?.name || (pendingDriverId ? `Driver #${pendingDriverId}` : 'Driver')}
            </div>
            {pendingDriver?.phone && <div className="text-sm text-gray-700">{pendingDriver.phone}</div>}
            {pendingDriver?.vehicleType && <div className="text-xs text-gray-600 mt-0.5">{pendingDriver.vehicleType}</div>}
          </div>

          <div className="flex gap-3 mt-5">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmDriverModal(false)
                setPendingDriverId(null)
              }}
              className="flex-1"
              disabled={assigning}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAssignDriver(pendingDriverId)}
              className="flex-1 shadow-lg"
              disabled={assigning || !pendingDriverId}
            >
              {assigning ? 'Assigning...' : 'Assign Driver'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Setup Finance Modal (Package + Template) */}
      <Dialog
        open={showSetupFinanceModal}
        onOpenChange={(open) => {
          if (setupFinanceSaving) return
          setShowSetupFinanceModal(open)
        }}
      >
        <DialogContent
          className="max-w-2xl p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (setupFinanceSaving) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (setupFinanceSaving) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Wallet className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">Setup Finance</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Select package, then choose a cost template.
              </DialogDescription>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                Package
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {packages.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-600">Belum ada package tersedia.</div>
                ) : (
                  packages.map((pkg) => (
                    <label
                      key={pkg.id}
                      className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                        selectedPackageId === pkg.id
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="setup-package"
                        value={pkg.id}
                        checked={selectedPackageId === pkg.id}
                        onChange={() => {
                          setSelectedPackageId(pkg.id)
                          setSelectedPatternId(null)
                          fetchPatterns(pkg.id)
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{pkg.packageName}</div>
                        {pkg.tour?.tourName && <div className="text-xs text-gray-500 truncate">{pkg.tour.tourName}</div>}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Shapes className="h-4 w-4 text-blue-600" />
                Cost Template
              </div>
              {!selectedPackageId ? (
                <div className="text-center py-10 text-sm text-gray-600 border-2 border-dashed rounded-xl">
                  Pilih package dulu.
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {patternsLoading ? (
                    <div className="text-center py-10 text-sm text-gray-600">
                      Loading templates...
                    </div>
                  ) : patterns.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-600">
                      Tidak ada template untuk package ini.
                    </div>
                  ) : (
                    patterns.map((pattern) => (
                      <label
                        key={pattern.id}
                        className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedPatternId === pattern.id
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="setup-pattern"
                          value={pattern.id}
                          checked={selectedPatternId === pattern.id}
                          onChange={() => setSelectedPatternId(pattern.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-semibold text-gray-900">{pattern.name}</div>
                          {!pattern.isActive && <div className="text-xs text-gray-500">Inactive</div>}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowSetupFinanceModal(false)}
              className="flex-1"
              disabled={setupFinanceSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSetupFinance}
              className="flex-1 shadow-lg"
              disabled={setupFinanceSaving || !selectedPackageId}
            >
              {setupFinanceSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Driver Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (assigning) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (assigning) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Car className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Assign Driver
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Select an available driver for this booking
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-2 mb-6 max-h-96 overflow-y-auto pr-1">
            {drivers.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mx-auto mb-4">
                  <Car className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">No available drivers</p>
                <p className="text-xs text-gray-500">All drivers are currently assigned</p>
              </div>
            ) : (
              drivers.map((driver) => (
                <label
                  key={driver.id}
                  className={`flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                    selectedDriverId === driver.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="driver"
                    value={driver.id}
                    checked={selectedDriverId === driver.id}
                    onChange={() => setSelectedDriverId(driver.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
                    <Car className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{driver.name}</div>
                    <div className="text-sm text-gray-600">{driver.phone}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{driver.vehicleType}</div>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowAssignModal(false)}
              className="flex-1"
              disabled={assigning}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAssignDriver()}
              className="flex-1 shadow-lg"
              disabled={assigning || !selectedDriverId}
            >
              {assigning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Assigning...
                </span>
              ) : (
                'Assign Driver'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Template Modal */}
      <Dialog open={showPatternModal} onOpenChange={setShowPatternModal}>
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (assigningPattern) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (assigningPattern) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Shapes className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Assign Cost Template
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Choose a cost template for this booking
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto pr-1">
            {patternsLoading ? (
              <div className="text-center py-10 text-sm text-gray-600">
                Loading templates...
              </div>
            ) : patterns.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-600">
                No templates available for this package.
              </div>
            ) : (
              patterns.map((pattern) => (
                <label
                  key={pattern.id}
                  className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                    selectedPatternId === pattern.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="pattern"
                    value={pattern.id}
                    checked={selectedPatternId === pattern.id}
                    onChange={() => setSelectedPatternId(pattern.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{pattern.name}</div>
                    {!pattern.isActive && (
                      <div className="text-xs text-gray-500">Inactive</div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPatternModal(false)}
              className="flex-1"
              disabled={assigningPattern}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignPattern}
              className="flex-1 shadow-lg"
              disabled={assigningPattern || !selectedPatternId}
            >
              {assigningPattern ? 'Assigning...' : 'Assign Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Package Modal */}
      <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
        <DialogContent
          className="max-w-md p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (assigningPackage) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (assigningPackage) e.preventDefault()
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900">
                Assign Package
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                Pilih package untuk booking ini
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-2 mb-6 max-h-80 overflow-y-auto pr-1">
            {packages.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-600">
                Belum ada package tersedia.
              </div>
            ) : (
              packages.map((pkg) => (
                <label
                  key={pkg.id}
                  className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                    selectedPackageId === pkg.id
                      ? 'border-blue-500 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="package"
                    value={pkg.id}
                    checked={selectedPackageId === pkg.id}
                    onChange={() => setSelectedPackageId(pkg.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{pkg.packageName}</div>
                    {pkg.tour?.tourName && (
                      <div className="text-xs text-gray-500">{pkg.tour.tourName}</div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPackageModal(false)}
              className="flex-1"
              disabled={assigningPackage}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignPackage}
              className="flex-1 shadow-lg"
              disabled={assigningPackage || !selectedPackageId}
            >
              {assigningPackage ? 'Assigning...' : 'Assign Package'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Preview Modal */}
      <Dialog
        open={showWaPreviewModal}
        onOpenChange={(open) => {
          if (!open) {
            closeWaPreviewModal()
            return
          }
          setShowWaPreviewModal(true)
        }}
      >
        <DialogContent
          className="max-w-3xl p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (waSending) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (waSending) e.preventDefault()
          }}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900">
                Preview Pesan WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-600">
                {waPreviewLabel}
              </DialogDescription>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Total Target: {waDrafts.length}</div>
              <div>Siap Kirim: {waSendableCount}</div>
            </div>
          </div>

          {waDrafts.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-600">
              Tidak ada pesan untuk ditampilkan.
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
              {waDrafts.map((draft) => (
                <div key={draft.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold text-gray-900">{draft.target}</div>
                    <div className={`text-xs font-medium ${draft.canSend ? 'text-emerald-700' : 'text-red-600'}`}>
                      {draft.canSend ? 'Siap dikirim' : 'Tidak bisa dikirim'}
                    </div>
                  </div>
                  {draft.phone ? (
                    <div className="text-xs text-gray-500 mb-2">WA: {draft.phone}</div>
                  ) : null}
                  {draft.error ? (
                    <div className="text-xs text-red-600 mb-2">{draft.error}</div>
                  ) : null}
                  <Textarea
                    value={draft.message}
                    onChange={(e) => handleWaDraftMessageChange(draft.id, e.target.value)}
                    disabled={!waEditEnabled}
                    className="min-h-40 text-xs leading-relaxed"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={closeWaPreviewModal}
              disabled={waSending}
              className="flex-1"
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => setWaEditEnabled((prev) => !prev)}
              disabled={waSending || waDrafts.length === 0}
              className="flex-1"
            >
              <Edit className="h-4 w-4" />
              {waEditEnabled ? 'Lock Pesan' : 'Edit Pesan'}
            </Button>
            <Button
              onClick={handleSendWhatsAppFromModal}
              disabled={waSending || waDrafts.length === 0 || waSendableCount === 0}
              className="flex-1"
            >
              {waSending ? 'Mengirim...' : 'Kirim Pesan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reparse Booking Modal */}
      <Dialog open={showReparseModal} onOpenChange={setShowReparseModal}>
        <DialogContent
          className="max-w-2xl p-4 shadow-2xl"
          onEscapeKeyDown={(e) => {
            if (reparsing) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (reparsing) e.preventDefault()
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900">
                Reparse Booking
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-600">
                Select matching emails for booking{' '}
                <span className="font-semibold">
                  {booking.bookingRef || `#${booking.id}`}
                </span>
                .
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowReparseModal(false)}
              disabled={reparsing}
            >
              Close
            </Button>
          </div>

          {reparseLoading ? (
            <div className="py-10 text-center text-sm text-gray-600">Loading emails...</div>
          ) : reparseEmails.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-600">No matching emails found.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto border rounded-lg">
              <Table className="text-sm">
                <TableHeader className="bg-gray-50 border-b">
                  <TableRow>
                    <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Select</TableHead>
                    <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Subject</TableHead>
                    <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">From</TableHead>
                    <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reparseEmails.map((email) => (
                    <TableRow
                      key={email.id}
                      className="hover:bg-gray-50"
                    >
                      <TableCell className="px-3 py-2">
                        <Checkbox
                          checked={selectedEmailIds.includes(email.id)}
                          onChange={(e) => {
                            setSelectedEmailIds((prev) =>
                              e.target.checked
                                ? [...prev, email.id]
                                : prev.filter((id) => id !== email.id)
                            )
                          }}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="font-medium text-gray-900">{email.subject}</div>
                        {email.errorMessage && (
                          <div className="text-xs text-red-600">
                            Error: {email.errorMessage}
                          </div>
                        )}
                        {email.bookingLinked && (
                          <div className="text-xs text-blue-600">Linked to booking</div>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-gray-600">{email.from}</TableCell>
                      <TableCell className="px-3 py-2 text-gray-600">
                        {formatDateTime(email.receivedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-gray-500">Selected: {selectedEmailIds.length}</div>
            <Button onClick={handleReparse} disabled={reparsing || selectedEmailIds.length === 0}>
              {reparsing ? 'Reparsing...' : 'Reparse Selected'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
