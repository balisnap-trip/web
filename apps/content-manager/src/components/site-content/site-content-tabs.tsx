"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/site-content",
    title: "Overview",
    description: "Website content hub"
  },
  {
    href: "/site-content/about",
    title: "About Us",
    description: "Company profile"
  },
  {
    href: "/site-content/blog",
    title: "Blog",
    description: "Post and story"
  }
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/site-content") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteContentTabs() {
  const pathname = usePathname();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-lg border px-3 py-2 transition-colors",
                active
                  ? "border-orange-500 bg-orange-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
              )}
            >
              <p className="text-sm font-semibold text-slate-900">{tab.title}</p>
              <p className="text-[11px] text-slate-500">{tab.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
