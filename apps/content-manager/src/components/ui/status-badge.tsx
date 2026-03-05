import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusTone = "secondary" | "success" | "warning" | "destructive"

const STATUS_TO_TONE_MAP: Record<string, StatusTone> = {
  NEW: "secondary",
  READY: "secondary",
  ATTENTION: "warning",
  UPDATED: "warning",
  COMPLETED: "success",
  DONE: "success",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
  DRAFT: "secondary",
  IN_REVIEW: "warning",
  PUBLISHED: "success",
  FAILED: "destructive",
  ACTIVE: "success",
  INACTIVE: "secondary",
}

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: string | null | undefined
  label?: string
  tone?: StatusTone
  showIcon?: boolean
  iconClassName?: string
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, label, tone, className, ...props }, ref) => {
    const resolvedTone =
      tone || (status ? STATUS_TO_TONE_MAP[status] || "secondary" : "secondary")
    const resolvedLabel = label || (status ? String(status).replace(/_/g, " ") : "-")

    return (
      <Badge ref={ref} variant={resolvedTone} className={cn("uppercase", className)} {...props}>
        {resolvedLabel}
      </Badge>
    )
  }
)
StatusBadge.displayName = "StatusBadge"

export { StatusBadge }
export type { StatusTone }
