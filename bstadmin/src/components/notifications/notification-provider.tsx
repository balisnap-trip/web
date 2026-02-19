'use client'

import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message?: string
  createdAt: string
  read: boolean
  source?: 'local' | 'server'
}

export interface NotificationInput {
  type: NotificationType
  title: string
  message?: string
}

interface NotificationContextValue {
  notifications: NotificationItem[]
  unreadCount: number
  notify: (input: NotificationInput) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const STORAGE_KEY = 'bst_notifications'
const MAX_ITEMS = 100

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[]>([])
  const [serverNotifications, setServerNotifications] = useState<NotificationItem[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as NotificationItem[]
        if (Array.isArray(parsed)) {
          setLocalNotifications(parsed.map((item) => ({ ...item, source: 'local' })))
        }
      }
    } catch {
      // ignore storage errors
    }

    ;(async () => {
      try {
        const res = await fetch('/api/notifications')
        if (!res.ok) return
        const data = await res.json()
        if (data?.notifications && Array.isArray(data.notifications)) {
          const mapped = data.notifications.map((n: any) => ({
            id: n.id,
            type:
              n.type === 'BOOKING_CANCEL'
                ? 'error'
                : n.type === 'BOOKING_UPDATE'
                  ? 'warning'
                  : 'info',
            title: n.title,
            message: n.message || undefined,
            createdAt: new Date(n.createdAt).toISOString(),
            read: Boolean(n.isRead),
            source: 'server' as const,
          }))
          setServerNotifications(mapped)
        }
      } catch {
        // ignore fetch errors
      }
    })()
  }, [])

  const persist = (next: NotificationItem[]) => {
    setLocalNotifications(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }

  const notify = useCallback((input: NotificationInput) => {
    const item: NotificationItem = {
      id: createId(),
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: new Date().toISOString(),
      read: false,
      source: 'local',
    }
    setLocalNotifications((prev) => {
      const next = [item, ...prev].slice(0, MAX_ITEMS)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const markAllRead = useCallback(() => {
    const nextLocal = localNotifications.map(n => ({ ...n, read: true }))
    persist(nextLocal)
    setServerNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => undefined)
  }, [localNotifications])

  const markRead = useCallback((id: string) => {
    const localMatch = localNotifications.some((n) => n.id === id && n.source !== 'server')
    if (localMatch) {
      const next = localNotifications.map(n => n.id === id ? { ...n, read: true } : n)
      persist(next)
      return
    }
    setServerNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => undefined)
  }, [localNotifications])

  const clearAll = useCallback(() => {
    persist([])
    setServerNotifications([])
    fetch('/api/notifications', { method: 'DELETE' }).catch(() => undefined)
  }, [])

  const notifications = useMemo(() => {
    const merged = [...serverNotifications, ...localNotifications]
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, MAX_ITEMS)
  }, [serverNotifications, localNotifications])

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  )

  const value = useMemo(
    () => ({ notifications, unreadCount, notify, markAllRead, markRead, clearAll }),
    [notifications, unreadCount, notify, markAllRead, markRead, clearAll]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export { NotificationContext }
