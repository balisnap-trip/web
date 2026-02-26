'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DriverStatusBadge } from '@/components/ui/driver-status-badge'
import { ModuleTabs } from '@/components/layout/module-tabs'
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
import Link from 'next/link'
import { 
  Car,
  Phone,
  Mail,
  Plus,
  Star,
  Calendar
} from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface Driver {
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

interface WhatsAppTemplate {
  key: string
  scope: 'partner' | 'driver'
  title: string
  description: string
  placeholders: string[]
  xml: string
  isCustom: boolean
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [driverTemplates, setDriverTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [templateLoading, setTemplateLoading] = useState(true)
  const [templateSavingKey, setTemplateSavingKey] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
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
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  useEffect(() => {
    fetchDrivers()
  }, [])

  const fetchDrivers = async () => {
    try {
      const [res, templateRes] = await Promise.all([
        fetch('/api/drivers'),
        fetch('/api/whatsapp/templates?scope=driver'),
      ])
      const data = await res.json()
      const templateData = await templateRes.json()
      
      if (data.drivers) {
        setDrivers(data.drivers)
      } else {
        notify({ type: 'error', title: 'Load Drivers Failed', message: data.error || 'Unable to load drivers.' })
      }
      if (templateData.templates) {
        setDriverTemplates(templateData.templates)
      } else {
        notify({ type: 'error', title: 'Load WA Templates Failed', message: templateData.error || 'Unable to load driver templates.' })
      }
    } catch (error) {
      console.error('Error fetching drivers:', error)
      notify({ type: 'error', title: 'Load Drivers Error', message: String(error) })
    } finally {
      setLoading(false)
      setTemplateLoading(false)
    }
  }

  const updateDriverTemplateXml = (key: string, xml: string) => {
    setDriverTemplates((prev) =>
      prev.map((item) => (item.key === key ? { ...item, xml } : item))
    )
  }

  const saveDriverTemplate = async (template: WhatsAppTemplate) => {
    setTemplateSavingKey(template.key)
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: template.key,
          xml: template.xml,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify({ type: 'success', title: 'Template Saved', message: template.title })
        fetchDrivers()
      } else {
        notify({ type: 'error', title: 'Save Template Failed', message: data.error || 'Unable to save template' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Template Error', message: String(error) })
    } finally {
      setTemplateSavingKey(null)
    }
  }

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          priorityLevel: formData.priorityLevel ? parseInt(formData.priorityLevel) : null,
        }),
      })

      const data = await res.json()

      if (data.success) {
        notify({ type: 'success', title: 'Driver Added', message: formData.name })
        setShowAddModal(false)
        setFormData({
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
        fetchDrivers()
      } else {
        notify({ type: 'error', title: 'Add Driver Failed', message: data.error })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Add Driver Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ModuleTabs moduleId="networks" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers & Guides</h1>
          <p className="text-gray-600 mt-1">
            Manage drivers and tour guides
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Driver
        </Button>
      </div>

      <Card className="p-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900">WhatsApp XML Templates (Driver)</h2>
          <p className="text-sm text-gray-600">
            Template ini dipakai untuk pesan WA ke driver dari fitur kirim WA booking.
          </p>
        </div>

        {templateLoading ? (
          <div className="text-sm text-gray-600">Loading templates...</div>
        ) : driverTemplates.length === 0 ? (
          <div className="text-sm text-gray-600">Template driver belum tersedia.</div>
        ) : (
          <div className="space-y-4">
            {driverTemplates.map((template) => (
              <div key={template.key} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2">
                  <div className="font-semibold text-gray-900">{template.title}</div>
                  <div className="text-xs text-gray-600">{template.description}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Placeholders: {template.placeholders.map((item) => `{{${item}}}`).join(', ')}
                  </div>
                </div>
                <Textarea
                  value={template.xml}
                  onChange={(e) => updateDriverTemplateXml(template.key, e.target.value)}
                  className="min-h-56 font-mono text-xs"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => saveDriverTemplate(template)}
                    disabled={templateSavingKey === template.key}
                  >
                    {templateSavingKey === template.key ? 'Saving...' : 'Save XML'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <Card className="p-3">
          <div className="text-sm text-gray-600">Total Drivers</div>
          <div className="text-2xl font-bold text-gray-900">{drivers.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-sm text-gray-600">Available</div>
          <div className="text-2xl font-bold text-green-600">
            {drivers.filter(d => d.status === 'AVAILABLE').length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-sm text-gray-600">Busy</div>
          <div className="text-2xl font-bold text-yellow-600">
            {drivers.filter(d => d.status === 'BUSY').length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-sm text-gray-600">Off Duty</div>
          <div className="text-2xl font-bold text-gray-600">
            {drivers.filter(d => d.status === 'OFF_DUTY').length}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-sm text-gray-600">With Bookings</div>
          <div className="text-2xl font-bold text-indigo-600">
            {drivers.filter(d => d.bookingCount > 0).length}
          </div>
        </Card>
      </div>

      {/* Drivers Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drivers.map((driver) => (
          <Link key={driver.id} href={`/drivers/${driver.id}`} className="block">
            <Card className="p-4 hover:shadow-md transition-shadow duration-150 cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <Car className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{driver.name}</h3>
                    <div className="flex items-center gap-2">
                      {driver.rating && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{driver.rating.toFixed(1)}</span>
                        </div>
                      )}
                      {driver.priorityLevel && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-semibold">
                          P{driver.priorityLevel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <DriverStatusBadge status={driver.status} label={driver.status} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-4 w-4" />
                  <span>{driver.phone}</span>
                </div>
                {driver.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{driver.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-gray-600">
                  <Car className="h-4 w-4" />
                  <span>{driver.vehicleType}</span>
                  {driver.vehiclePlate && (
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                      {driver.vehiclePlate}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>{driver.bookingCount} bookings</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>
                    This month: {driver.monthlyAssignmentCount || 0} | Total: {driver.totalAssignmentCount || 0}
                  </span>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        {drivers.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No drivers found</h3>
            <p className="text-gray-600 mb-4">Add your first driver to get started</p>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Driver
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Add New Driver
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddDriver} className="space-y-4">
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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
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
                    setFormData({ ...formData, licenseNumber: e.target.value })
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
                    setFormData({ ...formData, priorityLevel: e.target.value })
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
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Adding...' : 'Add Driver'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}
