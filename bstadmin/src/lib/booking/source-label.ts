export type BookingSourceMeta = {
  label: string
  className: string
  colorHex: string
}

const SOURCE_META: Record<string, BookingSourceMeta> = {
  GYG: {
    label: 'GetYourGuide',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    colorHex: '#4F46E5',
  },
  VIATOR: {
    label: 'Viator',
    className: 'bg-green-100 text-green-800 border-green-200',
    colorHex: '#10B981',
  },
  TRIPDOTCOM: {
    label: 'Trip.com',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    colorHex: '#F59E0B',
  },
  BOKUN: {
    label: 'Bokun',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    colorHex: '#8B5CF6',
  },
  DIRECT: {
    label: 'Direct',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    colorHex: '#06B6D4',
  },
  MANUAL: {
    label: 'Manual',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
    colorHex: '#6B7280',
  },
}

const FALLBACK_SOURCE_META: BookingSourceMeta = {
  label: '-',
  className: 'bg-gray-100 text-gray-800 border-gray-200',
  colorHex: '#6B7280',
}

export const getBookingSourceMeta = (source: string | null | undefined): BookingSourceMeta => {
  if (!source) return FALLBACK_SOURCE_META
  return SOURCE_META[source] || {
    label: source,
    className: FALLBACK_SOURCE_META.className,
    colorHex: FALLBACK_SOURCE_META.colorHex,
  }
}
