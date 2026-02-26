'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DriverStatusBadge } from '@/components/ui/driver-status-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Car, Mail, Phone, Star, Trash2, AlertCircle, Edit } from 'lucide-react'
import { formatDate } from '@/lib/date-format'
import { useNotifications } from '@/hooks/use-notifications'

interface DriverDetail {
  id: number
  name: string
  email: string | null
  phone: string
  vehicleType: string
  vehiclePlate: string | null
  licenseNumber: string | null
  status: string
  rating: number | null
  bookingCount: number
  monthlyAssignmentCount: number
  totalAssignmentCount: number
  priorityLevel: number | null
  createdAt: Date
}

export default function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [driver, setDriver] = useState<DriverDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    vehicleType: '',
    vehiclePlate: '',
    licenseNumber: '',
    notes: '',
    priorityLevel: '',
    status: 'AVAILABLE',
  })

  useEffect(() => {
    fetchDriver()
  }, [resolvedParams.id])

  const fetchDriver = async () => {
    try {
      const res = await fetch(`/api/drivers/${resolvedParams.id}`)
      const data = await res.json()
      
      if (data.driver) {
        setDriver(data.driver)
        setFormData({
          name: data.driver.name,
          email: data.driver.email || '',
          phone: data.driver.phone,
          vehicleType: data.driver.vehicleType,
          vehiclePlate: data.driver.vehiclePlate || '',
          licenseNumber: data.driver.licenseNumber || '',
          notes: '',
          priorityLevel: data.driver.priorityLevel?.toString() || '',
          status: data.driver.status,
        })
      }
    } catch (error) {
      console.error('Error fetching driver:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!driver) return
    if (!confirm(`Delete driver ${driver.name}? This cannot be undone.`)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Driver Deleted', message: driver.name })
        router.push('/drivers')
      } else {
        notify({ type: 'error', title: 'Delete Driver Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Driver Error', message: String(error) })
    } finally {
      setDeleting(false)
    }
  }

  const handleUpdateDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!driver) return

    setSaving(true)
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          priorityLevel: formData.priorityLevel ? parseInt(formData.priorityLevel) : null,
        }),
      })

      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Driver Updated', message: formData.name })
        setShowEditModal(false)
        fetchDriver()
      } else {
        notify({ type: 'error', title: 'Update Driver Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Update Driver Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Loading driver...</p>
        </div>
      </div>
    )
  }

  if (!driver) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Driver Not Found</h2>
        <Link href="/drivers">
          <Button>Back to Drivers</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/drivers">
            <Button variant="outline" size="sm" className="hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{driver.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Added {formatDate(driver.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowEditModal(true)}
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting...' : 'Delete Driver'}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-full">
            <Car className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
          <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{driver.name}</h2>
              <DriverStatusBadge status={driver.status} label={driver.status} />
              {driver.priorityLevel && (
                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold">
                  P{driver.priorityLevel}
                </span>
              )}
            </div>
            {driver.rating && (
              <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span>{driver.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-2">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="h-4 w-4" />
            <span>{driver.phone}</span>
          </div>
          {driver.email && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Mail className="h-4 w-4" />
              <span className="break-all">{driver.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Car className="h-4 w-4" />
            <span>{driver.vehicleType}</span>
            {driver.vehiclePlate && (
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                {driver.vehiclePlate}
              </span>
            )}
          </div>
          {driver.licenseNumber && (
            <div className="text-sm text-gray-700">
              License: <span className="font-medium">{driver.licenseNumber}</span>
            </div>
          )}
          <div className="text-sm text-gray-700">
            Bookings: <span className="font-medium">{driver.bookingCount}</span>
          </div>
          <div className="text-sm text-gray-700">
            This month: <span className="font-medium">{driver.monthlyAssignmentCount || 0}</span>
          </div>
          <div className="text-sm text-gray-700">
            Total assignments: <span className="font-medium">{driver.totalAssignmentCount || 0}</span>
          </div>
        </div>
      </Card>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Edit Driver
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateDriver} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="driverName" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </Label>
                <Input
                  id="driverName"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="driverPhone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone *
                </Label>
                <Input
                  id="driverPhone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="driverEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </Label>
                <Input
                  id="driverEmail"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="driverVehicleType" className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Type *
                </Label>
                <Input
                  id="driverVehicleType"
                  type="text"
                  required
                  placeholder="e.g. Toyota Avanza"
                  value={formData.vehicleType}
                  onChange={(e) =>
                    setFormData({ ...formData, vehicleType: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="driverVehiclePlate" className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Plate
                </Label>
                <Input
                  id="driverVehiclePlate"
                  type="text"
                  placeholder="e.g. B 1234 XYZ"
                  value={formData.vehiclePlate}
                  onChange={(e) =>
                    setFormData({ ...formData, vehiclePlate: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="driverLicenseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  License Number
                </Label>
                <Input
                  id="driverLicenseNumber"
                  type="text"
                  value={formData.licenseNumber}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      licenseNumber: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="driverPriority" className="block text-sm font-medium text-gray-700 mb-1">
                  Priority Level
                </Label>
                <Input
                  id="driverPriority"
                  type="number"
                  min="1"
                  max="10"
                  placeholder="1-10 (optional)"
                  value={formData.priorityLevel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priorityLevel: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Higher priority = more bookings
                </p>
              </div>

              <div>
                <Label htmlFor="driverStatus" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </Label>
                <Select
                  id="driverStatus"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="BUSY">Busy</option>
                  <option value="OFF_DUTY">Off Duty</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="driverNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </Label>
              <Textarea
                id="driverNotes"
                rows={3}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Updating...' : 'Update Driver'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
