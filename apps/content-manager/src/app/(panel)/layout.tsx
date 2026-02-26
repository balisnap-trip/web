"use client";

import { SessionProvider } from "next-auth/react";
import { CMShell } from "@/components/layout/cm-shell";
import { NotificationProvider } from "@/components/notifications/notification-provider";

export default function PanelLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <NotificationProvider>
        <CMShell>{children}</CMShell>
      </NotificationProvider>
    </SessionProvider>
  );
}
