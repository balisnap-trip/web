'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { useNotifications } from '@/hooks/use-notifications'
import { HandCoins, MessageCircle, Printer } from 'lucide-react'

interface SettlementItem {
  id: number
  nameSnapshot: string
  tourItemCategoryNameSnapshot?: string | null
  direction: string
  unitQty: number
  unitPrice: number
  amount: number
  notes?: string | null
  bookingFinance: {
    booking: {
      id: number
      bookingRef: string | null
      tourDate: string
      mainContactName?: string | null
      numberOfAdult?: number | null
      numberOfChild?: number | null
      package: { packageName: string; tour?: { tourName: string } | null } | null
      driver?: { id: number; name: string } | null
    }
  }
  driver: { id: number; name: string; phone?: string | null } | null
  partner: { id: number; name: string; picWhatsapp?: string | null } | null
}

type CounterpartyGroup = {
  key: string
  counterpartyId: number
  name: string
  type: 'Driver' | 'Partner'
  waPhone: string | null
  items: SettlementItem[]
  expense: number
  income: number
  net: number
}

type SettlementBookingSummary = {
  bookingId: number
  bookingRef: string | null
  tourName: string
  tourDate: string
  guestName: string
  paxCount: number
  payAmount: number
  collectAmount: number
  netAmount: number
  items: SettlementItem[]
}

function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

function sanitizeWaText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function getBookingPax(booking: SettlementItem['bookingFinance']['booking']): number {
  const adults = Number(booking.numberOfAdult ?? 0)
  const children = Number(booking.numberOfChild ?? 0)
  const total = adults + children
  return Number.isFinite(total) && total > 0 ? total : 0
}

function buildBookingSummaries(items: SettlementItem[]): SettlementBookingSummary[] {
  const map = new Map<number, SettlementBookingSummary>()

  for (const item of items) {
    const booking = item.bookingFinance.booking
    if (!map.has(booking.id)) {
      map.set(booking.id, {
        bookingId: booking.id,
        bookingRef: booking.bookingRef ?? null,
        tourName: booking.package?.tour?.tourName || booking.package?.packageName || '-',
        tourDate: booking.tourDate,
        guestName: sanitizeWaText(booking.mainContactName) || '-',
        paxCount: getBookingPax(booking),
        payAmount: 0,
        collectAmount: 0,
        netAmount: 0,
        items: [],
      })
    }

    const entry = map.get(booking.id)!
    const amount = Number(item.amount || 0)
    if (item.direction === 'EXPENSE') entry.payAmount += amount
    else if (item.direction === 'INCOME') entry.collectAmount += amount
    entry.netAmount = entry.payAmount - entry.collectAmount
    entry.items.push(item)
  }

  const rows = [...map.values()].sort((a, b) => {
    const byDate = +new Date(a.tourDate) - +new Date(b.tourDate)
    if (byDate !== 0) return byDate
    return a.bookingId - b.bookingId
  })

  for (const row of rows) {
    row.items.sort((a, z) => {
      const aRank = a.direction === 'EXPENSE' ? 0 : 1
      const zRank = z.direction === 'EXPENSE' ? 0 : 1
      if (aRank !== zRank) return aRank - zRank
      return a.nameSnapshot.localeCompare(z.nameSnapshot)
    })
  }

  return rows
}

function buildSettlementWaMessage(group: CounterpartyGroup): string {
  const lines: string[] = []
  const bookingRows = buildBookingSummaries(group.items)
  const detailPreviewLimit = 60
  const net = Number(group.net || 0)
  const safeName = sanitizeWaText(group.name)

  if (group.type === 'Partner') {
    lines.push('Settlement Partner')
    lines.push(`Partner: ${safeName}`)
    lines.push(`(Company Pay): ${formatCurrency(group.expense, 'IDR')}`)
    lines.push(`(Company Collect): ${formatCurrency(group.income, 'IDR')}`)
    if (net > 0) lines.push(`Net settlement: Pay ${formatCurrency(net, 'IDR')}`)
    else if (net < 0) lines.push(`Net settlement: Collect ${formatCurrency(Math.abs(net), 'IDR')}`)
    else lines.push('Net settlement: Even')
    lines.push(`Total Bookings: ${bookingRows.length}`)
    lines.push('')
    lines.push('Detail item:')

    for (const row of bookingRows.slice(0, detailPreviewLimit)) {
      lines.push(
        `* ${formatDate(row.tourDate)} | ${row.guestName} | ${row.paxCount} Pax | ${formatCurrency(row.netAmount, 'IDR')}`
      )
    }

    if (bookingRows.length > detailPreviewLimit) {
      lines.push(`... +${bookingRows.length - detailPreviewLimit} baris detail lainnya`)
    }

    return `${lines.join('\n')}\n`
  }

  lines.push(`Settlement ${group.type}`)
  lines.push(`${group.type}: ${safeName}`)
  lines.push(`(Company Pay): ${formatCurrency(group.expense, 'IDR')}`)
  lines.push(`(Company Collect): ${formatCurrency(group.income, 'IDR')}`)

  if (net > 0) lines.push(`Net settlement: Pay ${formatCurrency(net, 'IDR')}`)
  else if (net < 0) lines.push(`Net settlement: Collect ${formatCurrency(Math.abs(net), 'IDR')}`)
  else lines.push('Net settlement: Even')
  lines.push(`Total Bookings: ${bookingRows.length}`)

  lines.push('')
  lines.push('Detail item:')

  const itemRows = bookingRows.flatMap((row) =>
    row.items.map((item) => ({
      tourDate: row.tourDate,
      bookingRef: sanitizeWaText(row.bookingRef) || null,
      bookingId: row.bookingId,
      directionLabel: item.direction === 'EXPENSE' ? 'Comm Out' : 'Comm In',
      itemName: sanitizeWaText(item.nameSnapshot),
      amount: Number(item.amount || 0),
    }))
  )

  for (const row of itemRows.slice(0, detailPreviewLimit)) {
    lines.push(
      `- ${formatDate(row.tourDate)} | ${row.bookingRef || `#${row.bookingId}`} | ${row.directionLabel} | ${row.itemName} | ${formatCurrency(row.amount, 'IDR')}`
    )
  }

  if (itemRows.length > detailPreviewLimit) {
    lines.push(`... +${itemRows.length - detailPreviewLimit} baris detail lainnya`)
  }

  return `${lines.join('\n')}\n`
}

export default function FinanceSettlementsPage() {
  const [items, setItems] = useState<SettlementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SettlementItem | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<CounterpartyGroup | null>(null)
  const [paidBy, setPaidBy] = useState('Company')
  const [paidNote, setPaidNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { notify } = useNotifications()

  const counterpartyGroups = useMemo(() => {
    const map = new Map<string, CounterpartyGroup>()

    items.forEach((item) => {
      const driver = item.driver
      const partner = item.partner
      const counterparty = driver
        ? { type: 'Driver' as const, id: driver.id, name: driver.name, waPhone: driver.phone ?? null }
        : partner
          ? { type: 'Partner' as const, id: partner.id, name: partner.name, waPhone: partner.picWhatsapp ?? null }
          : null

      if (!counterparty) return
      const key = `${counterparty.type}:${counterparty.id}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          counterpartyId: counterparty.id,
          name: counterparty.name,
          type: counterparty.type,
          waPhone: counterparty.waPhone,
          items: [],
          expense: 0,
          income: 0,
          net: 0,
        })
      }

      const group = map.get(key)!
      group.items.push(item)
      if (item.direction === 'EXPENSE') {
        group.expense += Number(item.amount || 0)
      } else {
        group.income += Number(item.amount || 0)
      }
      group.net = group.expense - group.income
    })

    return Array.from(map.values()).sort((a, b) => b.net - a.net)
  }, [items])
  const selectedGroupBookings = useMemo(
    () => (selectedGroup ? buildBookingSummaries(selectedGroup.items) : []),
    [selectedGroup]
  )
  const selectedGroupWaNumber = useMemo(
    () => normalizeWhatsappNumber(selectedGroup?.waPhone),
    [selectedGroup]
  )

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/finance/settlements')
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
      } else {
        notify({ type: 'error', title: 'Load Settlements Failed', message: data.error || 'Unable to load items.' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Load Settlements Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const openPayModalForItem = (item: SettlementItem) => {
    setSelectedItem(item)
    setSelectedGroup(null)
    setPaidBy('Company')
    setPaidNote('')
    setShowModal(true)
  }

  const openPayModalForGroup = (group: CounterpartyGroup) => {
    setSelectedGroup(group)
    setSelectedItem(null)
    setPaidBy('Company')
    setPaidNote('')
    setShowModal(true)
  }

  const openGroupPrint = (group: CounterpartyGroup) => {
    const params = new URLSearchParams()
    params.set('month', 'all')
    params.set('includePaid', '0')
    params.set('autoPrint', '1')

    if (group.type === 'Driver') {
      params.set('driverId', String(group.counterpartyId))
      window.open(`/print/invoice/driver?${params.toString()}`, '_blank', 'noopener,noreferrer')
      return
    }

    params.set('partnerId', String(group.counterpartyId))
    params.set('layout', 'settlement')
    window.open(`/print/invoice/vendor?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const openGroupWhatsApp = (group: CounterpartyGroup) => {
    const wa = normalizeWhatsappNumber(group.waPhone)
    if (!wa) {
      notify({
        type: 'error',
        title: 'No WhatsApp Number',
        message: `Nomor WhatsApp ${group.type.toLowerCase()} belum tersedia.`,
      })
      return
    }
    const message = buildSettlementWaMessage(group)
    const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  const handleMarkPaid = async () => {
    if (!selectedItem && !selectedGroup) return
    setSaving(true)
    try {
      if (selectedGroup) {
        const res = await fetch('/api/finance/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemIds: selectedGroup.items.map((item) => item.id),
            paidBy,
            paidNote,
          }),
        })
        const data = await res.json()
        if (data.success) {
          notify({ type: 'success', title: 'Group Settled' })
          setShowModal(false)
          fetchItems()
        } else {
          notify({ type: 'error', title: 'Update Failed', message: data.error || 'Unable to settle group' })
        }
      } else if (selectedItem) {
        const res = await fetch(`/api/finance/items/${selectedItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paid: true,
            paidAt: new Date().toISOString(),
            paidBy,
            paidNote,
          }),
        })
        const data = await res.json()
        if (data.success) {
          notify({ type: 'success', title: 'Marked as Paid' })
          setShowModal(false)
          fetchItems()
        } else {
          notify({ type: 'error', title: 'Update Failed', message: data.error || 'Unable to mark paid' })
        }
      }
    } catch (error) {
      notify({ type: 'error', title: 'Update Error', message: String(error) })
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
    <div className="space-y-6">
      <ModuleTabs moduleId="finances" />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
        <p className="text-gray-600 mt-1">Settle costs and commissions for reviewed bookings.</p>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-800">Settlement Summary</div>
        {counterpartyGroups.length === 0 ? (
          <div className="text-xs text-gray-500 mt-2">No unpaid items for reviewed bookings.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {counterpartyGroups.map((group) => {
              const net = Number(group.net || 0)
              const netAbs = Math.abs(net)
              const action = net < 0 ? 'Collect' : net > 0 ? 'Pay' : 'Even'
              const netLabel = action === 'Even' ? 'Even' : `${action} ${formatCurrency(netAbs, 'IDR')}`
              const buttonLabel =
                action === 'Collect' ? 'Collect Net' : action === 'Pay' ? 'Pay Net' : 'Mark Settled'
              const toneClass =
                action === 'Collect'
                  ? 'text-emerald-700'
                  : action === 'Pay'
                    ? 'text-rose-700'
                    : 'text-gray-700'

              return (
              <div key={group.key} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{group.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{group.type}</div>
                  </div>
                  <span className={`text-xs font-semibold ${toneClass}`}>{netLabel}</span>
                </div>
                <div className="mt-3 text-xs text-gray-600">Expense: {formatCurrency(group.expense, 'IDR')}</div>
                <div className="text-xs text-gray-600">Income: {formatCurrency(group.income, 'IDR')}</div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => openPayModalForGroup(group)}
                >
                  {buttonLabel}
                </Button>
              </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Booking</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Counterparty</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">
                      {item.bookingFinance.booking.bookingRef || `#${item.bookingFinance.booking.id}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.bookingFinance.booking.package?.tour?.tourName ? `${item.bookingFinance.booking.package.tour.tourName} • ` : ''}
                      {item.bookingFinance.booking.package?.packageName}
                    </div>
                    <div className="text-xs text-gray-500">Tour Date: {formatDate(item.bookingFinance.booking.tourDate)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{item.nameSnapshot}</div>
                    <div className="text-xs text-gray-500">
                      {item.tourItemCategoryNameSnapshot || 'Uncategorized'}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      {item.direction === 'INCOME' ? 'Income' : 'Expense'}
                    </div>
                    {item.notes ? (
                      <div className="text-[11px] text-gray-400 mt-1">Note: {item.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm text-gray-700">
                      {item.driver?.name ? `Driver: ${item.driver.name}` : ''}
                    </div>
                    <div className="text-sm text-gray-700">
                      {item.partner?.name ? `Partner: ${item.partner.name}` : ''}
                    </div>
                    {!item.driver?.name && !item.partner?.name && (
                      <div className="text-sm text-gray-400">-</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={item.direction === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}>
                      {item.direction === 'INCOME' ? '+' : '-'}
                      {formatCurrency(item.amount, 'IDR')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" onClick={() => openPayModalForItem(item)}>
                      <HandCoins className="h-4 w-4 mr-1" />
                      Mark Paid
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">
                    No unpaid items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={showModal && Boolean(selectedItem || selectedGroup)}
        onOpenChange={(open) => {
          setShowModal(open)
          if (!open) {
            setSelectedItem(null)
            setSelectedGroup(null)
          }
        }}
      >
        <DialogContent className={selectedGroup ? 'max-w-5xl p-4' : 'max-w-md p-4'}>
          <DialogHeader>
            <DialogTitle>Confirm Settlement</DialogTitle>
          </DialogHeader>
            {selectedItem ? (
              <div className="text-sm text-gray-600 mb-4">
                {selectedItem.nameSnapshot} • {formatCurrency(selectedItem.amount, 'IDR')}
              </div>
            ) : selectedGroup ? (
              <div className="space-y-4 mb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {selectedGroup.name} ({selectedGroup.type})
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {selectedGroup.net > 0
                        ? `Pay ${formatCurrency(selectedGroup.net, 'IDR')}`
                        : selectedGroup.net < 0
                          ? `Collect ${formatCurrency(Math.abs(selectedGroup.net), 'IDR')}`
                          : 'Settle (Even)'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {selectedGroup.type === 'Partner'
                        ? `Total Bookings: ${selectedGroupBookings.length}`
                        : `${selectedGroup.items.length} item(s), ${selectedGroupBookings.length} booking(s)`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openGroupPrint(selectedGroup)}>
                      <Printer className="h-4 w-4" />
                      Print PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedGroupWaNumber}
                      onClick={() => openGroupWhatsApp(selectedGroup)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WA
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Company Pay</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {formatCurrency(selectedGroup.expense, 'IDR')}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Company Collect</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {formatCurrency(selectedGroup.income, 'IDR')}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Net</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {selectedGroup.net >= 0
                        ? `Pay ${formatCurrency(selectedGroup.net, 'IDR')}`
                        : `Collect ${formatCurrency(Math.abs(selectedGroup.net), 'IDR')}`}
                    </div>
                  </div>
                </div>

                {selectedGroup.type === 'Partner' ? (
                  <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Guest</th>
                          <th className="px-3 py-2 text-left">Pax</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedGroupBookings.map((booking) => (
                          <tr key={booking.bookingId}>
                            <td className="whitespace-nowrap px-3 py-2">{formatDate(booking.tourDate)}</td>
                            <td className="px-3 py-2">{booking.guestName}</td>
                            <td className="px-3 py-2">{booking.paxCount} Pax</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">
                              {formatCurrency(booking.netAmount, 'IDR')}
                            </td>
                          </tr>
                        ))}
                        {selectedGroupBookings.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                              No detail lines.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Booking</th>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedGroupBookings.flatMap((booking) =>
                          booking.items.map((item) => (
                            <tr key={item.id}>
                              <td className="whitespace-nowrap px-3 py-2">{formatDate(booking.tourDate)}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-900">{booking.bookingRef || `#${booking.bookingId}`}</div>
                                <div className="text-xs text-gray-500">{booking.tourName || '-'}</div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-900">{item.nameSnapshot}</div>
                                <div className="text-xs text-gray-500">{item.tourItemCategoryNameSnapshot || 'Uncategorized'}</div>
                                {item.notes ? <div className="text-[11px] text-gray-400">Note: {item.notes}</div> : null}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span
                                  className={item.direction === 'EXPENSE' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}
                                >
                                  {item.direction === 'EXPENSE' ? 'PAY' : 'COLLECT'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">
                                {formatCurrency(item.amount, 'IDR')}
                              </td>
                            </tr>
                          ))
                        )}
                        {selectedGroup.items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                              No detail lines.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Note</Label>
                <Input value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="flex gap-2 mt-4 sm:gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowModal(false)
                  setSelectedItem(null)
                  setSelectedGroup(null)
                }}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleMarkPaid} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm'}
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
