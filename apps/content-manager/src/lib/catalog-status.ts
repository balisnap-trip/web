import type { CatalogPublishJobDto } from "@/lib/core-api"

type StatusTone = "secondary" | "success" | "warning" | "destructive"

interface StatusMeta {
  label: string
  tone: StatusTone
}

const publishStatusMetaMap: Record<CatalogPublishJobDto["status"], StatusMeta> = {
  DRAFT: {
    label: "Draft",
    tone: "secondary"
  },
  IN_REVIEW: {
    label: "In Review",
    tone: "warning"
  },
  PUBLISHED: {
    label: "Published",
    tone: "success"
  },
  FAILED: {
    label: "Failed",
    tone: "destructive"
  }
}

export function getPublishStatusMeta(status: CatalogPublishJobDto["status"]): StatusMeta {
  return publishStatusMetaMap[status]
}

export function getCatalogItemStatusMeta(isActive: boolean, isFeatured: boolean): StatusMeta {
  if (isActive && isFeatured) {
    return {
      label: "Active Featured",
      tone: "success"
    }
  }

  if (isActive) {
    return {
      label: "Active",
      tone: "success"
    }
  }

  return {
    label: "Inactive",
    tone: "destructive"
  }
}

export function getCatalogVariantStatusMeta(isActive: boolean, isDefault: boolean): StatusMeta {
  if (isActive && isDefault) {
    return {
      label: "Active Default",
      tone: "success"
    }
  }

  if (isActive) {
    return {
      label: "Active",
      tone: "success"
    }
  }

  return {
    label: "Inactive",
    tone: "destructive"
  }
}
