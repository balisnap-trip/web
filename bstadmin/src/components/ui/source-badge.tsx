import * as React from 'react'

import { getBookingSourceMeta } from '@/lib/booking/source-label'
import { cn } from '@/lib/utils'

interface SourceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  source: string | null | undefined
  label?: string
}

const SourceBadge = React.forwardRef<HTMLSpanElement, SourceBadgeProps>(
  ({ source, label, className, ...props }, ref) => {
    const sourceMeta = getBookingSourceMeta(source)

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
          sourceMeta.className,
          className
        )}
        {...props}
      >
        {label || sourceMeta.label}
      </span>
    )
  }
)
SourceBadge.displayName = 'SourceBadge'

export { SourceBadge }
