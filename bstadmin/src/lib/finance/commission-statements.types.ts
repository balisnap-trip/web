export type CommissionStatementLine = {
  financeItemId: number
  bookingId: number
  bookingRef: string | null
  tourName: string
  tourDate: string
  driverId: number | null
  driverName: string | null
  driverPhone: string | null
  vendor: string | null
  gross: number | null
  companyTakes: number
  driverGets: number | null
  notes: string | null
}

export type CommissionStatementTotals = {
  count: number
  grossTotalKnown: number
  companyTakesTotal: number
  driverGetsTotalKnown: number
  unknownGrossCount: number
}

export type CommissionGroupByDriver = {
  driverId: number | null
  driverName: string
  driverPhone: string | null
  totals: CommissionStatementTotals
  lines: CommissionStatementLine[]
}

export type CommissionGroupByVendor = {
  vendor: string
  totals: CommissionStatementTotals
  lines: CommissionStatementLine[]
}

export type CommissionStatementsPayload = {
  month: string
  generatedAt: string
  byDriver: CommissionGroupByDriver[]
  byVendor: CommissionGroupByVendor[]
}

