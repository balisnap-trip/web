'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ModuleTabs } from '@/components/layout/module-tabs'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/currency'
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import type { FinanceReportPayload, PayeeSummary, ReportPeriodMode } from '@/lib/finance/report.types'
import {
  Building2,
  MessageCircle,
  Printer,
  RefreshCw,
  Search,
  Store,
  UserRound,
} from 'lucide-react'

type PayeeTab = 'partner' | 'driver'
const MODE_ORDER: ReportPeriodMode[] = ['monthly', 'yearly', 'total']

const MODE_META: Record<ReportPeriodMode, { title: string; helper: string }> = {
  monthly: { title: 'Monthly', helper: 'Bulan berjalan' },
  yearly: { title: 'Yearly', helper: 'Tahun berjalan' },
  total: { title: 'Total', helper: 'Semua data' },
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

function MetricCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <Card className={cn('p-4', accent ? 'border-emerald-200 bg-emerald-50/40' : '')}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold', accent ? 'text-emerald-700' : 'text-slate-900')}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-600">{hint}</div> : null}
    </Card>
  )
}

function buildWhatsAppMessage({
  tab,
  mode,
  periodLabel,
  payee,
}: {
  tab: PayeeTab
  mode: ReportPeriodMode
  periodLabel: string
  payee: PayeeSummary
}) {
  const role = tab === 'partner' ? 'Partner' : 'Driver'
  const lines = payee.lines[mode]
  const previewLimit = 20
  const preview = lines.slice(0, previewLimit)
  const amountLabel = `${MODE_META[mode].title} Gross`

  const text: string[] = []
  text.push(`Finance ${role} Report`)
  text.push(`Mode: ${MODE_META[mode].title} (${periodLabel})`)
  text.push(`${role}: ${payee.name}`)
  text.push(`${amountLabel}: ${formatCurrency(payee.totals[mode], 'IDR')}`)
  text.push(`Booking: ${payee.bookingCounts[mode]}`)
  text.push('')
  text.push('Detail per booking:')

  for (const line of preview) {
    text.push(
      `- ${formatDate(line.tourDate)} | ${line.bookingRef || `#${line.bookingId}`} | ${formatCurrency(line.amount, 'IDR')}`
    )
  }

  if (lines.length > previewLimit) {
    text.push(`... +${lines.length - previewLimit} booking lainnya`)
  }

  return text.join('\n')
}

export default function FinanceReportPage() {
  const [report, setReport] = useState<FinanceReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)
  const [mode, setMode] = useState<ReportPeriodMode>('monthly')
  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const [selectedYearKey, setSelectedYearKey] = useState('')
  const [payeeTab, setPayeeTab] = useState<PayeeTab>('partner')
  const [query, setQuery] = useState('')
  const [selectedPayeeId, setSelectedPayeeId] = useState<number | null>(null)

  const load = async (overrides?: { monthKey?: string; yearKey?: string }) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      const monthKey = overrides?.monthKey ?? selectedMonthKey
      const yearKey = overrides?.yearKey ?? selectedYearKey
      if (monthKey) params.set('month', monthKey)
      if (yearKey) params.set('year', yearKey)

      const url = params.size > 0 ? `/api/finance/report?${params.toString()}` : '/api/finance/report'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load finance report')
      const payload = (await res.json()) as FinanceReportPayload
      setReport(payload)
      setSelectedMonthKey(payload.period.monthly.key)
      setSelectedYearKey(payload.period.yearly.key)
      setLastLoadedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const periodLabel = useMemo(() => {
    if (!report) return '-'
    if (mode === 'monthly') return report.period.monthly.label
    if (mode === 'yearly') return report.period.yearly.label
    return 'All Time'
  }, [mode, report])

  const grossLabel = `${MODE_META[mode].title} Gross`

  const payees = useMemo(() => {
    const source = payeeTab === 'partner' ? report?.partners || [] : report?.drivers || []
    const search = query.trim().toLowerCase()

    return source
      .filter((payee) => {
        if (!search) return true
        const hay = `${payee.name} ${payee.waPhone || ''}`.toLowerCase()
        return hay.includes(search)
      })
      .sort((a, b) => b.totals[mode] - a.totals[mode])
  }, [mode, payeeTab, query, report])

  useEffect(() => {
    if (payees.length === 0) {
      setSelectedPayeeId(null)
      return
    }
    const hasCurrent = payees.some((payee) => payee.id === selectedPayeeId)
    if (!hasCurrent) setSelectedPayeeId(payees[0].id)
  }, [payees, selectedPayeeId])

  const selectedPayee = useMemo(
    () => payees.find((payee) => payee.id === selectedPayeeId) || null,
    [payees, selectedPayeeId]
  )

  const selectedLines = selectedPayee ? selectedPayee.lines[mode] : []
  const waNumber = normalizeWhatsappNumber(selectedPayee?.waPhone)
  const waMessage = selectedPayee
    ? buildWhatsAppMessage({ tab: payeeTab, mode, periodLabel, payee: selectedPayee })
    : ''

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <Card className="p-4">
        <div className="text-sm font-semibold text-rose-700">Failed to load report</div>
        <div className="mt-1 text-sm text-rose-700/80">{error || 'Unknown error'}</div>
        <div className="mt-3">
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs moduleId="finances" />
      <Card className="overflow-hidden p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finance Report</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Monthly / Yearly / Total Mode</h1>
            <p className="mt-1 text-sm text-slate-600">
              Seluruh perhitungan report akan mengikuti mode aktif.
            </p>
            {lastLoadedAt ? (
              <div className="mt-2 text-xs text-slate-500">
                Updated {formatRelativeTime(lastLoadedAt)} ({formatDateTime(lastLoadedAt)})
              </div>
            ) : null}
          </div>

          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">
              {MODE_META[mode].title}
            </span>
            <span className="text-slate-600">
              {mode === 'total' ? 'Semua periode booking' : `${MODE_META[mode].helper}: ${periodLabel}`}
            </span>
          </div>
          <div className="mt-2 inline-flex w-full max-w-xl items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {MODE_ORDER.map((option) => {
              const active = option === mode
              return (
                <Button
                  key={option}
                  type="button"
                  variant="ghost"
                  onClick={() => setMode(option)}
                  className={cn(
                    'h-9 flex-1 rounded-lg text-xs font-semibold',
                    active
                      ? 'bg-white text-slate-900 shadow-sm hover:bg-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  {MODE_META[option].title}
                </Button>
              )
            })}
          </div>
        </div>

        {mode === 'monthly' ? (
          <div className="mt-4 max-w-xs">
            <div className="mb-1 text-xs font-medium text-slate-600">Pilih bulan</div>
            <Select
              value={selectedMonthKey}
              onChange={(e) => {
                const nextMonth = e.target.value
                setSelectedMonthKey(nextMonth)
                load({ monthKey: nextMonth, yearKey: selectedYearKey })
              }}
            >
              {report.period.monthly.options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {mode === 'yearly' ? (
          <div className="mt-4 max-w-xs">
            <div className="mb-1 text-xs font-medium text-slate-600">Pilih tahun</div>
            <Select
              value={selectedYearKey}
              onChange={(e) => {
                const nextYear = e.target.value
                setSelectedYearKey(nextYear)
                load({ monthKey: selectedMonthKey, yearKey: nextYear })
              }}
            >
              {report.period.yearly.options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Building2 className="h-4 w-4" />
          Section Company ({MODE_META[mode].title})
        </div>
        <div className="mt-1 text-xs text-slate-600">
          Income diambil dari total uang booking (email) pada mode aktif.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Income" value={formatCurrency(report.company.income[mode], 'IDR')} />
          <MetricCard label="Expense" value={formatCurrency(report.company.expense[mode], 'IDR')} />
          <MetricCard label="Comm In" value={formatCurrency(report.company.commissionIn[mode], 'IDR')} />
          <MetricCard label="Comm Out" value={formatCurrency(report.company.commissionOut[mode], 'IDR')} />
          <MetricCard
            label="Revenue"
            value={formatCurrency(report.company.revenue[mode], 'IDR')}
            hint="Revenue = Income + Comm In - Expense - Comm Out"
            accent
          />
        </div>

        <div className="mt-3 text-xs text-slate-600">
          Booking count ({periodLabel}):{' '}
          <span className="font-semibold text-slate-900">{report.company.bookingCount[mode]}</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Section Partner</div>
            <div className="mt-1 text-xs text-slate-600">
              Card menampilkan {grossLabel.toLowerCase()} sesuai mode <span className="font-semibold">{periodLabel}</span>.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={payeeTab === 'partner' ? 'default' : 'outline'}
                onClick={() => setPayeeTab('partner')}
              >
                <Store className="h-4 w-4" />
                Partner
              </Button>
              <Button
                size="sm"
                variant={payeeTab === 'driver' ? 'default' : 'outline'}
                onClick={() => setPayeeTab('driver')}
              >
                <UserRound className="h-4 w-4" />
                Driver
              </Button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama partner / driver..."
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {payees.map((payee) => {
              const active = payee.id === selectedPayeeId
              return (
                <Button
                  key={payee.id}
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedPayeeId(payee.id)}
                  className={cn(
                    'h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal rounded-xl border p-3 text-left transition',
                    active
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className="truncate text-sm font-semibold text-slate-900">{payee.name}</div>
                  <div className="mt-1 text-xs text-slate-600">{grossLabel}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(payee.totals[mode], 'IDR')}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {payee.bookingCounts[mode]} booking{payee.bookingCounts[mode] > 1 ? 's' : ''}
                  </div>
                </Button>
              )
            })}

            {payees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                Tidak ada data {payeeTab} untuk mode {MODE_META[mode].title}.
              </div>
            ) : null}
          </div>

          <Card className="p-4">
            {!selectedPayee ? (
              <div className="flex h-full min-h-56 items-center justify-center text-sm text-slate-500">
                Pilih card {payeeTab} untuk melihat detail per booking.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{selectedPayee.name}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {grossLabel}: <span className="font-semibold">{formatCurrency(selectedPayee.totals[mode], 'IDR')}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Periode: <span className="font-semibold">{periodLabel}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams()
                        params.set('type', payeeTab)
                        params.set('id', String(selectedPayee.id))
                        params.set('period', mode)
                        params.set('month', selectedMonthKey)
                        params.set('year', selectedYearKey)
                        params.set('autoPrint', '1')
                        window.open(`/print/finance-report/payee?${params.toString()}`, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      <Printer className="h-4 w-4" />
                      Cetak PDF
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!waNumber || selectedLines.length === 0}
                      onClick={() => {
                        if (!waNumber) return
                        const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`
                        window.open(waUrl, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Button>
                  </div>
                </div>

                <div className="overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Tanggal</th>
                        <th className="px-3 py-2 text-left">Booking</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedLines.map((line) => (
                        <tr key={`${line.bookingId}-${line.tourDate}`}>
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(line.tourDate)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{line.bookingRef || `#${line.bookingId}`}</div>
                            <div className="text-xs text-slate-500">{line.tourName || '-'}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                            {formatCurrency(line.amount, 'IDR')}
                          </td>
                        </tr>
                      ))}

                      {selectedLines.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-10 text-center text-sm text-slate-500">
                            Tidak ada detail booking untuk mode ini.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      </Card>
    </div>
  )
}
