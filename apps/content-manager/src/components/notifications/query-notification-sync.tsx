"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { type NotificationType } from "@/components/notifications/notification-provider";
import { useNotifications } from "@/hooks/use-notifications";

const HANDLED_PREFIX = "cm_notification_handled:";

function toTitleCase(input: string) {
  return input
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveNotificationType(result: string | null, error: string | null): NotificationType {
  if (error || result === "FAILED") {
    return "error";
  }
  if (result?.includes("IN_REVIEW")) {
    return "info";
  }
  if (result?.includes("DEACTIVATED") || result?.includes("RETRIED")) {
    return "warning";
  }
  return "success";
}

function resolveNotificationTitle(result: string | null, error: string | null) {
  if (error || result === "FAILED") {
    return "Operation Failed";
  }
  if (!result) {
    return "Operation Completed";
  }
  return toTitleCase(result);
}

export function QueryNotificationSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { notify } = useNotifications();

  useEffect(() => {
    const result = searchParams.get("result")?.trim() || null;
    const error = searchParams.get("error")?.trim() || null;

    if (!result && !error) {
      return;
    }

    const signature = `${pathname}|${result || ""}|${error || ""}`;
    const deduplicationKey = `${HANDLED_PREFIX}${signature}`;

    if (sessionStorage.getItem(deduplicationKey) === "1") {
      return;
    }

    notify({
      type: resolveNotificationType(result, error),
      title: resolveNotificationTitle(result, error),
      message: error || (result ? `Result: ${result}` : undefined)
    });

    sessionStorage.setItem(deduplicationKey, "1");
  }, [notify, pathname, searchParams]);

  return null;
}
