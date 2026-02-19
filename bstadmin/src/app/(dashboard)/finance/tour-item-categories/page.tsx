'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleTabs } from '@/components/layout/module-tabs'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Edit, Trash2, Tags } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface TourItemCategory {
  id: number
  code: string
  name: string
  defaultDirection: string
  payeeMode: string
  autoDriverFromBooking: boolean
  isCommission: boolean
  allowRelatedItem: boolean
  requirePartner: boolean
  sortOrder: number | null
  isActive: boolean
}

const DIRECTION_OPTIONS = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
]
const PAYEE_OPTIONS = [
  { value: 'DRIVER_ONLY', label: 'Driver Only' },
  { value: 'PARTNER_ONLY', label: 'Partner Only' },
  { value: 'EITHER', label: 'Driver or Partner' },
  { value: 'NONE', label: 'None' },
]

const getDirectionLabel = (value: string) =>
  DIRECTION_OPTIONS.find((opt) => opt.value === value)?.label ?? value

const getPayeeLabel = (value: string) =>
  PAYEE_OPTIONS.find((opt) => opt.value === value)?.label ?? value

export default function FinanceTourItemCategoriesPage() {
  const [categories, setCategories] = useState<TourItemCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showWarning, setShowWarning] = useState(true)
  const [editingCategory, setEditingCategory] = useState<TourItemCategory | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    defaultDirection: 'EXPENSE',
    payeeMode: 'PARTNER_ONLY',
    autoDriverFromBooking: false,
    isCommission: false,
    allowRelatedItem: false,
    requirePartner: false,
    sortOrder: '',
    isActive: true,
  })

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/tour-item-categories?includeInactive=1')
      const data = await res.json()
      if (data.categories) {
        setCategories(data.categories)
      } else {
        notify({ type: 'error', title: 'Load Categories Failed', message: data.error || 'Unable to load categories.' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Load Categories Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      defaultDirection: 'EXPENSE',
      payeeMode: 'PARTNER_ONLY',
      autoDriverFromBooking: false,
      isCommission: false,
      allowRelatedItem: false,
      requirePartner: false,
      sortOrder: '',
      isActive: true,
    })
    setEditingCategory(null)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (category: TourItemCategory) => {
    setEditingCategory(category)
    setFormData({
      code: category.code,
      name: category.name,
      defaultDirection: category.defaultDirection,
      payeeMode: category.payeeMode,
      autoDriverFromBooking: category.autoDriverFromBooking,
      isCommission: category.isCommission,
      allowRelatedItem: category.allowRelatedItem,
      requirePartner: category.requirePartner,
      sortOrder: category.sortOrder !== null ? String(category.sortOrder) : '',
      isActive: category.isActive,
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code || !formData.name.trim()) {
      notify({ type: 'warning', title: 'Code and name are required' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        code: formData.code,
        name: formData.name.trim(),
        defaultDirection: formData.defaultDirection,
        payeeMode: formData.payeeMode,
        autoDriverFromBooking: formData.autoDriverFromBooking,
        isCommission: formData.isCommission,
        allowRelatedItem: formData.allowRelatedItem,
        requirePartner: formData.requirePartner,
        sortOrder: formData.sortOrder === '' ? null : Number(formData.sortOrder),
        isActive: formData.isActive,
      }

      const res = await fetch(
        editingCategory ? `/api/tour-item-categories/${editingCategory.id}` : '/api/tour-item-categories',
        {
          method: editingCategory ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      const data = await res.json()
      if (data.success || data.category) {
        notify({ type: 'success', title: editingCategory ? 'Tour Item Category Updated' : 'Tour Item Category Created' })
        setShowModal(false)
        resetForm()
        fetchCategories()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save category' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: TourItemCategory) => {
    if (!confirm(`Deactivate category ${category.name}?`)) return

    try {
      const res = await fetch(`/api/tour-item-categories/${category.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Category Deactivated' })
        fetchCategories()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to update category' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Error', message: String(error) })
    }
  }

  const usedCodes = useMemo(() => new Set(categories.map((category) => category.code)), [categories])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="master_rules" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tour Item Categories</h1>
          <p className="text-gray-600 mt-1">Manage tour item categories and finance logic rules.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tour Item Category
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <Card key={category.id} className="p-4 hover:shadow-md transition-shadow duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <Tags className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{category.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{category.code}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${category.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {category.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Default: {getDirectionLabel(category.defaultDirection)}
              </span>
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                Payee: {getPayeeLabel(category.payeeMode)}
              </span>
              {category.autoDriverFromBooking && (
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                  Auto Driver
                </span>
              )}
              {category.isCommission && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Commission
                </span>
              )}
              {category.allowRelatedItem && (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                  Related Item
                </span>
              )}
              {category.requirePartner && (
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                  Require Partner
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Sort order: {category.sortOrder ?? '-'}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(category)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleDelete(category)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Deactivate
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Tour Item Category' : 'Add Tour Item Category'}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Code</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="DESTINATION / SOUVENIR"
                  />
                  {!editingCategory && formData.code && usedCodes.has(formData.code) && (
                    <div className="text-[11px] text-amber-600">Code already exists.</div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Category label"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Default Direction</Label>
                  <Select
                    value={formData.defaultDirection}
                    onChange={(e) => setFormData({ ...formData, defaultDirection: e.target.value })}
                  >
                    {DIRECTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Payee Mode</Label>
                  <Select
                    value={formData.payeeMode}
                    onChange={(e) => setFormData({ ...formData, payeeMode: e.target.value })}
                  >
                    {PAYEE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                    placeholder="1, 2, 3..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.autoDriverFromBooking}
                    onChange={(e) => setFormData({ ...formData, autoDriverFromBooking: e.target.checked })}
                  />
                  Auto driver from booking
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.isCommission}
                    onChange={(e) => setFormData({ ...formData, isCommission: e.target.checked })}
                  />
                  Commission category
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.allowRelatedItem}
                    onChange={(e) => setFormData({ ...formData, allowRelatedItem: e.target.checked })}
                  />
                  Allow related item (commission link)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.requirePartner}
                    onChange={(e) => setFormData({ ...formData, requirePartner: e.target.checked })}
                  />
                  Require partner in templates
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  Active
                </label>
              </div>
              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent
          className="max-w-lg p-5"
          showClose={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Important: Finance Logic Warning</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These categories are tied to core finance logic. Creating, editing, or deactivating categories can
            affect finance validation, settlements, and reporting. Proceed only if you understand the impact.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowWarning(false)}>I Understand</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
