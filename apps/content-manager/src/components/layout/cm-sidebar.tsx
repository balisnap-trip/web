"use client";

import Link from "next/link";
import Image from "next/image";
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

function isActivePath(
  pathname: string,
  match?: {
    exact?: string[];
    prefixes?: string[];
  }
): boolean {
  const exact = match?.exact || [];
  if (exact.includes(pathname)) {
    return true;
  }

  return (match?.prefixes || []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function CMSidebar({
  className,
  onNavigate
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col bg-gradient-to-b from-gray-900 to-gray-800 text-white shadow-xl",
        className
      )}
    >
      <div className="flex h-14 items-center border-b border-gray-700/50 px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 shadow-lg">
            <Image
              src="/logo.png"
              alt="Balisnaptrip"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Balisnaptrip</h1>
            <p className="text-xs text-gray-300">Content Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {cmNavItems.map((item) => {
          const active = isActivePath(pathname, item.match);
          const Icon = iconMap[item.icon];

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  active ? "scale-110" : "group-hover:scale-110"
                )}
              />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-700/50 p-3">
        <div className="rounded-lg bg-gray-800/50 px-3 py-2">
          <p className="text-xs font-medium text-gray-400">Admin Surface</p>
          <p className="text-xs text-gray-400">Operational Style</p>
          <p className="text-xs text-gray-500">Content workflow shell</p>
        </div>
      </div>
    </aside>
  );
}
