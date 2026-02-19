'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { navItems, type NavTab } from '@/config/navigation'
import { cn } from '@/lib/utils'
import {
  Calendar,
  LayoutDashboard,
  Package,
  Settings,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Calendar,
  Wallet,
  Users,
  Package,
  Tags,
  Settings,
}

const toneMap: Record<
  string,
  {
    iconBg: string
    iconFg: string
    activeTab: string
  }
> = {
  bookings: {
    iconBg: 'bg-blue-600/10',
    iconFg: 'text-blue-700',
    activeTab: 'bg-blue-600 text-white',
  },
  finances: {
    iconBg: 'bg-emerald-600/10',
    iconFg: 'text-emerald-700',
    activeTab: 'bg-emerald-600 text-white',
  },
  networks: {
    iconBg: 'bg-violet-600/10',
    iconFg: 'text-violet-700',
    activeTab: 'bg-violet-600 text-white',
  },
  tours_packages: {
    iconBg: 'bg-amber-500/15',
    iconFg: 'text-amber-800',
    activeTab: 'bg-amber-600 text-white',
  },
  master_rules: {
    iconBg: 'bg-indigo-600/10',
    iconFg: 'text-indigo-700',
    activeTab: 'bg-indigo-600 text-white',
  },
  settings: {
    iconBg: 'bg-slate-900/10',
    iconFg: 'text-slate-700',
    activeTab: 'bg-slate-900 text-white',
  },
  dashboard: {
    iconBg: 'bg-slate-900/10',
    iconFg: 'text-slate-700',
    activeTab: 'bg-slate-900 text-white',
  },
}

function getPathnameFromHref(href: string): string {
  const idx = href.indexOf('?')
  return idx === -1 ? href : href.slice(0, idx)
}

function isQueryMatch(
  tab: NavTab,
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
  allTabs: NavTab[]
): boolean {
  const match = tab.match
  if (!match?.query || !match.pathname) return true
  if (pathname !== match.pathname) return false

  for (const [key, expected] of Object.entries(match.query)) {
    const current = searchParams.get(key)
    if (current === null) {
      // If missing, treat the first tab in this pathname+key group as the default active tab.
      const defaults = allTabs.filter((candidate) => candidate.match?.pathname === match.pathname && candidate.match?.query && key in candidate.match.query)
      const defaultTab = defaults[0]
      const defaultExpected = defaultTab?.match?.query?.[key]
      if (defaultExpected !== expected) return false
      continue
    }
    if (current !== expected) return false
  }

  return true
}

function isTabActive(
  tab: NavTab,
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
  allTabs: NavTab[]
): boolean {
  const basePath = tab.match?.pathname || getPathnameFromHref(tab.href)
  const pathOk = pathname === basePath || pathname.startsWith(basePath + '/')
  if (!pathOk) return false
  return isQueryMatch(tab, pathname, searchParams, allTabs)
}

export function ModuleTabs({
  moduleId,
  className,
}: {
  moduleId: string
  className?: string
}) {
  return (
    <Suspense fallback={<div className={cn('mb-4 h-14', className)} />}>
      <ModuleTabsInner moduleId={moduleId} className={className} />
    </Suspense>
  )
}

function ModuleTabsInner({
  moduleId,
  className,
}: {
  moduleId: string
  className?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const module = navItems.find((item) => item.id === moduleId)
  const tabs = module?.tabs ?? []

  if (!module || tabs.length === 0) return null

  const tone = toneMap[module.id] || toneMap.dashboard
  const Icon = iconMap[module.icon]

  return (
    <div className={cn('mb-4', className)}>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Full-width on mobile; right-aligned on desktop so tabs don't look "stuck" on the left. */}
          <div className="order-1 flex w-full items-center justify-start gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-inner ring-1 ring-slate-200 sm:w-auto">
            {tabs.map((tab) => {
              const active = isTabActive(tab, pathname, searchParams, tabs)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                    active
                      ? cn('shadow-sm', tone.activeTab)
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.title}
                </Link>
              )
            })}
          </div>

          <div className="order-2 flex items-center gap-2 sm:ml-auto">
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tone.iconBg)}>
              {Icon ? <Icon className={cn('h-5 w-5', tone.iconFg)} /> : null}
            </div>
            <div className="text-base font-semibold text-slate-900">{module.title}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
