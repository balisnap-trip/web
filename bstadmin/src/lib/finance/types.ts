export interface FinanceSummary {
  expense: number
  income: number
  commissionIn: number
  commissionOut: number
  net: number
}

export interface BookingListItem {
  id: number
  bookingRef: string | null
  status: string
  tourDate: string
  numberOfAdult: number
  numberOfChild: number | null
  mainContactName: string
  package: { packageName: string; tour?: { tourName: string } | null } | null
  driver: { id: number; name: string } | null
  finance: { id: number; validatedAt: string | null; isLocked: boolean } | null
  financeSummary?: FinanceSummary
}

export interface Partner {
  id: number
  name: string
}

export interface Driver {
  id: number
  name: string
}

export interface TourItemCategory {
  id: number | null
  code: string
  name: string
  defaultDirection: string
  payeeMode: string
  autoDriverFromBooking: boolean
  isCommission: boolean
  allowRelatedItem: boolean
  requirePartner: boolean
}

export interface ServiceItem {
  id: number
  name: string
  financeCategoryId?: number | null
  tourItemCategoryId?: number | null
  financeCategoryRef?: TourItemCategory | null
  tourItemCategoryRef?: TourItemCategory | null
  partners?: Partner[]
  drivers?: Driver[]
  defaultPartnerId?: number | null
}

export interface FinanceItemForm {
  id?: number
  serviceItemId?: number | null
  nameSnapshot: string
  tourItemCategoryIdSnapshot?: number | null
  tourItemCategoryNameSnapshot?: string | null
  isCommissionSnapshot?: boolean
  allowRelatedItemSnapshot?: boolean
  direction: string
  isManual?: boolean
  unitType: string
  unitQty: number
  unitPrice: number
  amount: number
  driverId?: number | null
  partnerId?: number | null
  relatedItemId?: number | null
  relationType?: string | null
  notes?: string | null
}
