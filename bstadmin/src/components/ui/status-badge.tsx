import * as React from 'react'
import { AlertCircle, CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react'

import { getBookingStatusMeta } from '@/lib/booking/status-label'
import { cn } from '@/lib/utils'

const STATUS_ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  NEW: Clock,
  READY: Clock,
  ATTENTION: AlertCircle,
  UPDATED: RefreshCw,
  COMPLETED: CheckCircle,
  DONE: CheckCircle,
  CANCELLED: XCircle,
  NO_SHOW: AlertCircle,
}

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string | null | undefined
  label?: string
  showIcon?: boolean
  iconClassName?: string
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, showIcon = false, iconClassName, className, ...props }, ref) => {
    const statusMeta = getBookingStatusMeta(status)
    const Icon = status ? STATUS_ICON_MAP[status] : undefined

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
          statusMeta.className,
          className
        )}
        {...props}
      >
        {showIcon && Icon ? <Icon className={cn('h-3.5 w-3.5', iconClassName)} /> : null}
        {label || statusMeta.label}
      </span>
    )
  }
)
StatusBadge.displayName = 'StatusBadge'

export { StatusBadge }
