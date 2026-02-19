'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { NotificationProvider } from '@/components/notifications/notification-provider'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <SessionProvider>
      <NotificationProvider>
        <div className="flex h-screen overflow-hidden">
          {/* Desktop sidebar */}
          <Sidebar className="hidden lg:flex" />

          {/* Mobile sidebar */}
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent
              side="left"
              className="p-0"
              closeClassName="text-white hover:bg-white/10 hover:text-white ring-offset-gray-900"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar className="w-full" onNavigate={() => setMobileSidebarOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onOpenSidebar={() => setMobileSidebarOpen(true)} />
            <main className="flex-1 overflow-y-auto bg-muted p-4">
              {children}
            </main>
          </div>
        </div>
      </NotificationProvider>
    </SessionProvider>
  )
}
