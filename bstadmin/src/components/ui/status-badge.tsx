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

type StatusTone = 'secondary' | 'success' | 'warning' | 'destructive'

const TONE_CLASS_MAP: Record<StatusTone, string> = {
  secondary: 'border-slate-200 bg-slate-100 text-slate-700',
  success: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  warning: 'border-amber-200 bg-amber-100 text-amber-800',
  destructive: 'border-rose-200 bg-rose-100 text-rose-700',
}

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: string | null | undefined
  label?: string
  tone?: StatusTone
  showIcon?: boolean
  iconClassName?: string
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, tone = 'secondary', showIcon = false, iconClassName, className, ...props }, ref) => {
    const hasDomainStatus = Boolean(status)
    const statusMeta = hasDomainStatus ? getBookingStatusMeta(status) : null
    const Icon = status ? STATUS_ICON_MAP[status] : undefined

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
          hasDomainStatus ? statusMeta?.className : TONE_CLASS_MAP[tone],
          className
        )}
        {...props}
      >
        {hasDomainStatus && showIcon && Icon ? <Icon className={cn('h-3.5 w-3.5', iconClassName)} /> : null}
        {label || statusMeta?.label || (status ? String(status) : '-')}
      </span>
    )
  }
)
StatusBadge.displayName = 'StatusBadge'

export { StatusBadge }
export type { StatusTone }
