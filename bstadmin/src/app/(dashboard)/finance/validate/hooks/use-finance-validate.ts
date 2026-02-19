import { useEffect, useMemo, useState } from 'react'
import { useNotifications } from '@/hooks/use-notifications'
import { canDriver, canPartner } from '@/lib/finance/payee'
import { isTourDayOrPastBali } from '@/lib/booking/bali-date'
import type {
  BookingListItem,
  FinanceItemForm,
  FinanceSummary,
  Partner,
  Driver,
  ServiceItem,
  TourItemCategory,
} from '@/lib/finance/types'

const DIRECTION_OPTIONS = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
]

const STATUS_OPTIONS = [
  { value: 'unvalidated', label: 'Needs Review' },
  { value: 'validated', label: 'Reviewed' },
  { value: 'all', label: 'All' },
]

const DEFAULT_CATEGORY: TourItemCategory = {
  id: null,
  code: 'UNCATEGORIZED',
  name: 'Uncategorized',
  defaultDirection: 'EXPENSE',
  payeeMode: 'PARTNER_ONLY',
  autoDriverFromBooking: false,
  isCommission: false,
  allowRelatedItem: false,
  requirePartner: true,
}

const isTourDayOrPast = (tourDate: string | Date) => isTourDayOrPastBali(new Date(tourDate), new Date())

export const useFinanceValidate = ({ initialBookingId }: { initialBookingId: string | null }) => {
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [selectedBooking, setSelectedBooking] = useState<BookingListItem | null>(null)
  const [items, setItems] = useState<FinanceItemForm[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [statusFilter, setStatusFilter] = useState('unvalidated')
  const [isValidatable, setIsValidatable] = useState(true)
  const [showWarning, setShowWarning] = useState(false)
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [categories, setCategories] = useState<TourItemCategory[]>([])
  const [financeLocked, setFinanceLocked] = useState(false)
  const [showNewServiceModal, setShowNewServiceModal] = useState(false)
  const [showNewPartnerModal, setShowNewPartnerModal] = useState(false)
  const [pendingItemIndex, setPendingItemIndex] = useState<number | null>(null)
  const [pendingPartnerIndex, setPendingPartnerIndex] = useState<number | null>(null)
  const [savingServiceItem, setSavingServiceItem] = useState(false)
  const [savingPartner, setSavingPartner] = useState(false)
  const [payeeEditorOpen, setPayeeEditorOpen] = useState<Record<string, boolean>>({})
  const [newServiceForm, setNewServiceForm] = useState({ name: '', tourItemCategoryId: '' })
  const [newPartnerForm, setNewPartnerForm] = useState({
    name: '',
    picName: '',
    picWhatsapp: '',
  })
  const { notify } = useNotifications()

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const serviceItemMap = useMemo(() => new Map(serviceItems.map((item) => [item.id, item])), [serviceItems])

  const resolveCategory = (item: Partial<FinanceItemForm> & { serviceItemId?: number | null }) => {
    const service = item.serviceItemId ? serviceItemMap.get(item.serviceItemId) : null
    if (service?.financeCategoryRef) return service.financeCategoryRef
    if (service?.tourItemCategoryRef) return service.tourItemCategoryRef
    if (item.tourItemCategoryIdSnapshot) {
      const found = categoryMap.get(item.tourItemCategoryIdSnapshot)
      if (found) return found
    }
    return DEFAULT_CATEGORY
  }

  const allowDriver = (category: TourItemCategory | null | undefined) => canDriver(category?.payeeMode)
  const allowPartner = (category: TourItemCategory | null | undefined) => canPartner(category?.payeeMode)
  const isCommissionItem = (item: FinanceItemForm) => {
    if (item.isCommissionSnapshot !== undefined) return Boolean(item.isCommissionSnapshot)
    const category = resolveCategory(item)
    return Boolean(category?.isCommission)
  }
  const allowRelatedItem = (item: FinanceItemForm) => {
    if (item.allowRelatedItemSnapshot !== undefined) return Boolean(item.allowRelatedItemSnapshot)
    const category = resolveCategory(item)
    return Boolean(category?.allowRelatedItem)
  }

  useEffect(() => {
    fetchReferenceData()
  }, [])

  useEffect(() => {
    fetchBookings(statusFilter)
  }, [statusFilter])

  useEffect(() => {
    if (!initialBookingId) return
    const bookingId = Number(initialBookingId)
    if (!Number.isFinite(bookingId)) return

    const existing = bookings.find((b) => b.id === bookingId)
    if (existing) {
      handleSelectBooking(existing)
      return
    }

    fetchBookingListItem(bookingId).then((fallback) => {
      if (fallback) {
        setBookings((prev) => (prev.some((b) => b.id === fallback.id) ? prev : [fallback, ...prev]))
        handleSelectBooking(fallback)
      }
    })
  }, [initialBookingId, bookings])

  const computeSummary = (financeItems: any[]): FinanceSummary => {
    const withAmount = financeItems.map((item) => ({
      ...item,
      amount: Number(item.amount || 0),
    }))
    const expense = withAmount
      .filter((item) => item.direction === 'EXPENSE' && !isCommissionItem(item))
      .reduce((sum, item) => sum + item.amount, 0)
    const income = withAmount
      .filter((item) => item.direction === 'INCOME' && !isCommissionItem(item))
      .reduce((sum, item) => sum + item.amount, 0)
    const commissionIn = withAmount
      .filter((item) => item.direction === 'INCOME' && isCommissionItem(item))
      .reduce((sum, item) => sum + item.amount, 0)
    const commissionOut = withAmount
      .filter((item) => item.direction === 'EXPENSE' && isCommissionItem(item))
      .reduce((sum, item) => sum + item.amount, 0)
    const net = expense + commissionOut - income - commissionIn
    return { expense, income, commissionIn, commissionOut, net }
  }

  const fetchReferenceData = async () => {
    try {
      const [serviceRes, partnerRes, driverRes, categoryRes] = await Promise.all([
        fetch('/api/service-items'),
        fetch('/api/partners'),
        fetch('/api/drivers'),
        fetch('/api/tour-item-categories'),
      ])

      const serviceData = await serviceRes.json()
      const partnerData = await partnerRes.json()
      const driverData = await driverRes.json()
      const categoryData = await categoryRes.json()

      if (serviceData.items) setServiceItems(serviceData.items)
      if (partnerData.partners) setPartners(partnerData.partners)
      if (driverData.drivers) setDrivers(driverData.drivers)
      if (categoryData.categories) setCategories(categoryData.categories)
    } catch (error) {
      notify({ type: 'error', title: 'Load Reference Data Error', message: String(error) })
    }
  }

  const fetchBookings = async (status: string) => {
    setLoading(true)
    try {
      const bookingRes = await fetch(`/api/finance/validate?status=${status}`)
      const bookingData = await bookingRes.json()
      if (bookingData.bookings) setBookings(bookingData.bookings)
    } catch (error) {
      notify({ type: 'error', title: 'Load Bookings Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const fetchBookingListItem = async (bookingId: number) => {
    try {
      const res = await fetch(`/api/finance/booking/${bookingId}`)
      const data = await res.json()
      if (!data.booking) return null
      const booking = data.booking
      const financeItems = booking.finance?.items || []
      const summary = computeSummary(financeItems)
      return {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        tourDate: booking.tourDate,
        numberOfAdult: booking.numberOfAdult,
        numberOfChild: booking.numberOfChild,
        mainContactName: booking.mainContactName,
        package: booking.package,
        driver: booking.driver,
        finance: booking.finance
          ? { id: booking.finance.id, validatedAt: booking.finance.validatedAt, isLocked: booking.finance.isLocked }
          : null,
        financeSummary: summary,
      } as BookingListItem
    } catch {
      return null
    }
  }

  const handleSelectBooking = async (booking: BookingListItem) => {
    setSelectedBooking(booking)
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/booking/${booking.id}`)
      const data = await res.json()
      if (data.booking?.finance) {
        setFinanceLocked(Boolean(data.booking.finance.isLocked))
        const bookingDriverId = data.booking.driver?.id ?? null
        const financeItems = data.booking.finance.items.map((item: any) => {
          const category = item.tourItemCategoryIdSnapshot
            ? categoryMap.get(item.tourItemCategoryIdSnapshot) || DEFAULT_CATEGORY
            : DEFAULT_CATEGORY
          const resolvedCategory = category || DEFAULT_CATEGORY
          const canDriverPayee = allowDriver(resolvedCategory)
          const canPartnerPayee = allowPartner(resolvedCategory)
          const driverId = canDriverPayee
            ? item.driverId ?? (resolvedCategory.autoDriverFromBooking ? bookingDriverId : null)
            : null
          const partnerId = canPartnerPayee ? item.partnerId : null
          const isManual = item.serviceItemId ? Boolean(item.isManual) : true
          return {
            id: item.id,
            serviceItemId: item.serviceItemId,
            nameSnapshot: item.nameSnapshot,
            tourItemCategoryIdSnapshot: item.tourItemCategoryIdSnapshot ?? resolvedCategory.id ?? null,
            tourItemCategoryNameSnapshot: item.tourItemCategoryNameSnapshot ?? resolvedCategory.name,
            isCommissionSnapshot: item.isCommissionSnapshot ?? resolvedCategory.isCommission,
            allowRelatedItemSnapshot: item.allowRelatedItemSnapshot ?? resolvedCategory.allowRelatedItem,
            direction: item.direction,
            isManual,
            unitType: item.unitType,
            unitQty: item.unitQty,
            unitPrice: Number(item.unitPrice ?? 0),
            amount: Number(item.amount ?? 0),
            driverId,
            partnerId,
            relatedItemId: item.relatedItemId,
            relationType: item.relationType,
            notes: item.notes ?? '',
          } satisfies FinanceItemForm
        })
        setItems(financeItems)
      } else {
        setFinanceLocked(false)
        setItems([])
      }

      const valid = isTourDayOrPast(booking.tourDate)
      setIsValidatable(valid)
      setShowWarning(false)
    } catch (error) {
      notify({ type: 'error', title: 'Load Booking Error', message: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = () => {
    const firstService = serviceItems[0]
    const category = firstService?.financeCategoryRef || firstService?.tourItemCategoryRef || categories[0] || DEFAULT_CATEGORY
    const canPartnerPayee = allowPartner(category)
    const canDriverPayee = allowDriver(category)
    const defaultPartnerId = canPartnerPayee
      ? firstService?.defaultPartnerId ?? firstService?.partners?.[0]?.id ?? null
      : null
    const bookingDriverId = selectedBooking?.driver?.id ?? null
    const defaultDriverId =
      canDriverPayee
        ? category.autoDriverFromBooking
          ? bookingDriverId ?? firstService?.drivers?.[0]?.id ?? null
          : firstService?.drivers?.[0]?.id ?? null
        : null
    const defaultDirection = category.defaultDirection || 'EXPENSE'
    setItems((prev) => [
      ...prev,
      {
        nameSnapshot: firstService?.name || '',
        serviceItemId: firstService?.id || null,
        tourItemCategoryIdSnapshot: category.id ?? null,
        tourItemCategoryNameSnapshot: category.name || 'Uncategorized',
        isCommissionSnapshot: category.isCommission ?? false,
        allowRelatedItemSnapshot: category.allowRelatedItem ?? false,
        direction: defaultDirection,
        isManual: true,
        unitType: 'PER_BOOKING',
        unitQty: 1,
        unitPrice: 0,
        amount: 0,
        partnerId: defaultPartnerId,
        driverId: defaultDriverId,
        relatedItemId: null,
        relationType: null,
        notes: '',
      },
    ])
  }

  const updateItem = (index: number, patch: Partial<FinanceItemForm>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const appendItems = (nextItems: FinanceItemForm[]) => {
    if (!Array.isArray(nextItems) || nextItems.length === 0) return
    setItems((prev) => [...prev, ...nextItems])
  }

  const togglePayeeEditor = (key: string) => {
    setPayeeEditorOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => {
      const removedId = prev[index]?.id
      const next = prev.filter((_, i) => i !== index)
      if (!removedId) return next
      return next.map((item) =>
        item.relatedItemId === removedId ? { ...item, relatedItemId: null, relationType: null } : item
      )
    })
  }

  const openNewServiceItem = (index: number) => {
    setPendingItemIndex(index)
    setNewServiceForm({ name: '', tourItemCategoryId: '' })
    setShowNewServiceModal(true)
  }

  const openNewPartner = (index: number) => {
    setPendingPartnerIndex(index)
    setNewPartnerForm({ name: '', picName: '', picWhatsapp: '' })
    setShowNewPartnerModal(true)
  }

  const handleCreateServiceItem = async () => {
    if (!newServiceForm.name.trim()) {
      notify({ type: 'warning', title: 'Item name is required' })
      return
    }
    if (!newServiceForm.tourItemCategoryId) {
      notify({ type: 'warning', title: 'Category is required' })
      return
    }
    setSavingServiceItem(true)
    try {
      const categoryId = Number(newServiceForm.tourItemCategoryId)
      const res = await fetch('/api/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newServiceForm.name.trim(),
          financeCategoryId: categoryId,
          tourItemCategoryId: categoryId,
          isActive: true,
          partnerIds: [],
          driverIds: [],
        }),
      })
      const data = await res.json()
      if (data.success && data.item) {
        setServiceItems((prev) => {
          const next = [...prev, data.item]
          return next.sort((a, b) => a.name.localeCompare(b.name))
        })
        if (pendingItemIndex !== null) {
          const category = data.item.financeCategoryRef || data.item.tourItemCategoryRef || DEFAULT_CATEGORY
          updateItem(pendingItemIndex, {
            serviceItemId: data.item.id,
            nameSnapshot: data.item.name,
            tourItemCategoryIdSnapshot: category.id ?? null,
            tourItemCategoryNameSnapshot: category.name || 'Uncategorized',
            isCommissionSnapshot: category.isCommission ?? false,
            allowRelatedItemSnapshot: category.allowRelatedItem ?? false,
            direction: category.defaultDirection || 'EXPENSE',
          })
        }
        setShowNewServiceModal(false)
        setPendingItemIndex(null)
        setNewServiceForm({ name: '', tourItemCategoryId: '' })
        notify({ type: 'success', title: 'Tour item created' })
      } else {
        notify({ type: 'error', title: 'Create Item Failed', message: data.error || 'Unknown error' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Create Item Failed', message: String(error) })
    } finally {
      setSavingServiceItem(false)
    }
  }

  const handleCreatePartner = async () => {
    if (!newPartnerForm.name.trim()) {
      notify({ type: 'warning', title: 'Partner name is required' })
      return
    }
    const inferredCategoryId =
      pendingPartnerIndex !== null
        ? items[pendingPartnerIndex]?.tourItemCategoryIdSnapshot || null
        : null
    setSavingPartner(true)
    try {
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPartnerForm.name.trim(),
          picName: newPartnerForm.picName.trim() || null,
          picWhatsapp: newPartnerForm.picWhatsapp.trim() || null,
          financeCategoryId: inferredCategoryId,
          tourItemCategoryId: inferredCategoryId,
        }),
      })
      const data = await res.json()
      if (data.success && data.partner) {
        setPartners((prev) => {
          const next = [...prev, data.partner]
          return next.sort((a, b) => a.name.localeCompare(b.name))
        })
        if (pendingPartnerIndex !== null) {
          updateItem(pendingPartnerIndex, { partnerId: data.partner.id })
        }
        setShowNewPartnerModal(false)
        setPendingPartnerIndex(null)
        setNewPartnerForm({ name: '', picName: '', picWhatsapp: '' })
        notify({ type: 'success', title: 'Partner created' })
      } else {
        notify({ type: 'error', title: 'Create Partner Failed', message: data.error || 'Unknown error' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Create Partner Failed', message: String(error) })
    } finally {
      setSavingPartner(false)
    }
  }

  const buildPayloadItems = () =>
    items.map((item) => {
      const rawQty = Number(item.unitQty ?? 1)
      const unitQty = Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 1
      const rawAmount = Number(item.amount ?? 0)
      const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0
      const unitPrice = unitQty > 0 ? amount / unitQty : amount
      const category = resolveCategory(item)
      const canDriverPayee = allowDriver(category)
      const canPartnerPayee = allowPartner(category)
      const relatedAllowed = allowRelatedItem(item)
      const relatedItemId = relatedAllowed ? item.relatedItemId ?? null : null
      const tourItemCategoryIdSnapshot = item.tourItemCategoryIdSnapshot ?? category.id ?? null
      const tourItemCategoryNameSnapshot =
        item.tourItemCategoryNameSnapshot ?? category.name ?? DEFAULT_CATEGORY.name
      const isCommissionSnapshot = item.isCommissionSnapshot ?? category.isCommission
      const allowRelatedItemSnapshot = item.allowRelatedItemSnapshot ?? category.allowRelatedItem
      return {
        ...item,
        unitQty,
        amount,
        unitPrice,
        tourItemCategoryIdSnapshot,
        tourItemCategoryNameSnapshot,
        isCommissionSnapshot,
        allowRelatedItemSnapshot,
        partnerId: canPartnerPayee ? item.partnerId || null : null,
        driverId: canDriverPayee ? item.driverId || null : null,
        relatedItemId,
      }
    })

  const handleSaveDraft = async () => {
    if (!selectedBooking) return
    setSavingDraft(true)
    try {
      const res = await fetch(`/api/finance/booking/${selectedBooking.id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: buildPayloadItems() }),
      })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Draft saved' })
        fetchBookings(statusFilter)
      } else {
        notify({ type: 'error', title: 'Save Draft Failed', message: data.error || 'Unknown error' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Save Draft Failed', message: String(error) })
    } finally {
      setSavingDraft(false)
    }
  }

  const handleValidate = async () => {
    if (!selectedBooking) return
    if (!isValidatable) {
      setShowWarning(true)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/finance/booking/${selectedBooking.id}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: buildPayloadItems(), markValidated: true }),
      })
      const data = await res.json()
      if (data.success) {
        notify({ type: 'success', title: 'Finance validated' })
        fetchBookings(statusFilter)
        if (selectedBooking) {
          handleSelectBooking(selectedBooking)
        }
      } else {
        notify({ type: 'error', title: 'Validate Failed', message: data.error || 'Unknown error' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Validate Failed', message: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleLock = async () => {
    if (!selectedBooking) return
    try {
      const res = await fetch(`/api/finance/booking/${selectedBooking.id}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: !financeLocked }),
      })
      const data = await res.json()
      if (data.success) {
        setFinanceLocked(!financeLocked)
        notify({ type: 'success', title: financeLocked ? 'Finance Unlocked' : 'Finance Locked' })
      } else {
        notify({ type: 'error', title: 'Lock Failed', message: data.error || 'Unknown error' })
      }
    } catch (error) {
      notify({ type: 'error', title: 'Lock Failed', message: String(error) })
    }
  }

  const totals = useMemo(() => {
    const expenseBase = items
      .filter((item) => item.direction === 'EXPENSE' && !isCommissionItem(item))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const incomeBase = items
      .filter((item) => item.direction === 'INCOME' && !isCommissionItem(item))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const commissionIn = items
      .filter((item) => item.direction === 'INCOME' && isCommissionItem(item))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const commissionOut = items
      .filter((item) => item.direction === 'EXPENSE' && isCommissionItem(item))
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const net = expenseBase + commissionOut - incomeBase - commissionIn
    return { expense: expenseBase, income: incomeBase, commissionIn, commissionOut, net }
  }, [items])

  return {
    bookings,
    selectedBooking,
    items,
    loading,
    saving,
    savingDraft,
    statusFilter,
    isValidatable,
    showWarning,
    serviceItems,
    partners,
    drivers,
    categories,
    financeLocked,
    showNewServiceModal,
    showNewPartnerModal,
    pendingItemIndex,
    pendingPartnerIndex,
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
  }
}
