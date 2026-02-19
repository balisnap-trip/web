'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import type {
  CommissionGroupByDriver,
  CommissionGroupByVendor,
  CommissionStatementsPayload,
} from '@/lib/finance/commission-statements.types'
import type { InvoiceStatementsPayload } from '@/lib/finance/invoice-statements.types'
import { useNotifications } from '@/hooks/use-notifications'
import { Copy, ExternalLink, FileText, RefreshCw, User, Store } from 'lucide-react'

type GroupMode = 'driver' | 'vendor'
type InvoiceMode = 'driver' | 'vendor'
type Section = 'invoice' | 'report' | 'commission'

type ReportView = 'booking' | 'month'
type ReportSortKey =
  | 'tourDate_desc'
  | 'tourDate_asc'
  | 'net_desc'
  | 'usd_desc'
  | 'idr_desc'

function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

function aggregateByKey<T extends { gross: number | null; companyTakes: number; driverGets: number | null }>(
  lines: T[],
  getKey: (line: T) => string
) {
  const map = new Map<
    string,
    { key: string; grossKnown: number; company: number; driverKnown: number; count: number; unknownGrossCount: number }
  >()

  for (const line of lines) {
    const key = (getKey(line) || '').trim() || 'Unknown'
    if (!map.has(key)) {
      map.set(key, { key, grossKnown: 0, company: 0, driverKnown: 0, count: 0, unknownGrossCount: 0 })
    }
    const entry = map.get(key)!
    entry.count += 1
    entry.company += Number(line.companyTakes) || 0
    if (line.gross === null || line.gross === undefined) entry.unknownGrossCount += 1
    else entry.grossKnown += Number(line.gross) || 0
    if (line.driverGets !== null && line.driverGets !== undefined) entry.driverKnown += Number(line.driverGets) || 0
  }

  const list = [...map.values()]
  list.sort((a, b) => a.key.localeCompare(b.key))
  return list
}

function openInvoicePrint(
  mode: InvoiceMode,
  month: string,
  includePaid: boolean,
  key: { driverId?: number; partnerId?: number }
) {
  const params = new URLSearchParams()
  params.set('month', month)
  params.set('includePaid', includePaid ? '1' : '0')
  params.set('autoPrint', '1')

  if (mode === 'driver') {
    params.set('driverId', key.driverId ? String(key.driverId) : '')
    window.open(`/print/invoice/driver?${params.toString()}`, '_blank', 'noopener,noreferrer')
    return
  }

  params.set('partnerId', key.partnerId ? String(key.partnerId) : '')
  window.open(`/print/invoice/vendor?${params.toString()}`, '_blank', 'noopener,noreferrer')
}

function buildDriverMessage(group: CommissionGroupByDriver, month: string) {
  const monthLabel = month === 'all' ? 'All months' : month
  const vendorAgg = aggregateByKey(group.lines, (l) => l.vendor || 'Unknown vendor')
  const lines: string[] = []

  lines.push(`Komisi Vendor - ${monthLabel}`)
  lines.push(`Driver: ${group.driverName}`)
  lines.push('')

  for (const v of vendorAgg) {
    const grossPart = v.unknownGrossCount > 0 ? `${formatCurrency(v.grossKnown, 'IDR')} (+${v.unknownGrossCount} unknown)` : formatCurrency(v.grossKnown, 'IDR')
    lines.push(`- ${v.key}`)
    lines.push(`  Gross: ${grossPart}`)
    lines.push(`  Company takes: ${formatCurrency(v.company, 'IDR')}`)
    lines.push(`  Driver gets: ${formatCurrency(v.driverKnown, 'IDR')}`)
  }

  lines.push('')
  lines.push(`Total company takes: ${formatCurrency(group.totals.companyTakesTotal, 'IDR')}`)
  if (group.totals.unknownGrossCount > 0) {
    lines.push(`Note: gross missing for ${group.totals.unknownGrossCount} transaction(s).`)
  }

  return lines.join('\n')
}

function buildVendorMessage(group: CommissionGroupByVendor, month: string) {
  const monthLabel = month === 'all' ? 'All months' : month
  const driverAgg = aggregateByKey(group.lines, (l) => l.driverName || 'Unknown driver')
  const lines: string[] = []

  lines.push(`Komisi Vendor - ${monthLabel}`)
  lines.push(`Vendor: ${group.vendor}`)
  lines.push('')

  for (const d of driverAgg) {
    const grossPart = d.unknownGrossCount > 0 ? `${formatCurrency(d.grossKnown, 'IDR')} (+${d.unknownGrossCount} unknown)` : formatCurrency(d.grossKnown, 'IDR')
    lines.push(`- ${d.key}`)
    lines.push(`  Gross: ${grossPart}`)
    lines.push(`  Company takes: ${formatCurrency(d.company, 'IDR')}`)
    lines.push(`  Driver gets: ${formatCurrency(d.driverKnown, 'IDR')}`)
  }

  lines.push('')
  lines.push(`Total company takes: ${formatCurrency(group.totals.companyTakesTotal, 'IDR')}`)
  if (group.totals.unknownGrossCount > 0) {
    lines.push(`Note: gross missing for ${group.totals.unknownGrossCount} transaction(s).`)
  }

  return lines.join('\n')
}

function buildVendorInvoiceMessage(group: InvoiceStatementsPayload['vendors'][number], month: string, includePaid: boolean) {
  const monthLabel = month === 'all' ? 'All months' : month
  const lines: string[] = []
  lines.push(`Invoice Vendor - ${monthLabel}`)
  lines.push(`Vendor: ${group.partnerName}`)
  if (group.picName) lines.push(`PIC: ${group.picName}`)
  lines.push('')

  if (includePaid) {
    lines.push(`Total: ${formatCurrency(group.totals.total, 'IDR')}`)
    lines.push(`Paid: ${formatCurrency(group.totals.paid, 'IDR')}`)
    lines.push(`Due: ${formatCurrency(group.totals.due, 'IDR')}`)
  } else {
    lines.push(`Due: ${formatCurrency(group.totals.due, 'IDR')}`)
  }

  lines.push('')
  lines.push('Detail per booking:')

  for (const b of group.bookings) {
    const amount = includePaid ? b.total : b.due
    if (!includePaid && amount <= 0) continue
    lines.push(`- ${formatDate(b.tourDate)} | ${b.bookingRef || `#${b.bookingId}`} | ${b.tourName || '-'} | ${formatCurrency(amount, 'IDR')}`)
  }

  return lines.join('\n')
}

function buildDriverInvoiceMessage(group: InvoiceStatementsPayload['drivers'][number], month: string, includePaid: boolean) {
  const monthLabel = month === 'all' ? 'All months' : month
  const lines: string[] = []
  lines.push(`Invoice Driver - ${monthLabel}`)
  lines.push(`Driver: ${group.driverName}`)
  lines.push('')

  if (includePaid) {
    lines.push(`Company pays: ${formatCurrency(group.totals.payTotal, 'IDR')} (Paid ${formatCurrency(group.totals.payPaid, 'IDR')}, Due ${formatCurrency(group.totals.payDue, 'IDR')})`)
    lines.push(`Company collects: ${formatCurrency(group.totals.collectTotal, 'IDR')} (Collected ${formatCurrency(group.totals.collectPaid, 'IDR')}, Due ${formatCurrency(group.totals.collectDue, 'IDR')})`)
    lines.push(`Net due: ${group.totals.netDue >= 0 ? `Pay ${formatCurrency(group.totals.netDue, 'IDR')}` : `Collect ${formatCurrency(Math.abs(group.totals.netDue), 'IDR')}`}`)
  } else {
    lines.push(`Company pays (due): ${formatCurrency(group.totals.payDue, 'IDR')}`)
    lines.push(`Company collects (due): ${formatCurrency(group.totals.collectDue, 'IDR')}`)
    const n = group.totals.netDue
    lines.push(`Net due: ${n >= 0 ? `Pay ${formatCurrency(n, 'IDR')}` : `Collect ${formatCurrency(Math.abs(n), 'IDR')}`}`)
  }

  lines.push('')
  lines.push('Detail per booking:')

  for (const b of group.bookings) {
    const pay = includePaid ? b.payTotal : b.payDue
    const collect = includePaid ? b.collectTotal : b.collectDue
    const net = pay - collect
    if (!includePaid && pay <= 0 && collect <= 0) continue
    const netLabel = net >= 0 ? `Pay ${formatCurrency(net, 'IDR')}` : `Collect ${formatCurrency(Math.abs(net), 'IDR')}`
    lines.push(`- ${formatDate(b.tourDate)} | ${b.bookingRef || `#${b.bookingId}`} | Pay ${formatCurrency(pay, 'IDR')} | Collect ${formatCurrency(collect, 'IDR')} | ${netLabel}`)
  }

  return lines.join('\n')
}

function openPrint(mode: GroupMode, month: string, key: { driverId?: number | null; vendor?: string }) {
  const params = new URLSearchParams()
  params.set('mode', mode)
  params.set('month', month)
  params.set('autoPrint', '1')
  if (mode === 'driver') params.set('driverId', key.driverId ? String(key.driverId) : '')
  if (mode === 'vendor') params.set('vendor', key.vendor || '')

  const url = `/print/commission-statement?${params.toString()}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

function openWhatsApp(phone: string, message: string) {
  const wa = normalizeWhatsappNumber(phone)
  if (!wa) return false
  const url = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}

export function CommissionPrintDialog({
  open,
  onOpenChange,
  month,
  reportQuery,
  reportView,
  reportSortKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
  reportQuery: string
  reportView: ReportView
  reportSortKey: ReportSortKey
}) {
  const { notify } = useNotifications()
  const [section, setSection] = useState<Section>('invoice')
  const [includePaid, setIncludePaid] = useState(false)
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>('vendor')
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceStatementsPayload | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<CommissionStatementsPayload | null>(null)
  const [mode, setMode] = useState<GroupMode>('driver')
  const [q, setQ] = useState('')

  const loadInvoices = async () => {
    try {
      setInvoiceError(null)
      setInvoiceLoading(true)
      const res = await fetch(
        `/api/finance/report/invoice-statements?month=${encodeURIComponent(month)}&includePaid=${includePaid ? '1' : '0'}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('Failed to load invoices')
      const payload = (await res.json()) as InvoiceStatementsPayload
      setInvoiceData(payload)
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Unknown error')
      setInvoiceData(null)
    } finally {
      setInvoiceLoading(false)
    }
  }

  const load = async () => {
    try {
      setError(null)
      setLoading(true)
      const res = await fetch(`/api/finance/report/commission-statements?month=${encodeURIComponent(month)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load commission statements')
      const payload = (await res.json()) as CommissionStatementsPayload
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (section !== 'commission') return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month, section])

  useEffect(() => {
    if (!open) return
    if (section !== 'invoice') return
    loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month, section, includePaid])

  useEffect(() => {
    if (!open) return
    setSection('invoice')
    setIncludePaid(false)
    setInvoiceMode('vendor')
    setInvoiceQuery('')
    setMode('driver')
    setQ('')
  }, [open])

  const monthLabel = data?.month ? (data.month === 'all' ? 'All months' : data.month) : month === 'all' ? 'All months' : month

  const openReportPrint = (view: ReportView) => {
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('month', month)
    if (reportQuery.trim()) params.set('q', reportQuery.trim())
    params.set('sort', reportSortKey)
    params.set('autoPrint', '1')
    window.open(`/print/finance-report?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!data) return []

    const list = mode === 'driver' ? data.byDriver : data.byVendor

    if (!query) return list
    return list.filter((g: any) => {
      const hay =
        mode === 'driver'
          ? `${g.driverName} ${g.driverPhone || ''}`.toLowerCase()
          : `${g.vendor}`.toLowerCase()
      return hay.includes(query)
    })
  }, [data, mode, q])

  const invoiceMonthLabel = invoiceData?.month ? (invoiceData.month === 'all' ? 'All months' : invoiceData.month) : month === 'all' ? 'All months' : month

  const invoiceGroups = useMemo(() => {
    const query = invoiceQuery.trim().toLowerCase()
    if (!invoiceData) return []
    const list = invoiceMode === 'vendor' ? invoiceData.vendors : invoiceData.drivers
    if (!query) return list
    return list.filter((g: any) => {
      const hay =
        invoiceMode === 'vendor'
          ? `${g.partnerName} ${g.picName || ''} ${g.picWhatsapp || ''}`.toLowerCase()
          : `${g.driverName} ${g.driverPhone || ''}`.toLowerCase()
      return hay.includes(query)
    })
  }, [invoiceData, invoiceMode, invoiceQuery])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Print</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={section === 'invoice' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSection('invoice')}
            >
              Invoice
            </Button>
            <Button
              variant={section === 'report' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSection('report')}
            >
              Finance report
            </Button>
            <Button
              variant={section === 'commission' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSection('commission')}
            >
              Commission
            </Button>
          </div>

          {section === 'invoice' ? (
            <div className="space-y-3">
              <Card className="p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-700">
                    Monthly invoice-style statements. Month: <span className="font-semibold">{invoiceMonthLabel}</span>.
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <Checkbox
                        checked={includePaid}
                        onChange={(e) => setIncludePaid(e.target.checked)}
                      />
                      Include paid
                    </label>
                    <Button variant="outline" size="sm" onClick={loadInvoices} disabled={invoiceLoading}>
                      <RefreshCw className={cn('h-4 w-4', invoiceLoading ? 'animate-spin' : '')} />
                      Refresh
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant={invoiceMode === 'vendor' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInvoiceMode('vendor')}
                  >
                    <Store className="h-4 w-4" />
                    Vendor
                  </Button>
                  <Button
                    variant={invoiceMode === 'driver' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInvoiceMode('driver')}
                  >
                    <User className="h-4 w-4" />
                    Driver
                  </Button>
                </div>
                <div className="w-full sm:w-72">
                  <Input value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} placeholder="Search..." />
                </div>
              </div>

              {invoiceError ? (
                <Card className="p-3">
                  <div className="text-sm font-semibold text-rose-700">Failed to load</div>
                  <div className="mt-1 text-sm text-rose-700/80">{invoiceError}</div>
                </Card>
              ) : null}

              {invoiceLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
                </div>
              ) : (
                <div className="space-y-2">
                  {invoiceGroups.map((g: any) => {
                    const isVendor = invoiceMode === 'vendor'
                    const title = isVendor ? g.partnerName : g.driverName
                    const waRaw = isVendor ? g.picWhatsapp : g.driverPhone
                    const waNumber = normalizeWhatsappNumber(waRaw)

                    const subtitle = isVendor
                      ? g.picWhatsapp
                        ? `WA: ${g.picWhatsapp}`
                        : 'WA: -'
                      : g.driverPhone
                        ? `WA: ${g.driverPhone}`
                        : 'WA: -'

                    const message = isVendor
                      ? buildVendorInvoiceMessage(g, invoiceMonthLabel, includePaid)
                      : buildDriverInvoiceMessage(g, invoiceMonthLabel, includePaid)

                    const dueLabel = isVendor
                      ? formatCurrency(g.totals.due || 0, 'IDR')
                      : g.totals.netDue >= 0
                        ? `Pay ${formatCurrency(g.totals.netDue || 0, 'IDR')}`
                        : `Collect ${formatCurrency(Math.abs(g.totals.netDue || 0), 'IDR')}`

                    return (
                      <Card key={isVendor ? String(g.partnerId) : String(g.driverId)} className="p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                                Due: <span className="font-semibold">{dueLabel}</span>
                              </span>
                              {includePaid ? (
                                <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                                  Total: {formatCurrency(isVendor ? g.totals.total : g.totals.payTotal, 'IDR')}
                                </span>
                              ) : null}
                              <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                                {g.totals.bookingCount} booking(s)
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                openInvoicePrint(
                                  invoiceMode,
                                  month,
                                  includePaid,
                                  isVendor ? { partnerId: g.partnerId } : { driverId: g.driverId }
                                )
                              }
                            >
                              <FileText className="h-4 w-4" />
                              PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await copyToClipboard(message)
                                  notify({ type: 'success', title: 'Copied', message: 'WA message copied to clipboard' })
                                } catch (e) {
                                  notify({ type: 'error', title: 'Copy failed', message: String(e) })
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                              Copy WA
                            </Button>
                            {waNumber ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const ok = openWhatsApp(String(waRaw || ''), message)
                                  if (!ok) {
                                    notify({ type: 'error', title: 'Invalid phone', message: `Cannot open WhatsApp for: ${waRaw || '-'}` })
                                  }
                                }}
                              >
                                <ExternalLink className="h-4 w-4" />
                                Open WA
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    )
                  })}

                  {invoiceGroups.length === 0 && !invoiceError ? (
                    <Card className="p-6">
                      <div className="text-sm text-muted-foreground">No invoice statements found.</div>
                    </Card>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {section === 'report' ? (
            <div className="space-y-3">
              <Card className="p-3">
                <div className="text-sm text-slate-700">
                  Print <span className="font-semibold">full Finance Report</span> (per booking / per month) based on the current filters.
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Month: <span className="font-semibold">{month === 'all' ? 'All months' : month}</span>
                  {reportQuery.trim() ? (
                    <>
                      {' '}
                      | Search: <span className="font-semibold">&quot;{reportQuery.trim()}&quot;</span>
                    </>
                  ) : null}
                  {' '}| View: <span className="font-semibold">{reportView === 'booking' ? 'Per booking' : 'Monthly'}</span>
                </div>
              </Card>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={reportView === 'booking' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => openReportPrint('booking')}
                >
                  <FileText className="h-4 w-4" />
                  PDF Per booking
                </Button>
                <Button
                  variant={reportView === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => openReportPrint('month')}
                >
                  <FileText className="h-4 w-4" />
                  PDF Monthly
                </Button>
              </div>
            </div>
          ) : null}

          {section === 'commission' ? (
          <Card className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-700">
                Source: bookings <span className="font-semibold">DONE</span>, items with{' '}
                <span className="font-semibold">isCommissionSnapshot</span>. Month: <span className="font-semibold">{monthLabel}</span>.
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="whitespace-nowrap">
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                Refresh
              </Button>
            </div>
          </Card>
          ) : null}

          {section === 'commission' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={mode === 'driver' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('driver')}
                >
                  <User className="h-4 w-4" />
                  Per driver
                </Button>
                <Button
                  variant={mode === 'vendor' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('vendor')}
                >
                  <Store className="h-4 w-4" />
                  Per vendor
                </Button>
              </div>
              <div className="w-full sm:w-72">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />
              </div>
            </div>
          ) : null}

          {section === 'commission' && error ? (
            <Card className="p-3">
              <div className="text-sm font-semibold text-rose-700">Failed to load</div>
              <div className="mt-1 text-sm text-rose-700/80">{error}</div>
            </Card>
          ) : null}

          {section === 'commission' && loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : section === 'commission' ? (
            <div className="space-y-2">
              {groups.map((g: any) => {
                const title = mode === 'driver' ? g.driverName : g.vendor
                const subtitle =
                  mode === 'driver'
                    ? g.driverPhone
                      ? `WA: ${g.driverPhone}`
                      : 'WA: -'
                    : `${g.totals.count} line(s)`

                const message =
                  mode === 'driver'
                    ? buildDriverMessage(g as CommissionGroupByDriver, monthLabel)
                    : buildVendorMessage(g as CommissionGroupByVendor, monthLabel)

                const canWa =
                  mode === 'driver' && Boolean((g as CommissionGroupByDriver).driverPhone)

                return (
                  <Card key={mode === 'driver' ? String(g.driverId) : g.vendor} className="p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                            Gross: {formatCurrency(g.totals.grossTotalKnown || 0, 'IDR')}
                            {g.totals.unknownGrossCount > 0 ? ` (+${g.totals.unknownGrossCount} unknown)` : ''}
                          </span>
                          <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                            Company: {formatCurrency(g.totals.companyTakesTotal || 0, 'IDR')}
                          </span>
                          <span className="rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
                            Driver: {formatCurrency(g.totals.driverGetsTotalKnown || 0, 'IDR')}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            openPrint(mode, month, mode === 'driver' ? { driverId: g.driverId } : { vendor: g.vendor })
                          }
                        >
                          <FileText className="h-4 w-4" />
                          PDF
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await copyToClipboard(message)
                              notify({ type: 'success', title: 'Copied', message: 'WA message copied to clipboard' })
                            } catch (e) {
                              notify({ type: 'error', title: 'Copy failed', message: String(e) })
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          Copy WA
                        </Button>
                        {canWa ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const phone = (g as CommissionGroupByDriver).driverPhone
                              if (!phone) return
                              const ok = openWhatsApp(phone, message)
                              if (!ok) {
                                notify({ type: 'error', title: 'Invalid phone', message: `Cannot open WhatsApp for: ${phone}` })
                              }
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open WA
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                )
              })}

              {groups.length === 0 && !error ? (
                <Card className="p-6">
                  <div className="text-sm text-muted-foreground">No statements found.</div>
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
