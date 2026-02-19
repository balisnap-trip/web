export type ReportPeriodMode = 'monthly' | 'yearly' | 'total'

export type PeriodValue = Record<ReportPeriodMode, number>

export type ReportPeriodOption = {
  key: string
  label: string
}

export type FinanceReportCompany = {
  bookingCount: PeriodValue
  income: PeriodValue
  expense: PeriodValue
  commissionIn: PeriodValue
  commissionOut: PeriodValue
  revenue: PeriodValue
}

export type PayeeBookingLine = {
  bookingId: number
  bookingRef: string | null
  tourName: string
  tourDate: string
  amount: number
}

export type PayeeSummary = {
  id: number
  name: string
  waPhone: string | null
  totals: PeriodValue
  bookingCounts: PeriodValue
  lines: Record<ReportPeriodMode, PayeeBookingLine[]>
}

export type FinanceReportPayload = {
  generatedAt: string
  period: {
    monthly: { key: string; label: string; options: ReportPeriodOption[] }
    yearly: { key: string; label: string; options: ReportPeriodOption[] }
  }
  company: FinanceReportCompany
  partners: PayeeSummary[]
  drivers: PayeeSummary[]
}
