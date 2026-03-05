"use client";

import { Suspense, useState } from "react";
import { CMHeader } from "@/components/layout/cm-header";
import { CMModuleTabs } from "@/components/layout/cm-module-tabs";
import { CMSidebar } from "@/components/layout/cm-sidebar";
import { QueryNotificationSync } from "@/components/notifications/query-notification-sync";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function CMShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <CMSidebar className="hidden lg:flex" />

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 lg:hidden"
          closeClassName="text-white hover:bg-white/10 hover:text-white ring-offset-gray-900"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <CMSidebar className="w-full" onNavigate={() => setMobileSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

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
