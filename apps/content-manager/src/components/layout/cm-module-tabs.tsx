"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CatalogIcon, DashboardIcon, PublishIcon, SiteContentIcon } from "@/components/layout/cm-icons";
import { cmNavItems } from "@/config/navigation";
import { cn } from "@/lib/utils";

const iconMap = {
  dashboard: DashboardIcon,
  catalog: CatalogIcon,
  publish: PublishIcon,
  siteContent: SiteContentIcon
} as const;

const toneMap = {
  dashboard: {
    iconBg: "bg-slate-900/10",
    iconFg: "text-slate-700",
    activeTab: "bg-slate-900 text-white"
  },
  catalog: {
    iconBg: "bg-blue-600/10",
    iconFg: "text-blue-700",
    activeTab: "bg-blue-600 text-white"
  },
  publish: {
    iconBg: "bg-emerald-600/10",
    iconFg: "text-emerald-700",
    activeTab: "bg-emerald-600 text-white"
  },
  siteContent: {
    iconBg: "bg-orange-500/10",
    iconFg: "text-orange-700",
    activeTab: "bg-orange-500 text-white"
  }
} as const;

function isActive(
  pathname: string,
  match?: {
    exact?: string[];
    prefixes?: string[];
  }
) {
  const exact = match?.exact || [];
  if (exact.includes(pathname)) {
    return true;
  }

  return (match?.prefixes || []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function CMModuleTabs() {
  const pathname = usePathname();
  const activeModule = cmNavItems.find((item) => isActive(pathname, item.match)) || cmNavItems[0];
  const Icon = iconMap[activeModule.icon];
  const tone = toneMap[activeModule.icon];

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="order-1 flex w-full items-center justify-start gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-inner ring-1 ring-slate-200 sm:w-auto">
          {cmNavItems.map((tab) => {
            const active = isActive(pathname, tab.match);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                  active ? cn("shadow-sm", tone.activeTab) : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
                aria-current={active ? "page" : undefined}
              >
                {tab.title}
              </Link>
            );
          })}
        </div>

        <div className="order-2 flex items-center gap-2 sm:ml-auto">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone.iconBg)}>
            <Icon className={cn("h-5 w-5", tone.iconFg)} />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">{activeModule.title}</div>
            <div className="text-xs text-slate-500">{activeModule.description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
