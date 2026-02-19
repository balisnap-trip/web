import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { formatCurrency } from '@/lib/currency'
import type { Driver, FinanceItemForm, TourItemCategory } from '@/lib/finance/types'

type CommissionRow = {
  id: string
  vendor: string
  grossInput: string
  useHalfSplit: boolean
  companyTakesInput: string
}

const makeRow = (seed?: Partial<CommissionRow>): CommissionRow => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2),
  vendor: '',
  grossInput: '',
  useHalfSplit: true,
  companyTakesInput: '',
  ...seed,
})

function parseIdrLikeInput(raw: string): number | null {
  const s0 = String(raw ?? '').trim()
  if (!s0) return null
  let s = s0.toLowerCase()
  s = s.replace(/^rp\s*/i, '')
  s = s.replace(/\s+/g, '')

  let mult = 1
  if (s.endsWith('k')) {
    mult = 1000
    s = s.slice(0, -1)
  } else if (s.endsWith('m')) {
    mult = 1000000
    s = s.slice(0, -1)
  }

  if (mult !== 1) {
    // Allow "1.5k" style input. Strip everything except digits and dot.
    const cleaned = s.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const v = Number.parseFloat(cleaned)
    if (!Number.isFinite(v)) return null
    return Math.max(0, Math.round(v * mult))
  }

  // Treat any separators as thousands separators.
  const digits = s.replace(/\D/g, '')
  if (!digits) return null
  const n = Number.parseInt(digits, 10)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

function safeTrim(v: unknown) {
  return String(v ?? '').trim()
}

export function CommissionSplitDialog({
  open,
  onOpenChange,
  drivers,
  defaultDriverId,
  commissionCategory,
  disabled,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  drivers: Driver[]
  defaultDriverId: number | null
  commissionCategory: TourItemCategory | null
  disabled?: boolean
  onCreate: (items: FinanceItemForm[]) => void
}) {
  const [driverId, setDriverId] = useState<string>('')
  const [rows, setRows] = useState<CommissionRow[]>([makeRow()])

  useEffect(() => {
    if (!open) return
    setDriverId(defaultDriverId ? String(defaultDriverId) : '')
    setRows([makeRow()])
  }, [open, defaultDriverId])

  const computed = useMemo(() => {
    const perRow = rows.map((row) => {
      const vendor = safeTrim(row.vendor)
      const gross = parseIdrLikeInput(row.grossInput) ?? 0
      const companyTakesRaw = row.useHalfSplit
        ? Math.round(gross / 2)
        : parseIdrLikeInput(row.companyTakesInput) ?? 0
      const companyTakes = Math.max(0, companyTakesRaw)
      const driverGets = Math.max(0, gross - companyTakes)
      const invalidCompanyTakes = companyTakes > gross
      const isActive = Boolean(vendor || safeTrim(row.grossInput) || safeTrim(row.companyTakesInput))
      const isValid = !isActive
        ? true
        : Boolean(vendor) && gross > 0 && !invalidCompanyTakes
      return {
        row,
        vendor,
        gross,
        companyTakes,
        driverGets,
        invalidCompanyTakes,
        isActive,
        isValid,
      }
    })

    const active = perRow.filter((r) => r.isActive)
    const validActive = active.filter((r) => r.isValid)
    const totalGross = validActive.reduce((sum, r) => sum + r.gross, 0)
    const totalCompany = validActive.reduce((sum, r) => sum + r.companyTakes, 0)
    const totalDriver = validActive.reduce((sum, r) => sum + r.driverGets, 0)

    return { perRow, active, validActive, totalGross, totalCompany, totalDriver }
  }, [rows])

  const driverIdNum = driverId ? Number(driverId) : null
  const selectedDriverName = driverIdNum
    ? drivers.find((d) => d.id === driverIdNum)?.name ?? null
    : null

  const canCreate =
    !disabled &&
    Boolean(commissionCategory) &&
    Boolean(driverIdNum) &&
    computed.active.length > 0 &&
    computed.validActive.length === computed.active.length &&
    computed.totalCompany > 0

  const createItems = () => {
    if (!commissionCategory) return
    const dId = driverId ? Number(driverId) : null
    if (!dId || !Number.isFinite(dId)) return

    // Skip rows where company takes is 0 to avoid cluttering finance items.
    const rowsToCreate = computed.validActive.filter((r) => r.companyTakes > 0)
    const items: FinanceItemForm[] = rowsToCreate.map((r) => {
      const vendorLabel = r.vendor || 'Commission'
      const note = [
        `Vendor: ${vendorLabel}`,
        `Gross: ${r.gross}`,
        `Company takes: ${r.companyTakes}`,
        `Driver gets: ${r.driverGets}`,
        r.row.useHalfSplit ? 'Split: 50/50' : 'Split: manual company takes',
      ].join(' | ')

      return {
        serviceItemId: null,
        nameSnapshot: `Commission - ${vendorLabel}`,
        tourItemCategoryIdSnapshot: commissionCategory.id ?? null,
        tourItemCategoryNameSnapshot: commissionCategory.name ?? 'Commission',
        isCommissionSnapshot: true,
        allowRelatedItemSnapshot: commissionCategory.allowRelatedItem ?? true,
        direction: 'INCOME', // company collects from driver
        isManual: true,
        unitType: 'PER_BOOKING',
        unitQty: 1,
        unitPrice: r.companyTakes,
        amount: r.companyTakes,
        driverId: dId,
        partnerId: null,
        relatedItemId: null,
        relationType: null,
        notes: note,
      }
    })

    if (items.length === 0) return
    onCreate(items)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-4">
        <DialogHeader>
          <DialogTitle>Commission Split (Collect from Driver)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-3">
            <div className="text-sm text-slate-700">
              This will create <span className="font-semibold">Comm In (Income)</span> items paid by the driver, so it can
              net against driver transport costs in <span className="font-semibold">Settlements</span>.
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <Label className="text-xs text-slate-500">Driver (collector)</Label>
              <Select
                className="mt-1"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                disabled={disabled}
              >
                <option value="">Select driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </Select>
              {driverId && selectedDriverName ? (
                <div className="mt-1 text-[11px] text-slate-500">Collect from: {selectedDriverName}</div>
              ) : null}
            </div>
            <div className="md:col-span-6">
              <Label className="text-xs text-slate-500">Category</Label>
              <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {commissionCategory ? commissionCategory.name : 'Commission category not found'}
              </div>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Vendor</th>
                  <th className="px-3 py-2 text-left">Gross (IDR)</th>
                  <th className="px-3 py-2 text-center">50/50</th>
                  <th className="px-3 py-2 text-left">Company Takes (IDR)</th>
                  <th className="px-3 py-2 text-right">Driver Gets</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {computed.perRow.map(({ row, gross, companyTakes, driverGets, invalidCompanyTakes, isActive }) => (
                  <tr key={row.id} className={invalidCompanyTakes ? 'bg-rose-50/40' : ''}>
                    <td className="px-3 py-2 align-top">
                      <Input
                        value={row.vendor}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, vendor: e.target.value } : r))
                          )
                        }
                        placeholder="Satria Kopi"
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        value={row.grossInput}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, grossInput: e.target.value } : r))
                          )
                        }
                        placeholder="658k / 658000"
                        disabled={disabled}
                      />
                      {isActive ? (
                        <div className="mt-1 text-[11px] text-slate-500">Parsed: {formatCurrency(gross, 'IDR')}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <Checkbox
                        checked={row.useHalfSplit}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, useHalfSplit: e.target.checked, companyTakesInput: '' }
                                : r
                            )
                          )
                        }
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        value={row.useHalfSplit ? String(companyTakes || 0) : row.companyTakesInput}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, companyTakesInput: e.target.value } : r))
                          )
                        }
                        placeholder="Company takes amount"
                        disabled={disabled || row.useHalfSplit}
                      />
                      {invalidCompanyTakes ? (
                        <div className="mt-1 text-[11px] text-rose-700">Must be ≤ gross.</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="font-medium text-slate-900">{formatCurrency(driverGets, 'IDR')}</div>
                      <div className="text-[11px] text-slate-500">
                        Company: {formatCurrency(companyTakes, 'IDR')}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                        disabled={disabled || rows.length <= 1}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setRows((prev) => [...prev, makeRow()])}
              disabled={disabled}
            >
              + Add vendor
            </Button>
            <div className="text-right text-sm text-slate-700">
              <div>Total gross: {formatCurrency(computed.totalGross, 'IDR')}</div>
              <div className="font-semibold">Company takes: {formatCurrency(computed.totalCompany, 'IDR')}</div>
              <div>Driver gets: {formatCurrency(computed.totalDriver, 'IDR')}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 flex gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={createItems} disabled={!canCreate}>
            Create Commission Items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
