export type InvoiceTotalsBasic = {
  itemCount: number
  bookingCount: number
  total: number
  paid: number
  due: number
}

export type VendorInvoiceBookingSummary = {
  bookingId: number
  bookingRef: string | null
  tourName: string
  tourDate: string
  total: number
  paid: number
  due: number
}

export type VendorInvoiceSummary = {
  partnerId: number
  partnerName: string
  picName: string | null
  picWhatsapp: string | null
  totals: InvoiceTotalsBasic
  bookings: VendorInvoiceBookingSummary[]
}

export type DriverInvoiceTotals = {
  itemCount: number
  bookingCount: number

  payTotal: number
  payPaid: number
  payDue: number

  collectTotal: number
  collectPaid: number
  collectDue: number

  netTotal: number
  netDue: number
}

export type DriverInvoiceBookingSummary = {
  bookingId: number
  bookingRef: string | null
  tourName: string
  tourDate: string

  payTotal: number
  payPaid: number
  payDue: number

  collectTotal: number
  collectPaid: number
  collectDue: number

  netTotal: number
  netDue: number
}

export type DriverInvoiceSummary = {
  driverId: number
  driverName: string
  driverPhone: string | null
  totals: DriverInvoiceTotals
  bookings: DriverInvoiceBookingSummary[]
}

export type InvoiceStatementsPayload = {
  month: string
  includePaid: boolean
  generatedAt: string
  vendors: VendorInvoiceSummary[]
  drivers: DriverInvoiceSummary[]
}

