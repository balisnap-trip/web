"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: string;
  read: boolean;
  source?: "local";
}

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  notify: (input: NotificationInput) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const STORAGE_KEY = "cm_notifications";
const MAX_ITEMS = 100;

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as NotificationItem[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setNotifications(
        parsed.map((item) => ({
          ...item,
          source: "local"
        }))
      );
    } catch {
      // Ignore storage read errors.
    }
  }, []);

  const persist = useCallback((next: NotificationItem[]) => {
    setNotifications(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors.
    }
  }, []);

  const notify = useCallback((input: NotificationInput) => {
    const item: NotificationItem = {
      id: createId(),
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: new Date().toISOString(),
      read: false,
      source: "local"
    };

    setNotifications((prev) => {
      const next = [item, ...prev].slice(0, MAX_ITEMS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write errors.
      }
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const next = notifications.map((notification) => ({
      ...notification,
      read: true
    }));
    persist(next);
  }, [notifications, persist]);

  const markRead = useCallback(
    (id: string) => {
      const next = notifications.map((notification) =>
        notification.id === id
          ? {
              ...notification,
              read: true
            }
          : notification
      );
      persist(next);
    },
    [notifications, persist]
  );

  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const sortedNotifications = useMemo(() => {
    return [...notifications]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, MAX_ITEMS);
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return sortedNotifications.filter((notification) => !notification.read).length;
  }, [sortedNotifications]);

  const value = useMemo(
    () => ({
      notifications: sortedNotifications,
      unreadCount,
      notify,
      markAllRead,
      markRead,
      clearAll
    }),
    [clearAll, markAllRead, markRead, notify, sortedNotifications, unreadCount]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export { NotificationContext };
