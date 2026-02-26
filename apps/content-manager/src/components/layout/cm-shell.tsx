"use client";

import { Suspense, useEffect, useState } from "react";
import { CMHeader } from "@/components/layout/cm-header";
import { CMModuleTabs } from "@/components/layout/cm-module-tabs";
import { CMSidebar } from "@/components/layout/cm-sidebar";
import { QueryNotificationSync } from "@/components/notifications/query-notification-sync";

export function CMShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [mobileSidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <CMSidebar className="hidden lg:flex" />

      {mobileSidebarOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden">
            <CMSidebar className="w-full" onNavigate={() => setMobileSidebarOpen(false)} />
          </div>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CMHeader onOpenSidebar={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto bg-muted p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={null}>
              <QueryNotificationSync />
            </Suspense>
            <CMModuleTabs />
            {children}
          </div>
        </main>

        <footer className="border-t border-border bg-background/90 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
            <span>Content Manager UI aligned with Admin Operational shell</span>
            <span>{new Date().getFullYear()} Balisnaptrip</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
