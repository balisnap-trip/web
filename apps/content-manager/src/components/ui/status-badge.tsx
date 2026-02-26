import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone = "secondary" | "success" | "warning" | "destructive"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  tone?: StatusTone
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ label, tone = "secondary", className, ...props }, ref) => (
    <Badge ref={ref} variant={tone} className={cn("uppercase", className)} {...props}>
      {label}
    </Badge>
  )
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge }
export type { StatusTone }
