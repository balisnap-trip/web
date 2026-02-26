export type DriverStatusMeta = {
  label: string
  className: string
}

const DRIVER_STATUS_META: Record<string, DriverStatusMeta> = {
  AVAILABLE: {
    label: 'AVAILABLE',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  BUSY: {
    label: 'BUSY',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  OFF_DUTY: {
    label: 'OFF_DUTY',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  INACTIVE: {
    label: 'INACTIVE',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
}

const FALLBACK_DRIVER_STATUS_META: DriverStatusMeta = {
  label: '-',
  className: 'bg-gray-100 text-gray-800 border-gray-200',
}

export const getDriverStatusMeta = (status: string | null | undefined): DriverStatusMeta => {
  if (!status) return FALLBACK_DRIVER_STATUS_META
  return DRIVER_STATUS_META[status] || {
    label: status,
    className: FALLBACK_DRIVER_STATUS_META.className,
  }
}
