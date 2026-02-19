export type BookingStatusMeta = {
  label: string
  className: string
}

export const getBookingStatusMeta = (status: string | null | undefined): BookingStatusMeta => {
  switch (status) {
    case 'NEW':
      return { label: 'Need Assigned', className: 'bg-slate-50 text-slate-700 border-slate-200' }
    case 'READY':
      return { label: 'Waiting Tour Date', className: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'ATTENTION':
      return { label: 'Need Review', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'COMPLETED':
      return { label: 'Awaiting Payment', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'DONE':
      return { label: 'Done', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' }
    case 'NO_SHOW':
      return { label: 'No Show', className: 'bg-gray-100 text-gray-700 border-gray-300' }
    case 'CANCELLED':
      return { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' }
    case 'UPDATED':
      return { label: 'Updated', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    default:
      return { label: status || '-', className: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}
