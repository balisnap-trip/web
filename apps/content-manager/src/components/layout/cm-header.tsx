"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { BellIcon, LogoutIcon, MenuIcon, UserIcon } from "@/components/layout/cm-icons";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function CMHeader({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { data: session } = useSession();
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const role = String(session?.user?.role || "-");
  const identity = session?.user?.name || session?.user?.email || "Unknown user";

  useEffect(() => {
    if (!notificationOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || !notificationPanelRef.current?.contains(target)) {
        setNotificationOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 shadow-sm backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-4">
        {onOpenSidebar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        ) : null}
        <div>
          <h2 className="text-sm font-medium text-gray-700 sm:text-base">
            Welcome back, <span className="font-semibold text-gray-900">{identity}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Content Authoring Console</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative" ref={notificationPanelRef}>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="relative h-9 w-9"
            onClick={() => setNotificationOpen((previous) => !previous)}
            aria-label="Notifications"
          >
            <BellIcon className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Button>

          {notificationOpen ? (
            <div className="absolute right-0 mt-2 w-96 max-w-[90vw] rounded-xl border border-border bg-background shadow-lg">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="text-sm font-semibold text-gray-900">Notification History</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={markAllRead}
                  >
                    Mark all read
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearAll}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">No notifications yet.</div>
                ) : (
                  notifications.map((notification) => (
                    <Button
                      key={notification.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-auto w-full flex-col items-stretch gap-1 rounded-none border-b border-border px-4 py-3 text-left hover:bg-accent",
                        notification.read ? "opacity-70" : ""
                      )}
                      onClick={() => markRead(notification.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">{notification.title}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(notification.createdAt).toLocaleString("en-GB")}
                        </div>
                      </div>
                      {notification.message ? (
                        <div className="mt-1 whitespace-pre-line text-xs text-gray-600">
                          {notification.message}
                        </div>
                      ) : null}
                    </Button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="hidden items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-600 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <UserIcon className="h-4 w-4" />
          </span>
          <span className="font-medium capitalize">{role.toLowerCase()}</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogoutIcon className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </header>
  );
}
