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
import { Textarea } from '@/components/ui/textarea'
import { Plus, Edit, Trash2, Phone, User, Store } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'

interface Partner {
  id: number
  name: string
  category: string | null
  financeCategoryId?: number | null
  tourItemCategoryId: number | null
  financeCategoryRef?: { id: number; code: string; name: string } | null
  tourItemCategoryRef?: { id: number; code: string; name: string } | null
  picName: string | null
  picWhatsapp: string | null
  isActive: boolean
  notes: string | null
}

interface CategoryOption {
  id: number
  code: string
  name: string
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

const formatCategory = (partner: Partner) =>
  partner.financeCategoryRef?.name ||
  partner.tourItemCategoryRef?.name ||
  (partner.category ? partner.category : 'Other')

export default function FinancePartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [partnerTemplates, setPartnerTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [templateLoading, setTemplateLoading] = useState(true)
  const [templateSavingKey, setTemplateSavingKey] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const [formData, setFormData] = useState({
    name: '',
    tourItemCategoryId: '',
    picName: '',
    picWhatsapp: '',
    notes: '',
    isActive: true,
  })

  useEffect(() => {
    fetchPartners()
  }, [])

  const fetchPartners = async () => {
    try {
      const [partnerRes, categoryRes] = await Promise.all([
        fetch('/api/partners'),
        fetch('/api/tour-item-categories'),
      ])
      const templateRes = await fetch('/api/whatsapp/templates?scope=partner')
      const partnerData = await partnerRes.json()
      const categoryData = await categoryRes.json()
      const templateData = await templateRes.json()
      if (partnerData.partners) {
        setPartners(partnerData.partners)
      } else {
        notify({ type: 'error', title: 'Load Partners Failed', message: partnerData.error || 'Unable to load partners.' })
      }
      if (categoryData.categories) {
        setCategories(categoryData.categories)
      }
      if (templateData.templates) {
        setPartnerTemplates(templateData.templates)
      } else {
        notify({ type: 'error', title: 'Load WA Templates Failed', message: templateData.error || 'Unable to load partner templates.' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Load Partners Error', message: String(error) })
    } finally {
      setLoading(false)
      setTemplateLoading(false)
    }
  }

  const updatePartnerTemplateXml = (key: string, xml: string) => {
    setPartnerTemplates((prev) =>
      prev.map((item) => (item.key === key ? { ...item, xml } : item))
    )
  }

  const savePartnerTemplate = async (template: WhatsAppTemplate) => {
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
        fetchPartners()
      } else {
        notify({ type: 'error', title: 'Save Template Failed', message: data.error || 'Unable to save template' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Template Error', message: String(error) })
    } finally {
      setTemplateSavingKey(null)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      tourItemCategoryId: '',
      picName: '',
      picWhatsapp: '',
      notes: '',
      isActive: true,
    })
    setEditingPartner(null)
  }

  const openCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const openEdit = (partner: Partner) => {
    const categoryId = partner.financeCategoryId ?? partner.tourItemCategoryId
    setEditingPartner(partner)
    setFormData({
      name: partner.name,
      tourItemCategoryId: categoryId ? String(categoryId) : '',
      picName: partner.picName || '',
      picWhatsapp: partner.picWhatsapp || '',
      notes: partner.notes || '',
      isActive: partner.isActive,
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      notify({ type: 'warning', title: 'Partner name is required' })
      return
    }

    setSaving(true)
    try {
      const resolvedCategoryId = formData.tourItemCategoryId || null
      const payload = {
        ...formData,
        financeCategoryId: resolvedCategoryId,
        tourItemCategoryId: resolvedCategoryId,
        picName: formData.picName || null,
        picWhatsapp: formData.picWhatsapp || null,
        notes: formData.notes || null,
      }

      const res = await fetch(editingPartner ? `/api/partners/${editingPartner.id}` : '/api/partners', {
        method: editingPartner ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success || data.partner) {
        notify({ type: 'success', title: editingPartner ? 'Partner Updated' : 'Partner Created' })
        setShowModal(false)
        resetForm()
        fetchPartners()
      } else {
        notify({ type: 'error', title: 'Save Failed', message: data.error || 'Unable to save partner' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Error', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (partner: Partner) => {
    if (!confirm(`Delete partner ${partner.name}?`)) return

    try {
      const res = await fetch(`/api/partners/${partner.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Partner Deleted' })
        fetchPartners()
      } else {
        notify({ type: 'error', title: 'Delete Failed', message: data.error || 'Unable to delete partner' })
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
      <ModuleTabs moduleId="networks" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partners / Service Providers</h1>
          <p className="text-gray-600 mt-1">Destinations, restaurants, and vendors.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Partner
        </Button>
      </div>

      <Card className="p-4">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900">WhatsApp XML Templates (Partner)</h2>
          <p className="text-sm text-gray-600">
            Template ini dipakai untuk pesan WA ke partner dari fitur kirim WA booking.
          </p>
        </div>

        {templateLoading ? (
          <div className="text-sm text-gray-600">Loading templates...</div>
        ) : partnerTemplates.length === 0 ? (
          <div className="text-sm text-gray-600">Template partner belum tersedia.</div>
        ) : (
          <div className="space-y-4">
            {partnerTemplates.map((template) => (
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
                  onChange={(e) => updatePartnerTemplateXml(template.key, e.target.value)}
                  className="min-h-56 font-mono text-xs"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => savePartnerTemplate(template)}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {partners.map((partner) => (
          <Card key={partner.id} className="p-4 hover:shadow-md transition-shadow duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <Store className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{partner.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{formatCategory(partner)}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${partner.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                {partner.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                <span>{partner.picName || 'PIC not set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{partner.picWhatsapp || 'WhatsApp not set'}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(partner)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => handleDelete(partner)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg p-4">
          <DialogHeader>
            <DialogTitle>
              {editingPartner ? 'Edit Partner' : 'Add Partner'}
            </DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
              <div className="space-y-1">
                <Label>Partner Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Destination / restaurant name"
                />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={formData.tourItemCategoryId}
                  onChange={(e) => setFormData({ ...formData, tourItemCategoryId: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>PIC Name</Label>
                  <Input
                    value={formData.picName}
                    onChange={(e) => setFormData({ ...formData, picName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>PIC WhatsApp</Label>
                  <Input
                    value={formData.picWhatsapp}
                    onChange={(e) => setFormData({ ...formData, picWhatsapp: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Catatan tambahan"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Checkbox
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                Active
              </label>

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
