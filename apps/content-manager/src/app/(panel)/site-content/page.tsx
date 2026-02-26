import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { SiteContentTabs } from "@/components/site-content/site-content-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

const modules = [
  {
    title: "About Us",
    href: "/site-content/about",
    description: "Manage hero, brand story, value proposition, and About page CTA.",
    status: "Ready"
  },
  {
    title: "Blog Post / Story",
    href: "/site-content/blog",
    description: "Design editorial flow: headline, excerpt, cover, tags, SEO, and publish status.",
    status: "Ready"
  },
  {
    title: "Landing Sections",
    href: "/site-content",
    description: "Content slots for homepage sections such as trust badges, partner logos, and promo strips.",
    status: "Planned"
  }
] as const;

export default async function SiteContentPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Site Content Studio
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Website Content Management</h1>
              <p className="max-w-2xl text-sm text-slate-600">
                This module is for non-tour content: About Us, blog stories, and other website information blocks so
                they stay separate from catalog data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/site-content/about">Open About</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/site-content/blog">Open Blog</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <SiteContentTabs />

      <Card className="border-amber-200 bg-amber-50/70">
        <CardContent className="pt-6 text-sm text-amber-800">
          Current mode: UI prototype for content-team flow validation. API/database binding can continue once final
          fields are approved.
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.title} className="hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">{module.title}</CardTitle>
              <CardDescription>{module.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">
                Status module:{" "}
                <span
                  className={
                    module.status === "Ready" ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"
                  }
                >
                  {module.status}
                </span>
              </p>
              <Button asChild size="sm" variant={module.status === "Ready" ? "outline" : "ghost"}>
                <Link href={module.href}>{module.status === "Ready" ? "Open module" : "View roadmap"}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
