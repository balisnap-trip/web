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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Edit, Trash2, Shapes, ChevronDown, ChevronUp } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { UNIT_OPTIONS } from '@/lib/finance/constants'
import { canPartner, getPayeeLabel, isPartnerRequired } from '@/lib/finance/payee'

interface TourPackage {
  id: number
  packageName: string
  tour?: { tourName: string } | null
}

interface ServiceItem {
  id: number
  name: string
  tourItemCategoryRef?: { id: number; name: string; payeeMode: string; requirePartner: boolean } | null
  defaultPartnerId?: number | null
  partners?: Partner[]
}

interface Partner {
  id: number
  name: string
}

interface PatternItemForm {
  serviceItemId: string
  defaultPartnerId: string
  defaultUnitType: string
  defaultQty: number
  defaultPrice: number
  position: number
}

interface Pattern {
  id: number
  name: string
  isActive: boolean
  package: TourPackage
  items: {
    id: number
    serviceItemId: number
    serviceItem: ServiceItem
    defaultPartnerId: number | null
    defaultPartner?: Partner | null
    defaultUnitType: string
    defaultQty: number
    defaultPrice: number
  }[]
}

const formatCategory = (service?: ServiceItem | null) =>
  service?.tourItemCategoryRef?.name || '-'

export default function FinancePatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [packages, setPackages] = useState<TourPackage[]>([])
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null)
  const [expandedPatternIds, setExpandedPatternIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const [formData, setFormData] = useState({
    name: '',
    packageId: '',
    isActive: true,
    items: [] as PatternItemForm[],
  })
  const NO_PARTNER_VALUE = 'NO_PARTNER'

  const serviceOptions = useMemo(() => {
    const map = new Map<number, ServiceItem>()
    serviceItems.forEach((service) => map.set(service.id, service))
    if (editingPattern) {
      editingPattern.items.forEach((item) => {
        if (!map.has(item.serviceItemId)) {
          map.set(item.serviceItemId, item.serviceItem)
        }
      })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [serviceItems, editingPattern])

  const findServiceById = (id: number) => {
    const direct = serviceItems.find((serviceItem) => serviceItem.id === id)
    if (direct) return direct
    if (!editingPattern) return undefined
    const fallback = editingPattern.items.find((item) => item.serviceItemId === id)
    return fallback?.serviceItem
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    try {
      const [patternRes, packageRes, serviceRes, partnerRes] = await Promise.all([
        fetch('/api/finance/patterns'),
        fetch('/api/tour-packages'),
        fetch('/api/service-items'),
        fetch('/api/partners'),
      ])

      const patternData = await patternRes.json()
      const packageData = await packageRes.json()
      const serviceData = await serviceRes.json()
      const partnerData = await partnerRes.json()

      if (patternData.patterns) setPatterns(patternData.patterns)
      if (packageData.packages) setPackages(packageData.packages)
      if (serviceData.items) setServiceItems(serviceData.items)
      if (partnerData.partners) setPartners(partnerData.partners)
    } catch (error) {
      notify({ type: 'error', title: 'Load Templates Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      packageId: '',
      isActive: true,
      items: [],
    })
    setEditingPattern(null)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (pattern: Pattern) => {
    setEditingPattern(pattern)
    setFormData({
      name: pattern.name,
      packageId: String(pattern.package?.id || ''),
      isActive: pattern.isActive,
      items: pattern.items.map((item, index) => {
        const service = findServiceById(item.serviceItemId)
        const partnerAllowed = canPartner(service?.tourItemCategoryRef?.payeeMode)
        const autoPartnerId = partnerAllowed
          ? service?.defaultPartnerId
            ? String(service.defaultPartnerId)
            : service?.partners && service.partners.length === 1
              ? String(service.partners[0].id)
              : ''
          : ''
        return {
          serviceItemId: String(item.serviceItemId),
          defaultPartnerId: partnerAllowed
            ? item.defaultPartnerId
              ? String(item.defaultPartnerId)
              : autoPartnerId || NO_PARTNER_VALUE
            : '',
          defaultUnitType: item.defaultUnitType,
          defaultQty: item.defaultQty,
          defaultPrice: item.defaultPrice,
          position: index,
        }
      }),
    })
    setShowModal(true)
  }

  const handleAddItem = () => {
    const firstService = serviceItems[0]
    const partnerAllowed = canPartner(firstService?.tourItemCategoryRef?.payeeMode)
    const autoPartnerId =
      firstService && partnerAllowed
        ? firstService.defaultPartnerId
          ? String(firstService.defaultPartnerId)
          : firstService.partners?.length === 1
            ? String(firstService.partners[0].id)
            : ''
        : ''
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          serviceItemId: firstService?.id ? String(firstService.id) : '',
          defaultPartnerId: partnerAllowed ? (autoPartnerId || NO_PARTNER_VALUE) : '',
          defaultUnitType: 'PER_BOOKING',
          defaultQty: 1,
          defaultPrice: 0,
          position: prev.items.length,
        },
      ],
    }))
  }

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index).map((item, idx) => ({ ...item, position: idx })),
    }))
  }

  const updateItem = (index: number, patch: Partial<PatternItemForm>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.packageId) {
      notify({ type: 'warning', title: 'Name and package are required' })
      return
    }

    if (formData.items.length === 0) {
      notify({ type: 'warning', title: 'Add at least 1 item' })
      return
    }

    const resolvedItems = formData.items.map((item) => {
      const service = findServiceById(Number(item.serviceItemId))
      const partnerAllowed = canPartner(service?.tourItemCategoryRef?.payeeMode)
      if (!service || !partnerAllowed) return item
      if (item.defaultPartnerId) return item
      const fallbackPartnerId =
        service.defaultPartnerId
          ? String(service.defaultPartnerId)
          : service.partners && service.partners.length === 1
            ? String(service.partners[0].id)
            : ''
      return {
        ...item,
        defaultPartnerId: fallbackPartnerId || NO_PARTNER_VALUE,
      }
    })

      const missingPartner = resolvedItems.some((item) => {
        const service = findServiceById(Number(item.serviceItemId))
        if (!service) return false
        if (
          !isPartnerRequired(service.tourItemCategoryRef?.payeeMode, service.tourItemCategoryRef?.requirePartner)
        ) {
          return false
        }
        return !item.defaultPartnerId
      })

    if (missingPartner) {
      notify({ type: 'warning', title: 'Partner is required for non-transport items' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...formData,
        packageId: parseInt(formData.packageId),
        items: resolvedItems.map((item, index) => ({
          ...item,
          defaultPartnerId: item.defaultPartnerId === NO_PARTNER_VALUE ? null : item.defaultPartnerId || null,
          defaultQty: Number(item.defaultQty),
          defaultPrice: Number(item.defaultPrice),
          position: index,
        })),
      }

      const res = await fetch(editingPattern ? `/api/finance/patterns/${editingPattern.id}` : '/api/finance/patterns', {
        method: editingPattern ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success || data.pattern) {
        notify({ type: 'success', title: editingPattern ? 'Template Updated' : 'Template Created' })
        setShowModal(false)
        resetForm()
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save template' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (pattern: Pattern) => {
    if (!confirm(`Delete template ${pattern.name}?`)) return

    try {
      const res = await fetch(`/api/finance/patterns/${pattern.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Template Deleted' })
        fetchAll()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to delete template' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete Error', message: String(error) })
    }
  }

  const toggleExpanded = (patternId: number) => {
    setExpandedPatternIds((prev) =>
      prev.includes(patternId) ? prev.filter((id) => id !== patternId) : [...prev, patternId]
    )
  }

  const packageOptions = useMemo(
    () => packages.map((pkg) => ({
      value: String(pkg.id),
      label: `${pkg.tour?.tourName ? `${pkg.tour.tourName} • ` : ''}${pkg.packageName}`,
    })),
    [packages]
  )

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Templates</h1>
          <p className="text-gray-600 mt-1">Templates for tour costs per package.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      <div className="space-y-4">
        {patterns.map((pattern) => (
          <Card key={pattern.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <Shapes className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{pattern.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {pattern.package?.tour?.tourName ? `${pattern.package.tour.tourName} • ` : ''}
                    {pattern.package?.packageName}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${pattern.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {pattern.isActive ? 'Active' : 'Inactive'}
                </span>
                <Button variant="outline" size="sm" onClick={() => toggleExpanded(pattern.id)}>
                  {expandedPatternIds.includes(pattern.id) ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {expandedPatternIds.includes(pattern.id) && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-500">Items</div>
                <div className="border rounded-lg overflow-hidden">
                  <Table className="text-sm">
                    <TableHeader className="bg-gray-50 text-gray-600">
                      <TableRow>
                        <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Item</TableHead>
                        <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Partner</TableHead>
                        <TableHead className="px-3 py-2 normal-case tracking-normal text-gray-600">Unit</TableHead>
                        <TableHead className="px-3 py-2 text-right normal-case tracking-normal text-gray-600">Qty</TableHead>
                        <TableHead className="px-3 py-2 text-right normal-case tracking-normal text-gray-600">Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pattern.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="px-3 py-2">
                            <div className="font-medium text-gray-800">{item.serviceItem.name}</div>
                            <div className="text-xs text-gray-500">{formatCategory(item.serviceItem)}</div>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-xs text-gray-600">
                            {getPayeeLabel({
                              payeeMode: item.serviceItem.tourItemCategoryRef?.payeeMode,
                              partnerName: item.defaultPartner?.name,
                            })}
                          </TableCell>
                          <TableCell className="px-3 py-2">{item.defaultUnitType}</TableCell>
                          <TableCell className="px-3 py-2 text-right">{item.defaultQty}</TableCell>
                          <TableCell className="px-3 py-2 text-right">{item.defaultPrice.toLocaleString('en-US')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(pattern)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(pattern)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle>
              {editingPattern ? 'Edit Cost Template' : 'Add Cost Template'}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Template Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Pattern A-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Package</Label>
                  <Select
                    value={formData.packageId}
                    onChange={(e) => setFormData({ ...formData, packageId: e.target.value })}
                  >
                    <option value="">Select package</option>
                    {packageOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.items.length === 0 && (
                    <div className="text-xs text-gray-500">No items yet. Add at least 1 item.</div>
                  )}
                  {formData.items.map((item, index) => {
                    const selectedService = serviceOptions.find((service) => String(service.id) === item.serviceItemId)
                    const partnerAllowed = canPartner(selectedService?.tourItemCategoryRef?.payeeMode)
                    const partnerOptions = selectedService?.partners ?? partners
                    const autoPartnerId =
                      partnerAllowed && selectedService
                        ? selectedService.defaultPartnerId
                          ? String(selectedService.defaultPartnerId)
                          : selectedService.partners?.length === 1
                            ? String(selectedService.partners[0].id)
                            : ''
                        : ''
                    return (
                    <div key={index} className="grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-8">
                      <div className="md:col-span-2">
                        <Label className="text-xs">Item</Label>
                        <Select
                          value={item.serviceItemId}
                            onChange={(e) => {
                              const nextId = e.target.value
                              const nextService = serviceOptions.find((service) => String(service.id) === nextId)
                              const nextPartnerAllowed = canPartner(nextService?.tourItemCategoryRef?.payeeMode)
                              const nextAutoPartnerId =
                                nextService && nextPartnerAllowed
                                  ? nextService.defaultPartnerId
                                    ? String(nextService.defaultPartnerId)
                                    : nextService.partners?.length === 1
                                      ? String(nextService.partners[0].id)
                                      : ''
                                  : ''
                              updateItem(index, {
                                serviceItemId: nextId,
                                defaultPartnerId:
                                  nextPartnerAllowed
                                    ? nextAutoPartnerId || item.defaultPartnerId || NO_PARTNER_VALUE
                                    : '',
                              })
                            }}
                        >
                          {serviceOptions.map((service) => (
                            <option key={service.id} value={service.id}>
                            {service.name} ({formatCategory(service)})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Partner</Label>
                          <Select
                            value={item.defaultPartnerId || autoPartnerId || NO_PARTNER_VALUE}
                            onChange={(e) => updateItem(index, { defaultPartnerId: e.target.value })}
                            disabled={!partnerAllowed}
                          >
                            <option value="">
                              {getPayeeLabel({
                                payeeMode: selectedService?.tourItemCategoryRef?.payeeMode,
                                placeholder: 'Select partner',
                              })}
                            </option>
                            <option value={NO_PARTNER_VALUE}>No partner</option>
                            {partnerOptions.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.name}
                              </option>
                            ))}
                          </Select>
                        {partnerAllowed && !item.defaultPartnerId && (
                          <div className="mt-1 text-[11px] text-amber-600">
                            Select a partner to save this template.
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <Select
                          value={item.defaultUnitType}
                          onChange={(e) => updateItem(index, { defaultUnitType: e.target.value })}
                        >
                          {UNIT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={item.defaultQty}
                          onChange={(e) => updateItem(index, { defaultQty: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          value={item.defaultPrice}
                          onChange={(e) => updateItem(index, { defaultPrice: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleRemoveItem(index)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  )})}
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
