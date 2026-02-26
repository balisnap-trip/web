'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { AlertCircle, Plus, Save, Lock, Unlock } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { UNIT_OPTIONS } from '@/lib/finance/constants'
import { BookingListPanel } from '@/app/(dashboard)/finance/validate/components/BookingListPanel'
import { FinanceSummaryCard } from '@/app/(dashboard)/finance/validate/components/FinanceSummaryCard'
import { CommissionSplitDialog } from '@/app/(dashboard)/finance/validate/components/CommissionSplitDialog'
import { useFinanceValidate } from '@/app/(dashboard)/finance/validate/hooks/use-finance-validate'

const COMMISSION_NAME_PREFIX = 'Commission - '

function getCommissionVendorFromName(nameSnapshot: string) {
  const raw = String(nameSnapshot || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower === 'commission') return ''
  if (lower.startsWith(COMMISSION_NAME_PREFIX.toLowerCase())) {
    return raw.slice(COMMISSION_NAME_PREFIX.length).trim()
  }
  const m = raw.match(/^commission\s*-\s*(.+)$/i)
  if (m) return m[1].trim()
  return raw
}

function parseNotesKeyNumber(notes: string | null | undefined, key: string): number | null {
  const raw = String(notes || '').trim()
  if (!raw) return null
  const parts = raw.split('|').map((p) => p.trim())
  const target = parts.find((p) => p.toLowerCase().startsWith(`${key.toLowerCase()}:`))
  if (!target) return null
  const digits = target.replace(/\D/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

function upsertNotesKey(notes: string | null | undefined, key: string, value: string) {
  const raw = String(notes || '').trim()
  const parts = raw
    ? raw
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  const lowerKey = key.toLowerCase()
  let found = false
  const nextParts = parts.map((p) => {
    if (p.toLowerCase().startsWith(`${lowerKey}:`)) {
      found = true
      return `${key}: ${value}`
    }
    return p
  })

  if (!found) nextParts.push(`${key}: ${value}`)
  return nextParts.join(' | ')
}

function removeNotesKey(notes: string | null | undefined, key: string) {
  const raw = String(notes || '').trim()
  if (!raw) return ''
  const lowerKey = key.toLowerCase()
  const nextParts = raw
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.toLowerCase().startsWith(`${lowerKey}:`))
  return nextParts.join(' | ')
}

export default function FinanceValidateClient() {
  const NO_PARTNER_VALUE = 'NO_PARTNER'
  const searchParams = useSearchParams()
  const initialBookingId = searchParams.get('bookingId')
  const {
    bookings,
    selectedBooking,
    items,
    loading,
    saving,
    savingDraft,
    statusFilter,
    showWarning,
    serviceItems,
    partners,
    drivers,
    categories,
    financeLocked,
    showNewServiceModal,
    showNewPartnerModal,
    savingServiceItem,
    savingPartner,
    payeeEditorOpen,
    newServiceForm,
    newPartnerForm,
    totals,
    STATUS_OPTIONS,
    DIRECTION_OPTIONS,
    DEFAULT_CATEGORY,
    resolveCategory,
    allowDriver,
    allowPartner,
    allowRelatedItem,
    isCommissionItem,
    setStatusFilter,
    handleSelectBooking,
    handleAddItem,
    appendItems,
    updateItem,
    togglePayeeEditor,
    handleRemoveItem,
    openNewServiceItem,
    openNewPartner,
    handleCreateServiceItem,
    handleCreatePartner,
    handleSaveDraft,
    handleValidate,
    handleToggleLock,
    setShowNewServiceModal,
    setShowNewPartnerModal,
    setPendingItemIndex,
    setPendingPartnerIndex,
    setNewServiceForm,
    setNewPartnerForm,
    setShowWarning,
  } = useFinanceValidate({ initialBookingId })
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false)
  const [commissionAdvancedOpen, setCommissionAdvancedOpen] = useState<Record<string, boolean>>({})

  const commissionCategory = useMemo(() => {
    return categories.find((c) => c.code === 'COMMISSION') || categories.find((c) => c.isCommission) || null
  }, [categories])

  if (loading && bookings.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
          Loading finance review...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="finances" />
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Finance Review
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">Finance Review</h1>
            <p className="mt-1 text-sm text-slate-600">Review actual costs and commissions, then validate.</p>
          </div>
          {selectedBooking ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-400">Active Booking</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {selectedBooking.bookingRef || `#${selectedBooking.id}`}
              </div>
              <div className="mt-2">
                <StatusBadge status={selectedBooking.status} className="text-[11px]" />
              </div>
              <div className="mt-1 text-xs text-slate-500">Tour Date: {formatDate(selectedBooking.tourDate)}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <BookingListPanel
          bookings={bookings}
          selectedBookingId={selectedBooking?.id ?? null}
          statusFilter={statusFilter}
          statusOptions={STATUS_OPTIONS}
          onStatusChange={setStatusFilter}
          onSelectBooking={handleSelectBooking}
        />

        <div className="space-y-4 w-full max-w-[1120px] 2xl:max-w-[1240px] xl:justify-self-start">
          {!selectedBooking ? (
            <Card className="p-6 text-sm text-slate-500">
              Select a booking on the left to start reviewing costs.
            </Card>
          ) : (
            <>
              <Card className="p-6 border-0 shadow-sm bg-gradient-to-br from-white to-slate-50">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="text-lg font-bold text-slate-900 truncate">
                        {selectedBooking.bookingRef || `#${selectedBooking.id}`}
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        {selectedBooking.numberOfAdult}A{selectedBooking.numberOfChild ? ` ${selectedBooking.numberOfChild}C` : ''}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="truncate">Guest: {selectedBooking.mainContactName || 'Not set'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="truncate">Tour Date: {formatDate(selectedBooking.tourDate)}</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="truncate">
                          {selectedBooking.package?.tour?.tourName ? `${selectedBooking.package.tour.tourName} • ` : ''}
                          {selectedBooking.package?.packageName}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleToggleLock} className="h-9">
                      {financeLocked ? <Unlock className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
                      {financeLocked ? 'Unlock' : 'Lock'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={savingDraft || financeLocked} className="h-9">
                      <Save className="mr-1 h-4 w-4" />
                      {savingDraft ? 'Saving...' : 'Save Draft'}
                    </Button>
                    <Button size="sm" onClick={handleValidate} disabled={saving || financeLocked} className="h-9">
                      <Save className="mr-1 h-4 w-4" />
                      {saving ? 'Validating...' : 'Validate'}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Cost Items</div>
                  <div className="text-xs text-slate-500">Add costs and commissions for this booking.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommissionDialogOpen(true)}
                    disabled={financeLocked || !selectedBooking || !commissionCategory}
                    title={!commissionCategory ? 'Commission category is missing' : undefined}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Commission
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleAddItem} disabled={financeLocked}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </div>
                <div className="mt-4 space-y-4">
                {items.map((item, index) => {
                    const category = resolveCategory(item)
                    const isCommission = isCommissionItem(item)
                    const isManual = Boolean(item.isManual)
                    const canDriver = allowDriver(category)
                    const canPartner = allowPartner(category)
                    const showDriver = canDriver
                    const directionSpan = showDriver ? 'lg:col-span-2' : 'lg:col-span-3'
                    const partnerSpan = isCommission ? 'lg:col-span-3' : showDriver ? 'lg:col-span-5' : 'lg:col-span-9'
                    const driverSpan = isCommission ? 'lg:col-span-3' : 'lg:col-span-5'
                    const relatedSpan = 'lg:col-span-4'
                    const itemKey = item.id ? `item-${item.id}` : `draft-${index}`
                    const isPayeeEditorOpen = Boolean(payeeEditorOpen[itemKey])
                    const unitLabel = UNIT_OPTIONS.find((opt) => opt.value === item.unitType)?.label || item.unitType
                    const partnerName = partners.find((partner) => partner.id === item.partnerId)?.name
                    const driverName = drivers.find((driver) => driver.id === item.driverId)?.name
                    const isEitherPayee = category.payeeMode === 'EITHER'
                    const categoryLabel =
                      item.tourItemCategoryNameSnapshot || category?.name || DEFAULT_CATEGORY.name
                    const showPayeeEditor = canPartner || canDriver
                    const changePayeeLabel = isCommission
                      ? 'Change Payee'
                      : category.payeeMode === 'DRIVER_ONLY'
                        ? 'Change Driver'
                        : 'Change Partner'
                    const payeeSummary = isCommission
                      ? [partnerName ? `Partner: ${partnerName}` : null, driverName ? `Driver: ${driverName}` : null]
                          .filter(Boolean)
                          .join(' • ') || 'No payee'
                      : category.payeeMode === 'NONE'
                        ? 'No payee'
                      : category.payeeMode === 'DRIVER_ONLY'
                        ? driverName || 'Unassigned driver'
                        : partnerName || 'No partner'

                  if (!isManual) {
                    return (
                      <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{item.nameSnapshot || 'Untitled Item'}</div>
                              <div className="text-xs text-slate-500">{categoryLabel}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                              {item.direction === 'INCOME' ? 'Income' : 'Expense'}
                            </span>
                              {showPayeeEditor && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => togglePayeeEditor(itemKey)}
                                  disabled={financeLocked}
                                >
                                  {isPayeeEditorOpen ? 'Hide Payee' : changePayeeLabel}
                                </Button>
                              )}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                          <div className="lg:col-span-4">
                            <Label className="text-xs text-slate-500">Unit</Label>
                            <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {unitLabel}
                            </div>
                          </div>
                          <div className="lg:col-span-2">
                            <Label className="text-xs text-slate-500">Qty</Label>
                            <Input
                              type="number"
                              className="mt-1"
                              value={item.unitQty}
                              onChange={(e) => updateItem(index, { unitQty: Number(e.target.value) })}
                              disabled={financeLocked}
                            />
                          </div>
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">Amount (IDR)</Label>
                            <Input
                              type="number"
                              className="mt-1"
                              value={item.amount}
                              onChange={(e) => updateItem(index, { amount: Number(e.target.value) })}
                              disabled={financeLocked}
                            />
                          </div>
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">Payee</Label>
                            <div className="mt-1 text-sm text-slate-700">{payeeSummary}</div>
                          </div>
                        </div>

                        {isPayeeEditorOpen && (
                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                              {canPartner && (
                              <div className="lg:col-span-6">
                                <Label className="text-xs text-slate-500">Partner</Label>
                                <Select
                                  className="mt-1"
                                  value={item.partnerId ?? NO_PARTNER_VALUE}
                                  disabled={financeLocked}
                                  onChange={(e) => {
                                    const nextPartner =
                                      e.target.value === NO_PARTNER_VALUE || e.target.value === ''
                                        ? null
                                        : Number(e.target.value)
                                      updateItem(index, {
                                        partnerId: nextPartner,
                                        driverId: isEitherPayee && nextPartner ? null : item.driverId,
                                      })
                                  }}
                                >
                                  <option value="">-</option>
                                  <option value={NO_PARTNER_VALUE}>No partner</option>
                                  {partners.map((partner) => (
                                    <option key={partner.id} value={partner.id}>
                                      {partner.name}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            )}
                              {canDriver && (
                              <div className="lg:col-span-6">
                                <Label className="text-xs text-slate-500">Driver</Label>
                                <Select
                                  className="mt-1"
                                  value={item.driverId || ''}
                                  disabled={financeLocked}
                                  onChange={(e) => {
                                    const nextDriver = e.target.value ? Number(e.target.value) : null
                                  updateItem(index, {
                                    driverId: nextDriver,
                                    partnerId: isEitherPayee && nextDriver ? null : item.partnerId,
                                  })
                                  }}
                                >
                                  <option value="">-</option>
                                  {drivers.map((driver) => (
                                    <option key={driver.id} value={driver.id}>
                                      {driver.name}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            )}
                              {allowRelatedItem(item) && (
                              <div className="lg:col-span-12">
                                <Label className="text-xs text-slate-500">Related Item</Label>
                                <Select
                                  className="mt-1"
                                  value={item.relatedItemId || ''}
                                  disabled={financeLocked}
                                  onChange={(e) =>
                                    updateItem(index, {
                                      relatedItemId: e.target.value ? Number(e.target.value) : null,
                                      relationType: e.target.value ? 'COMMISSION_FOR' : null,
                                    })
                                  }
                                >
                                  <option value="">-</option>
                                  {items
                                    .filter((_, i) => i !== index)
                                    .filter((other) => Boolean(other.id))
                                    .map((other) => (
                                      <option key={other.id} value={other.id}>
                                        {other.nameSnapshot}
                                      </option>
                                    ))}
                                </Select>
                              </div>
                            )}
                          </div>
                        )}

                          {allowRelatedItem(item) && (
                          <div className="mt-4">
                            <Label className="text-xs text-slate-500">Commission Note</Label>
                            <Input
                              className="mt-1"
                              value={item.notes || ''}
                              onChange={(e) => updateItem(index, { notes: e.target.value })}
                              placeholder="e.g. 50/50 split with driver"
                              disabled={financeLocked}
                            />
                          </div>
                        )}

                        <div className="mt-4 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            disabled={financeLocked}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  if (isCommission) {
                    const vendorValue = getCommissionVendorFromName(item.nameSnapshot)
                    const gross = parseNotesKeyNumber(item.notes, 'Gross')
                    const amount = Number(item.amount || 0)
                    const driverGets = gross !== null ? gross - amount : null
                    const invalidSplit = gross !== null && amount > gross
                    const directionBadge = item.direction === 'INCOME' ? 'Comm In (Collect)' : 'Comm Out (Pay)'
                    const amountLabel = item.direction === 'INCOME' ? 'Company Takes (IDR)' : 'Company Pays (IDR)'
                    const driverLabel = item.direction === 'INCOME' ? 'Driver (collector)' : 'Driver (payee)'
                    const isAdvancedOpen = Boolean(commissionAdvancedOpen[itemKey])

                    return (
                      <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900">{item.nameSnapshot || 'Commission'}</div>
                            <div className="text-xs text-slate-500">{categoryLabel}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                              {directionBadge}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setCommissionAdvancedOpen((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }))
                              }
                              disabled={financeLocked}
                            >
                              {isAdvancedOpen ? 'Hide' : 'Advanced'}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                          <div className="lg:col-span-6">
                            <Label className="text-xs text-slate-500">Vendor / Source (not saved as Partner)</Label>
                            <Input
                              className="mt-1"
                              value={vendorValue}
                              onChange={(e) => {
                                const nextVendor = e.target.value
                                const nextName = nextVendor.trim()
                                  ? `${COMMISSION_NAME_PREFIX}${nextVendor.trim()}`
                                  : 'Commission'
                                updateItem(index, { nameSnapshot: nextName })
                              }}
                              placeholder="Satria Kopi"
                              disabled={financeLocked}
                            />
                          </div>
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">Gross (IDR)</Label>
                            <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {gross !== null ? formatCurrency(gross, 'IDR') : <span className="text-slate-400">-</span>}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">Informational only (from notes).</div>
                          </div>
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">{amountLabel}</Label>
                            <Input
                              type="number"
                              className="mt-1"
                              value={item.amount}
                              onChange={(e) => updateItem(index, { amount: Number(e.target.value) })}
                              disabled={financeLocked}
                            />
                            {invalidSplit ? (
                              <div className="mt-1 text-[11px] text-rose-700">Company takes cannot exceed gross.</div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">Direction</Label>
                            <Select
                              className="mt-1"
                              value={item.direction}
                              disabled={financeLocked}
                              onChange={(e) => updateItem(index, { direction: e.target.value })}
                            >
                              <option value="INCOME">Comm In (Collect from driver)</option>
                              <option value="EXPENSE">Comm Out (Pay to driver)</option>
                            </Select>
                          </div>
                          <div className="lg:col-span-3">
                            <Label className="text-xs text-slate-500">{driverLabel}</Label>
                            <Select
                              className="mt-1"
                              value={item.driverId || ''}
                              disabled={financeLocked}
                              onChange={(e) => {
                                const nextDriver = e.target.value ? Number(e.target.value) : null
                                updateItem(index, { driverId: nextDriver, partnerId: null })
                              }}
                            >
                              <option value="">-</option>
                              {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name}
                                </option>
                              ))}
                            </Select>
                            {!item.driverId && Number(item.amount || 0) > 0 && (
                              <div className="mt-1 text-[11px] text-amber-700">
                                Driver is required when amount &gt; 0.
                              </div>
                            )}
                          </div>
                          <div className="lg:col-span-6">
                            <Label className="text-xs text-slate-500">Split (preview)</Label>
                            <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {gross !== null ? (
                                <>
                                  <span className="font-medium">Company:</span> {formatCurrency(amount, 'IDR')}
                                  <span className="mx-2 text-slate-400">|</span>
                                  <span className="font-medium">Driver:</span>{' '}
                                  {formatCurrency(driverGets ?? 0, 'IDR')}
                                </>
                              ) : (
                                <span className="text-slate-500">Fill gross in the Commission modal to see split preview.</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isAdvancedOpen && (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                              <div className="lg:col-span-4">
                                <Label className="text-xs text-slate-500">Gross (IDR, info only)</Label>
                                <Input
                                  className="mt-1"
                                  value={gross !== null ? String(gross) : ''}
                                  onChange={(e) => {
                                    const next = e.target.value.trim()
                                    const nextNotes = next ? upsertNotesKey(item.notes, 'Gross', next) : removeNotesKey(item.notes, 'Gross')
                                    updateItem(index, { notes: nextNotes })
                                  }}
                                  placeholder="Optional"
                                  disabled={financeLocked}
                                />
                              </div>
                              <div className="lg:col-span-8">
                                <Label className="text-xs text-slate-500">Notes / Details</Label>
                                <Textarea
                                  className="mt-1"
                                  value={item.notes || ''}
                                  onChange={(e) => updateItem(index, { notes: e.target.value })}
                                  placeholder="Optional notes"
                                  disabled={financeLocked}
                                />
                              </div>
                              {allowRelatedItem(item) && (
                                <div className="lg:col-span-12">
                                  <Label className="text-xs text-slate-500">Related Item</Label>
                                  <div className="text-[11px] text-slate-400">Link commission to a source item.</div>
                                  <Select
                                    className="mt-1"
                                    value={item.relatedItemId || ''}
                                    disabled={financeLocked}
                                    onChange={(e) =>
                                      updateItem(index, {
                                        relatedItemId: e.target.value ? Number(e.target.value) : null,
                                        relationType: e.target.value ? 'COMMISSION_FOR' : null,
                                      })
                                    }
                                  >
                                    <option value="">-</option>
                                    {items
                                      .filter((_, i) => i !== index)
                                      .filter((other) => Boolean(other.id))
                                      .map((other) => (
                                        <option key={other.id} value={other.id}>
                                          {other.nameSnapshot}
                                        </option>
                                      ))}
                                  </Select>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            disabled={financeLocked}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                        <div className="lg:col-span-2">
                          <Label className="text-xs text-slate-500">Category</Label>
                            <Select
                              className="mt-1"
                              value={item.tourItemCategoryIdSnapshot || ''}
                              disabled={financeLocked}
                              onChange={(e) => {
                                const nextCategoryId = e.target.value ? Number(e.target.value) : null
                                const nextCategory = nextCategoryId ? categoryMap.get(nextCategoryId) : null
                                const resolved = nextCategory || DEFAULT_CATEGORY
                                updateItem(index, {
                                  tourItemCategoryIdSnapshot: nextCategoryId,
                                  tourItemCategoryNameSnapshot: resolved.name,
                                  isCommissionSnapshot: resolved.isCommission,
                                  allowRelatedItemSnapshot: resolved.allowRelatedItem,
                                  direction: resolved.defaultDirection || item.direction,
                                  driverId: allowDriver(resolved) ? item.driverId : null,
                                  partnerId: allowPartner(resolved) ? item.partnerId : null,
                                  relatedItemId: resolved.allowRelatedItem ? item.relatedItemId : null,
                                })
                              }}
                            >
                              <option value="">Select category</option>
                                  {categories
                                    .filter((categoryOption) => categoryOption.id !== null)
                                    .map((categoryOption) => (
                                      <option key={categoryOption.id} value={categoryOption.id ?? ''}>
                                        {categoryOption.name}
                                      </option>
                                    ))}
                            </Select>
                        </div>

                        <div className="lg:col-span-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-slate-500">Item</Label>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs font-semibold text-blue-600 hover:text-blue-700"
                              onClick={() => openNewServiceItem(index)}
                              disabled={financeLocked}
                            >
                              + New Item
                          </Button>
                          </div>
                          <Select
                            className="mt-1"
                            value={item.serviceItemId || ''}
                            disabled={financeLocked}
                            onChange={(e) => {
                              if (e.target.value === '__new__') {
                                openNewServiceItem(index)
                                return
                              }
                              if (!e.target.value) {
                                updateItem(index, {
                                  serviceItemId: null,
                                  nameSnapshot: '',
                                })
                                return
                                }
                                const selected = serviceItems.find((service) => service.id === Number(e.target.value))
                                const category = selected?.tourItemCategoryRef || DEFAULT_CATEGORY
                                const canPartner = allowPartner(category)
                                const canDriver = allowDriver(category)
                                const defaultPartnerId = canPartner
                                  ? selected?.defaultPartnerId ?? selected?.partners?.[0]?.id ?? null
                                  : null
                                const bookingDriverId = selectedBooking?.driver?.id ?? null
                                const defaultDriverId =
                                  canDriver
                                    ? category.autoDriverFromBooking
                                      ? bookingDriverId ?? selected?.drivers?.[0]?.id ?? null
                                      : selected?.drivers?.[0]?.id ?? null
                                    : null
                                updateItem(index, {
                                  serviceItemId: selected?.id || null,
                                  nameSnapshot: selected?.name || item.nameSnapshot,
                                  tourItemCategoryIdSnapshot: category.id ?? null,
                                  tourItemCategoryNameSnapshot: category.name || DEFAULT_CATEGORY.name,
                                  isCommissionSnapshot: category.isCommission ?? false,
                                  allowRelatedItemSnapshot: category.allowRelatedItem ?? false,
                                  direction: category.defaultDirection || item.direction,
                                  partnerId: defaultPartnerId,
                                  driverId: defaultDriverId,
                                })
                              }}
                          >
                            <option value="">Custom</option>
                            <option value="__new__">+ Add New Item</option>
                            {serviceItems.map((service) => (
                              <option key={service.id} value={service.id}>
                                {service.name}
                              </option>
                            ))}
                          </Select>
                          {!item.serviceItemId && (
                            <div className="mt-2">
                              <Label className="text-xs text-slate-500">Custom Name</Label>
                              <Input
                                className="mt-1"
                                value={item.nameSnapshot}
                                onChange={(e) => updateItem(index, { nameSnapshot: e.target.value })}
                                disabled={financeLocked}
                              />
                            </div>
                          )}
                        </div>

                        <div className="lg:col-span-2">
                          <Label className="text-xs text-slate-500">Unit</Label>
                          <Select
                            className="mt-1"
                            value={item.unitType}
                            disabled={financeLocked}
                            onChange={(e) => updateItem(index, { unitType: e.target.value })}
                          >
                            {UNIT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div className="lg:col-span-1">
                          <Label className="text-xs text-slate-500">Qty</Label>
                          <Input
                            type="number"
                            className="mt-1"
                            value={item.unitQty}
                            onChange={(e) => updateItem(index, { unitQty: Number(e.target.value) })}
                            disabled={financeLocked}
                          />
                        </div>

                        <div className="lg:col-span-3">
                          <Label className="text-xs text-slate-500">Amount (IDR)</Label>
                          <Input
                            type="number"
                            className="mt-1"
                            value={item.amount}
                            onChange={(e) => updateItem(index, { amount: Number(e.target.value) })}
                            disabled={financeLocked}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-4">
                        <div className={directionSpan}>
                          <Label className="text-xs text-slate-500">Direction</Label>
                          <Select
                            className="mt-1"
                            value={item.direction}
                            disabled={financeLocked}
                            onChange={(e) => updateItem(index, { direction: e.target.value })}
                          >
                            {DIRECTION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {canPartner && (
                        <div className={partnerSpan}>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-slate-500">Partner</Label>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs font-semibold text-blue-600 hover:text-blue-700"
                              onClick={() => openNewPartner(index)}
                              disabled={financeLocked}
                            >
                              + New Partner
                            </Button>
                          </div>
                          <Select
                            className="mt-1"
                            value={item.partnerId ?? NO_PARTNER_VALUE}
                            disabled={financeLocked}
                            onChange={(e) => {
                              const nextPartner =
                                e.target.value === NO_PARTNER_VALUE || e.target.value === ''
                                  ? null
                                  : Number(e.target.value)
                              updateItem(index, {
                                partnerId: nextPartner,
                                driverId: isEitherPayee && nextPartner ? null : item.driverId,
                              })
                            }}
                          >
                                  <option value="">-</option>
                                  <option value={NO_PARTNER_VALUE}>No partner</option>
                                  {partners.map((partner) => (
                                    <option key={partner.id} value={partner.id}>
                                      {partner.name}
                                    </option>
                                  ))}
                                </Select>
                        </div>
                        )}

                        {showDriver && (
                          <div className={driverSpan}>
                            <Label className="text-xs text-slate-500">Driver</Label>
                            <Select
                              className="mt-1"
                              value={item.driverId || ''}
                              disabled={financeLocked}
                                onChange={(e) => {
                                  const nextDriver = e.target.value ? Number(e.target.value) : null
                                  updateItem(index, {
                                    driverId: nextDriver,
                                    partnerId: isEitherPayee && nextDriver ? null : item.partnerId,
                                  })
                                }}
                              >
                              <option value="">-</option>
                              {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}

                        {allowRelatedItem(item) && (
                          <div className={relatedSpan}>
                            <Label className="text-xs text-slate-500">Related Item</Label>
                            <div className="text-[11px] text-slate-400">Link commission to a source item.</div>
                            <Select
                              className="mt-1"
                              value={item.relatedItemId || ''}
                              disabled={financeLocked}
                              onChange={(e) =>
                                updateItem(index, {
                                  relatedItemId: e.target.value ? Number(e.target.value) : null,
                                  relationType: e.target.value ? 'COMMISSION_FOR' : null,
                                })
                              }
                            >
                              <option value="">-</option>
                              {items
                                .filter((_, i) => i !== index)
                                .filter((other) => Boolean(other.id))
                                .map((other) => (
                                  <option key={other.id} value={other.id}>
                                    {other.nameSnapshot}
                                  </option>
                                ))}
                            </Select>
                          </div>
                        )}
                      </div>

                      {allowRelatedItem(item) && (
                        <div className="mt-4">
                          <Label className="text-xs text-slate-500">Commission Note</Label>
                          <Input
                            className="mt-1"
                            value={item.notes || ''}
                            onChange={(e) => updateItem(index, { notes: e.target.value })}
                            placeholder="e.g. 50/50 split with driver"
                            disabled={financeLocked}
                          />
                        </div>
                      )}

                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveItem(index)}
                          disabled={financeLocked}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

              <FinanceSummaryCard totals={totals} />
            </>
          )}
        </div>
      </div>

      <CommissionSplitDialog
        open={commissionDialogOpen}
        onOpenChange={(open) => setCommissionDialogOpen(open)}
        disabled={financeLocked || !selectedBooking}
        drivers={drivers}
        defaultDriverId={selectedBooking?.driver?.id ?? null}
        commissionCategory={commissionCategory}
        onCreate={(newItems) => appendItems(newItems)}
      />

      <Dialog
        open={showNewServiceModal}
        onOpenChange={(open) => {
          setShowNewServiceModal(open)
          if (!open) setPendingItemIndex(null)
        }}
      >
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle>Add Tour Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Item Name</Label>
              <Input
                value={newServiceForm.name}
                onChange={(e) =>
                  setNewServiceForm({ ...newServiceForm, name: e.target.value })
                }
                placeholder="Example: Lunch, Ticket, Commission"
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                className="mt-1"
                value={newServiceForm.tourItemCategoryId}
                onChange={(e) =>
                  setNewServiceForm({
                    ...newServiceForm,
                    tourItemCategoryId: e.target.value,
                  })
                }
              >
                <option value="">Select category</option>
                {categories.map((opt) => (
                  <option key={opt.id} value={String(opt.id)}>
                    {opt.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-4 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowNewServiceModal(false)
                setPendingItemIndex(null)
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreateServiceItem}
              disabled={savingServiceItem}
            >
              {savingServiceItem ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showNewPartnerModal}
        onOpenChange={(open) => {
          setShowNewPartnerModal(open)
          if (!open) setPendingPartnerIndex(null)
        }}
      >
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle>Add Partner</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Partner Name</Label>
              <Input
                value={newPartnerForm.name}
                onChange={(e) =>
                  setNewPartnerForm({ ...newPartnerForm, name: e.target.value })
                }
                placeholder="Example: Turtle Conservation"
              />
            </div>
            <div className="space-y-1">
              <Label>PIC Name</Label>
              <Input
                value={newPartnerForm.picName}
                onChange={(e) =>
                  setNewPartnerForm({
                    ...newPartnerForm,
                    picName: e.target.value,
                  })
                }
                placeholder="Contact name"
              />
            </div>
            <div className="space-y-1">
              <Label>PIC WhatsApp</Label>
              <Input
                value={newPartnerForm.picWhatsapp}
                onChange={(e) =>
                  setNewPartnerForm({
                    ...newPartnerForm,
                    picWhatsapp: e.target.value,
                  })
                }
                placeholder="08xxxxxxxxxx"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-4 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowNewPartnerModal(false)
                setPendingPartnerIndex(null)
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreatePartner}
              disabled={savingPartner}
            >
              {savingPartner ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(showWarning && selectedBooking)}
        onOpenChange={setShowWarning}
      >
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle>Tour Not Started</DialogTitle>
          </DialogHeader>
          {selectedBooking ? (
            <>
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-yellow-500" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    Booking {selectedBooking.bookingRef || `#${selectedBooking.id}`} cannot be validated yet.
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Tour Date: {formatDate(selectedBooking.tourDate)}
              </div>
            </>
          ) : null}
          <DialogFooter>
            <Button className="w-full" onClick={() => setShowWarning(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

