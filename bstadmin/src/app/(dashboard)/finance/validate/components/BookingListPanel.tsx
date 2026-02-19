import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/date-format'
import { getBookingStatusMeta } from '@/lib/booking/status-label'
import type { BookingListItem } from '@/lib/finance/types'

type StatusOption = { value: string; label: string }

interface BookingListPanelProps {
  bookings: BookingListItem[]
  selectedBookingId: number | null
  statusFilter: string
  statusOptions: StatusOption[]
  onStatusChange: (value: string) => void
  onSelectBooking: (booking: BookingListItem) => void
}

export function BookingListPanel({
  bookings,
  selectedBookingId,
  statusFilter,
  statusOptions,
  onStatusChange,
  onSelectBooking,
}: BookingListPanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Bookings</div>
          <div className="text-xs text-slate-500">Select a booking to review.</div>
        </div>
        <div className="text-xs text-slate-400">{bookings.length} booking(s)</div>
      </div>
      <div className="mt-3">
        <Label className="text-xs text-slate-500">Status</Label>
        <Select
          className="mt-1"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          No bookings available for this filter.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {bookings.map((booking) => {
            const paxLabel = `${booking.numberOfAdult}A${booking.numberOfChild ? ` ${booking.numberOfChild}C` : ''}`
            const isActive = selectedBookingId === booking.id
            const statusMeta = getBookingStatusMeta(booking.status)
            return (
              <Button
                key={booking.id}
                type="button"
                variant="ghost"
                className={`w-full h-auto justify-start overflow-hidden p-0 text-left rounded-lg border transition-all duration-200 ${
                  isActive
                    ? 'border-blue-500 bg-blue-50/90 hover:bg-blue-50/90 shadow-md hover:shadow-lg'
                    : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-blue-300 hover:shadow-sm'
                }`}
                onClick={() => onSelectBooking(booking)}
              >
                <div className="w-full min-w-0 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {booking.bookingRef || `#${booking.id}`}
                        </div>
                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 flex-shrink-0">
                          {paxLabel}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        Guest: {booking.mainContactName || 'Not set'}
                      </div>
                    </div>
                    <div className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold border ${statusMeta.className}`}>
                      {statusMeta.label}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span>Tour Date: {formatDate(booking.tourDate)}</span>
                    </div>
                    <div className="text-xs text-slate-600 truncate">
                      {booking.package?.tour?.tourName ? `${booking.package.tour.tourName} • ` : ''}
                      {booking.package?.packageName}
                    </div>
                  </div>

                  {booking.financeSummary && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Expense:</span>
                          <span className="font-medium text-slate-700">
                            {formatCurrency(booking.financeSummary.expense, 'IDR')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Income:</span>
                          <span className="font-medium text-slate-700">
                            {formatCurrency(booking.financeSummary.income, 'IDR')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Comm In:</span>
                          <span className="font-medium text-slate-700">
                            {formatCurrency(booking.financeSummary.commissionIn, 'IDR')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Comm Out:</span>
                          <span className="font-medium text-slate-700">
                            {formatCurrency(booking.financeSummary.commissionOut, 'IDR')}
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-between pt-1 border-t border-slate-100">
                          <span className="text-sm font-semibold text-slate-800">Net:</span>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(booking.financeSummary.net, 'IDR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
