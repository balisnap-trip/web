import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import type { FinanceSummary } from '@/lib/finance/types'

interface FinanceSummaryCardProps {
  totals: FinanceSummary
}

export function FinanceSummaryCard({ totals }: FinanceSummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Summary</div>
          <div className="text-xs text-slate-500">Auto summary from the items above.</div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:flex-wrap sm:items-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Expense: {formatCurrency(totals.expense, 'IDR')}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Income: {formatCurrency(totals.income, 'IDR')}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Comm In: {formatCurrency(totals.commissionIn, 'IDR')}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Comm Out: {formatCurrency(totals.commissionOut, 'IDR')}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Net: {formatCurrency(totals.net, 'IDR')}
          </span>
        </div>
      </div>
    </Card>
  )
}
