'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ModuleTabs } from '@/components/layout/module-tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Plus, Edit, Trash2, MapPin, Package, Star } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface Tour {
  id: number
  tourName: string
  slug: string
  description: string | null
  isActive: boolean
}

interface TourPackage {
  id: number
  packageName: string
  slug: string
  pricePerPerson: number | null
  pricePerChild: number | null
  baseCurrency: string
  minBooking: number | null
  maxBooking: number | null
  isFeatured: boolean
  tour?: Tour | null
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

export default function ToursPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}
    >
      <ToursPageInner />
    </Suspense>
  )
}

function ToursPageInner() {
  const [tours, setTours] = useState<Tour[]>([])
  const [packages, setPackages] = useState<TourPackage[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const view = (searchParams.get('view') || 'tours').toLowerCase()
  const isPackagesView = view === 'packages'
  const [showTourModal, setShowTourModal] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [editingTour, setEditingTour] = useState<Tour | null>(null)
  const [editingPackage, setEditingPackage] = useState<TourPackage | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const [tourForm, setTourForm] = useState({
    tourName: '',
    slug: '',
    description: '',
    isActive: true,
  })

  const [packageForm, setPackageForm] = useState({
    packageName: '',
    slug: '',
    tourId: '',
    baseCurrency: 'USD',
    minBooking: '',
    maxBooking: '',
    isFeatured: false,
  })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      const [tourRes, packageRes] = await Promise.all([
        fetch('/api/tours'),
        fetch('/api/tour-packages'),
      ])

      const tourData = await tourRes.json()
      const packageData = await packageRes.json()

      if (tourData.tours) setTours(tourData.tours)
      if (packageData.packages) setPackages(packageData.packages)
    } catch (error) {
      notify({ type: 'error', title: 'Load Data Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const resetTourForm = () => {
    setTourForm({
      tourName: '',
      slug: '',
      description: '',
      isActive: true,
    })
    setEditingTour(null)
  }

  const resetPackageForm = () => {
    setPackageForm({
      packageName: '',
      slug: '',
      tourId: '',
      baseCurrency: 'USD',
      minBooking: '',
      maxBooking: '',
      isFeatured: false,
    })
    setEditingPackage(null)
  }

  const openTourCreate = () => {
    resetTourForm()
    setShowTourModal(true)
  }

  const openPackageCreate = () => {
    resetPackageForm()
    setShowPackageModal(true)
  }

  const openTourEdit = (tour: Tour) => {
    setEditingTour(tour)
    setTourForm({
      tourName: tour.tourName,
      slug: tour.slug,
      description: tour.description || '',
      isActive: tour.isActive,
    })
    setShowTourModal(true)
  }

  const openPackageEdit = (pkg: TourPackage) => {
    setEditingPackage(pkg)
    setPackageForm({
      packageName: pkg.packageName,
      slug: pkg.slug,
      tourId: pkg.tour?.id ? String(pkg.tour.id) : '',
      baseCurrency: pkg.baseCurrency || 'USD',
      minBooking: pkg.minBooking !== null ? String(pkg.minBooking) : '',
      maxBooking: pkg.maxBooking !== null ? String(pkg.maxBooking) : '',
      isFeatured: pkg.isFeatured,
    })
    setShowPackageModal(true)
  }

  const handleSaveTour = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tourForm.tourName.trim()) {
      notify({ type: 'warning', title: 'Nama tour wajib diisi' })
      return
    }

    const payload = {
      ...tourForm,
      slug: tourForm.slug.trim() || slugify(tourForm.tourName),
      description: tourForm.description.trim() || null,
    }

    setSaving(true)
    try {
      const res = await fetch(editingTour ? `/api/tours/${editingTour.id}` : '/api/tours', {
        method: editingTour ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success || data.tour) {
        notify({ type: 'success', title: editingTour ? 'Tour Updated' : 'Tour Created' })
        setShowTourModal(false)
        resetTourForm()
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save tour' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!packageForm.packageName.trim()) {
      notify({ type: 'warning', title: 'Nama package wajib diisi' })
      return
    }
    if (!packageForm.tourId) {
      notify({ type: 'warning', title: 'Tour harus dipilih' })
      return
    }

    const payload = {
      ...packageForm,
      slug: packageForm.slug.trim() || slugify(packageForm.packageName),
      tourId: Number(packageForm.tourId),
      minBooking: packageForm.minBooking ? Number(packageForm.minBooking) : null,
      maxBooking: packageForm.maxBooking ? Number(packageForm.maxBooking) : null,
    }

    setSaving(true)
    try {
      const res = await fetch(editingPackage ? `/api/tour-packages/${editingPackage.id}` : '/api/tour-packages', {
        method: editingPackage ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success || data.package) {
        notify({ type: 'success', title: editingPackage ? 'Package Updated' : 'Package Created' })
        setShowPackageModal(false)
        resetPackageForm()
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save package' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTour = async (tour: Tour) => {
    if (!confirm(`Delete tour ${tour.tourName}?`)) return
    try {
      const res = await fetch(`/api/tours/${tour.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Tour Deleted' })
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to delete tour' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Error', message: String(error) })
    }
  }

  const handleDeletePackage = async (pkg: TourPackage) => {
    if (!confirm(`Delete package ${pkg.packageName}?`)) return
    try {
      const res = await fetch(`/api/tour-packages/${pkg.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Package Deleted' })
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to delete package' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Error', message: String(error) })
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
    <div className="space-y-6">
      <ModuleTabs moduleId="tours_packages" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tours & Packages</h1>
          <p className="text-gray-600 mt-1">Kelola master tour dan package.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isPackagesView ? (
            <Button onClick={openPackageCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          ) : (
            <Button onClick={openTourCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tour
            </Button>
          )}
        </div>
      </div>

      {isPackagesView ? (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Packages
            </h2>
          </div>
          <div className="space-y-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="border rounded-lg p-3 flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{pkg.packageName}</div>
                  <div className="text-xs text-gray-500">{pkg.slug}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {pkg.tour?.tourName || 'No Tour'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pkg.isFeatured && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-700 flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      Featured
                    </span>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openPackageEdit(pkg)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeletePackage(pkg)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {packages.length === 0 && (
              <div className="text-sm text-gray-500">Belum ada package.</div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              Tours
            </h2>
          </div>
          <div className="space-y-3">
            {tours.map((tour) => (
              <div key={tour.id} className="border rounded-lg p-3 flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{tour.tourName}</div>
                  <div className="text-xs text-gray-500">{tour.slug}</div>
                  {tour.description && (
                    <div className="text-xs text-gray-500 mt-1">{tour.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tour.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {tour.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => openTourEdit(tour)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteTour(tour)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {tours.length === 0 && (
              <div className="text-sm text-gray-500">Belum ada tour.</div>
            )}
          </div>
        </Card>
      )}

      <Dialog open={showTourModal} onOpenChange={setShowTourModal}>
        <DialogContent className="max-w-lg p-4">
          <DialogHeader>
            <DialogTitle>
              {editingTour ? 'Edit Tour' : 'Add Tour'}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSaveTour}>
            <div className="space-y-1">
              <Label>Nama Tour</Label>
              <Input
                value={tourForm.tourName}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    tourName: e.target.value,
                    slug: prev.slug ? prev.slug : slugify(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Slug</Label>
              <Input
                value={tourForm.slug}
                onChange={(e) =>
                  setTourForm((prev) => ({ ...prev, slug: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={tourForm.description}
                onChange={(e) =>
                  setTourForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox
                checked={tourForm.isActive}
                onChange={(e) =>
                  setTourForm((prev) => ({ ...prev, isActive: e.target.checked }))
                }
              />
              Aktif
            </label>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowTourModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
        <DialogContent className="max-w-2xl p-4">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? 'Edit Package' : 'Add Package'}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSavePackage}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Nama Package</Label>
                <Input
                  value={packageForm.packageName}
                  onChange={(e) =>
                    setPackageForm((prev) => ({
                      ...prev,
                      packageName: e.target.value,
                      slug: prev.slug ? prev.slug : slugify(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Slug</Label>
                <Input
                  value={packageForm.slug}
                  onChange={(e) =>
                    setPackageForm((prev) => ({ ...prev, slug: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Tour</Label>
                <Select
                  value={packageForm.tourId}
                  onChange={(e) =>
                    setPackageForm((prev) => ({ ...prev, tourId: e.target.value }))
                  }
                >
                  <option value="">Pilih tour</option>
                  {tours.map((tour) => (
                    <option key={tour.id} value={tour.id}>
                      {tour.tourName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Min Booking</Label>
                <Input
                  type="number"
                  value={packageForm.minBooking}
                  onChange={(e) =>
                    setPackageForm((prev) => ({ ...prev, minBooking: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Max Booking</Label>
                <Input
                  type="number"
                  value={packageForm.maxBooking}
                  onChange={(e) =>
                    setPackageForm((prev) => ({ ...prev, maxBooking: e.target.value }))
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <Checkbox
                checked={packageForm.isFeatured}
                onChange={(e) =>
                  setPackageForm((prev) => ({ ...prev, isFeatured: e.target.checked }))
                }
              />
              Featured
            </label>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowPackageModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
