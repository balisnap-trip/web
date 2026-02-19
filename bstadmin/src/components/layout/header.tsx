'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Bell, LogOut, Menu, User } from 'lucide-react'
import { useNotifications } from '@/hooks/use-notifications'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Header({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { data: session } = useSession()
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4 shadow-sm sm:px-6">
      <div className="flex items-center gap-4">
        {onOpenSidebar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-base font-medium text-gray-700">
          Welcome back, <span className="font-semibold text-gray-900">{session?.user?.name || session?.user?.email}</span>
        </h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <span className="font-medium capitalize">{session?.user?.role}</span>
        </div>

        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setOpen((prev) => !prev)}
            className="relative h-9 w-9"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>

          {open && (
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
                  notifications.map((n) => (
                    <Button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "w-full h-auto flex-col items-stretch gap-1 rounded-none border-b border-border px-4 py-3 text-left hover:bg-accent",
                        n.read && "opacity-70"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">{n.title}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(n.createdAt).toLocaleString('en-GB')}
                        </div>
                      </div>
                      {n.message && (
                        <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">
                          {n.message}
                        </div>
                      )}
                    </Button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </header>
  )
}
