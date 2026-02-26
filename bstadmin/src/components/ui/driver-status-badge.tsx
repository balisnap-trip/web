import * as React from 'react'

import { getDriverStatusMeta } from '@/lib/driver/status-label'
import { cn } from '@/lib/utils'

interface DriverStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string | null | undefined
  label?: string
}

const DriverStatusBadge = React.forwardRef<HTMLSpanElement, DriverStatusBadgeProps>(
  ({ status, label, className, ...props }, ref) => {
    const statusMeta = getDriverStatusMeta(status)

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold',
          statusMeta.className,
          className
        )}
        {...props}
      >
        {label || statusMeta.label}
      </span>
    )
  }
)
DriverStatusBadge.displayName = 'DriverStatusBadge'

export { DriverStatusBadge }
