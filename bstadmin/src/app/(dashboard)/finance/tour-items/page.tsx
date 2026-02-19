'use client'

import { useEffect, useState } from 'react'
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
import { Plus, Edit, Trash2, ClipboardCheck, Users } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { canPartner, getPayeeLabel } from '@/lib/finance/payee'

interface Partner {
  id: number
  name: string
}

interface ServiceItem {
  id: number
  name: string
  financeCategoryId?: number | null
  tourItemCategoryId?: number | null
  financeCategoryRef?: {
    id: number
    code: string
    name: string
    payeeMode: string
  } | null
  tourItemCategoryRef?: {
    id: number
    code: string
    name: string
    payeeMode: string
  } | null
  isActive: boolean
  partners: Partner[]
  drivers: { id: number; name: string }[]
  defaultPartnerId?: number | null
  defaultPartner?: Partner | null
}

interface CategoryOption {
  id: number
  code: string
  name: string
  payeeMode: string
}

const formatCategory = (item: ServiceItem) =>
  item.financeCategoryRef?.name || item.tourItemCategoryRef?.name || 'Uncategorized'

export default function FinanceTourItemsPage() {
  const [items, setItems] = useState<ServiceItem[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const [formData, setFormData] = useState({
    name: '',
    tourItemCategoryId: '',
    isActive: true,
    partnerIds: [] as number[],
    defaultPartnerId: '',
  })

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      const [itemsRes, partnersRes, categoriesRes] = await Promise.all([
        fetch('/api/service-items'),
        fetch('/api/partners'),
        fetch('/api/tour-item-categories'),
      ])

      const itemsData = await itemsRes.json()
      const partnersData = await partnersRes.json()
      const categoriesData = await categoriesRes.json()

      if (itemsData.items) setItems(itemsData.items)
      if (partnersData.partners) setPartners(partnersData.partners)
      if (categoriesData.categories) setCategories(categoriesData.categories)
    } catch (error) {
      notify({ type: 'error', title: 'Load Tour Items Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      tourItemCategoryId: '',
      isActive: true,
      partnerIds: [],
      defaultPartnerId: '',
    })
    setEditingItem(null)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (item: ServiceItem) => {
    const categoryRef = item.financeCategoryRef || item.tourItemCategoryRef
    const partnerAllowed = canPartner(categoryRef?.payeeMode)
    const isDriverOnly = !partnerAllowed
    const autoDefaultPartnerId =
      !isDriverOnly && item.partners.length === 1 ? String(item.partners[0].id) : ''
    const categoryId = item.financeCategoryId ?? item.tourItemCategoryId
    setEditingItem(item)
    setFormData({
      name: item.name,
      tourItemCategoryId: categoryId ? String(categoryId) : '',
      isActive: item.isActive,
      partnerIds: item.partners.map((p) => p.id),
      defaultPartnerId: isDriverOnly
        ? ''
        : item.defaultPartnerId
          ? String(item.defaultPartnerId)
          : autoDefaultPartnerId,
    })
    setShowModal(true)
  }

  const toggleSelection = (list: number[], value: number) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      notify({ type: 'warning', title: 'Item name is required' })
      return
    }

    setSaving(true)
    try {
      const resolvedCategoryId = formData.tourItemCategoryId || null
      const payload = {
        ...formData,
        financeCategoryId: resolvedCategoryId,
        tourItemCategoryId: resolvedCategoryId,
      }
      const res = await fetch(editingItem ? `/api/service-items/${editingItem.id}` : '/api/service-items', {
        method: editingItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success || data.item) {
        notify({ type: 'success', title: editingItem ? 'Item Updated' : 'Item Created' })
        setShowModal(false)
        resetForm()
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save item' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: ServiceItem) => {
    if (!confirm(`Delete item ${item.name}?`)) return

    try {
      const res = await fetch(`/api/service-items/${item.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Item Deleted' })
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to delete item' })
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
      <ModuleTabs moduleId="master_rules" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tour Items</h1>
          <p className="text-gray-600 mt-1">Master list of cost/commission items used in templates.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const partnerAllowed = canPartner(item.tourItemCategoryRef?.payeeMode)
          return (
          <Card key={item.id} className="p-4 hover:shadow-md transition-shadow duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{formatCategory(item)}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {item.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>
                {item.partners.length} partners • Default:{' '}
                {getPayeeLabel({
                  payeeMode: item.tourItemCategoryRef?.payeeMode,
                  partnerName: item.defaultPartner?.name,
                })}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleDelete(item)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </Card>
          )
        })}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Tour Item' : 'Add Tour Item'}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Item Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Transport / Lunch / Ticket"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                  value={formData.tourItemCategoryId}
                  onChange={(e) => {
                    const nextCategoryId = e.target.value
                    const nextCategory = categories.find((cat) => String(cat.id) === nextCategoryId)
                    setFormData({
                      ...formData,
                      tourItemCategoryId: nextCategoryId,
                      defaultPartnerId:
                        nextCategory?.payeeMode === 'PARTNER_ONLY' || nextCategory?.payeeMode === 'EITHER'
                          ? formData.defaultPartnerId
                          : '',
                    })
                  }}
                  >
                    <option value="">Select category</option>
                    {categories.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
                  <Checkbox
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                  />
                  Active
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Default Partner</Label>
                  <Select
                    value={formData.defaultPartnerId}
                    disabled={
                      !canPartner(
                        categories.find((cat) => String(cat.id) === formData.tourItemCategoryId)?.payeeMode || null
                      )
                    }
                    onChange={(e) => {
                      const nextDefault = e.target.value
                      setFormData((prev) => {
                        const nextPartnerIds = nextDefault
                          ? Array.from(new Set([...prev.partnerIds, Number(nextDefault)]))
                          : prev.partnerIds
                        return { ...prev, defaultPartnerId: nextDefault, partnerIds: nextPartnerIds }
                      })
                    }}
                  >
                    <option value="">
                      {getPayeeLabel({
                        payeeMode: categories.find((cat) => String(cat.id) === formData.tourItemCategoryId)?.payeeMode,
                        placeholder: 'Select default partner',
                      })}
                    </option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </Select>
                  {canPartner(
                    categories.find((cat) => String(cat.id) === formData.tourItemCategoryId)?.payeeMode || null
                  ) &&
                    !formData.defaultPartnerId && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Set a default partner so templates auto-fill.
                    </div>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Related Partners</Label>
                  <div className="max-h-36 overflow-y-auto border rounded-md p-2 space-y-2">
                    {partners.length === 0 ? (
                      <div className="text-xs text-gray-500">No partners yet</div>
                    ) : (
                      partners.map((partner) => (
                        <label key={partner.id} className="flex items-center gap-2 text-sm text-gray-700">
                          <Checkbox
                            checked={formData.partnerIds.includes(partner.id)}
                            onChange={() =>
                              setFormData((prev) => {
                                const nextPartnerIds = toggleSelection(prev.partnerIds, partner.id)
                                const isDefault = String(partner.id) === prev.defaultPartnerId
                                return {
                                  ...prev,
                                  partnerIds: nextPartnerIds,
                                  defaultPartnerId: isDefault && !nextPartnerIds.includes(partner.id) ? '' : prev.defaultPartnerId,
                                }
                              })
                            }
                          />
                          {partner.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
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
    </div>
  )
}
