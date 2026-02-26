import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { authOptions } from "@/lib/auth";
import { getPublishStatusMeta } from "@/lib/catalog-status";
import { fetchCatalogList, listCatalogPublishJobs, type CatalogPublishJobDto } from "@/lib/core-api";
import { isAllowedRole, readAllowedRoles } from "@/lib/roles";

const publishStatuses = ["DRAFT", "IN_REVIEW", "PUBLISHED", "FAILED"] as const;

function buildPublishSummary(jobs: CatalogPublishJobDto[]) {
  const summary: Record<(typeof publishStatuses)[number], number> = {
    DRAFT: 0,
    IN_REVIEW: 0,
    PUBLISHED: 0,
    FAILED: 0
  };

  for (const job of jobs) {
    summary[job.status] += 1;
  }

  return summary;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const actor = `${session.user.email || ""}`.trim() || `${session.user.id || ""}`.trim() || "content-manager";
  const allowedRoles = readAllowedRoles();

  const catalogResult = await fetchCatalogList({ page: "1", limit: "100" });
  const catalogItems = catalogResult.ok ? catalogResult.data.items : [];
  const activeItemCount = catalogItems.filter((item) => item.isActive).length;
  const featuredItemCount = catalogItems.filter((item) => item.isFeatured).length;
  const totalVariantCount = catalogItems.reduce((count, item) => count + item.variants.length, 0);

  let publishJobs: CatalogPublishJobDto[] = [];
  let publishLoadError = "";
  try {
    publishJobs = await listCatalogPublishJobs(100, { actor });
  } catch (error) {
    publishLoadError = error instanceof Error ? error.message : String(error);
  }
  const publishSummary = buildPublishSummary(publishJobs);

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Content Operations
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Content Manager Dashboard</h1>
                <p className="text-sm text-slate-600">
                  One workspace to create, review, and publish content with flexible role policy.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">
                  Active role: {session.user.role || "-"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium">
                  Allowed roles: {allowedRoles.join(", ")}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild>
                <Link href="/catalog/new">Create new item</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/publish">Open publish queue</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/site-content">Open site content</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!catalogResult.ok ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Catalog load error: {catalogResult.error}</CardContent>
        </Card>
      ) : null}

      {publishLoadError ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Publish load error: {publishLoadError}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Catalog Items</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {catalogResult.ok ? catalogResult.data.pagination.total : "-"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total records</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Items</p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{catalogResult.ok ? activeItemCount : "-"}</p>
            <p className="mt-1 text-xs text-slate-500">Loaded from first 100 rows</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Featured Items</p>
            <p className="mt-2 text-2xl font-bold text-violet-600">
              {catalogResult.ok ? featuredItemCount : "-"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Loaded from first 100 rows</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{catalogResult.ok ? totalVariantCount : "-"}</p>
            <p className="mt-1 text-xs text-slate-500">Across loaded catalog rows</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Publish Workflow Snapshot</CardTitle>
          <CardDescription>Latest publish queue status summary for the currently signed-in actor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {publishStatuses.map((status) => {
              const meta = getPublishStatusMeta(status);
              return (
                <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge label={meta.label} tone={meta.tone} />
                    <span className="text-xl font-bold text-slate-900">{publishSummary[status]}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Total jobs loaded: <span className="font-medium text-foreground">{publishJobs.length}</span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Catalog Workspace</CardTitle>
            <CardDescription>Manage items, variants, rates, and media for the content lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Open the editor to update active content.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/catalog">Open</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Publish Control</CardTitle>
            <CardDescription>Control draft, review, publish, and failed retry in one screen.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Monitor status and run workflow transitions.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/publish">Open</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Site Content</CardTitle>
            <CardDescription>Manage website content like About Us and Blog Story.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Separate non-tour content from the catalog editor.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/site-content">Open</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Session Context</CardTitle>
            <CardDescription>Verify active user and role access policy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-medium">User:</span> {session.user.email || "-"}
            </p>
            <p>
              <span className="font-medium">Role:</span> {session.user.role || "-"}
            </p>
            <p>
              <span className="font-medium">Role policy:</span> shared creator/reviewer/publisher enabled
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
