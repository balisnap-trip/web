import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DataTableShell,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { authOptions } from "@/lib/auth";
import { getCatalogItemStatusMeta } from "@/lib/catalog-status";
import { fetchCatalogList, type CatalogVariantDto } from "@/lib/core-api";
import { canEditCatalog, isAllowedRole } from "@/lib/roles";

interface CatalogPageProps {
  searchParams?: Promise<{
    q?: string;
    page?: string;
    limit?: string;
    result?: string;
    error?: string;
  }>;
}

function renderRateSummary(rates: Array<{ travelerType: string; price: number }>) {
  if (!rates || rates.length === 0) {
    return "-";
  }
  return rates.map((rate) => `${rate.travelerType}:${rate.price}`).join(" | ");
}

function renderVariantPreview(variants: CatalogVariantDto[]) {
  if (variants.length === 0) {
    return "-";
  }

  const preview = variants
    .slice(0, 2)
    .map((variant) => `${variant.name} (${renderRateSummary(variant.rates)})`)
    .join(" || ");
  const remaining = variants.length - 2;

  if (remaining > 0) {
    return `${preview} || +${remaining} more`;
  }

  return preview;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};
  const canEdit = canEditCatalog(session.user.role);
  const query = {
    q: resolvedSearchParams.q || "",
    page: resolvedSearchParams.page || "1",
    limit: resolvedSearchParams.limit || "20",
    result: resolvedSearchParams.result || "",
    error: resolvedSearchParams.error || ""
  };

  const result = await fetchCatalogList(query);
  const loadedItems = result.ok ? result.data.items : [];
  const pageActiveCount = loadedItems.filter((item) => item.isActive).length;
  const pageFeaturedCount = loadedItems.filter((item) => item.isFeatured).length;
  const pageVariantCount = loadedItems.reduce((count, item) => count + item.variants.length, 0);
  const pageRateCount = loadedItems.reduce(
    (count, item) => count + item.variants.reduce((variantCount, variant) => variantCount + variant.rates.length, 0),
    0
  );

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Catalog Workspace
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catalog Editor</h1>
              <p className="text-sm text-slate-600">
                Manage items, variants, rates, and media in one flow before entering the publish queue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button asChild size="sm" disabled={!canEdit}>
                <Link href="/catalog/new">New item</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/publish">Publish workflow</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/site-content">Site content</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {query.result ? (
        <Card className="border-emerald-200 bg-emerald-50/80">
          <CardContent className="pt-6 text-sm text-emerald-700">Result: {query.result}</CardContent>
        </Card>
      ) : null}

      {query.error ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Error: {query.error}</CardContent>
        </Card>
      ) : null}

      {!canEdit ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="pt-6 text-sm text-amber-700">
            Your current role is read-only for catalog. Create/update actions will be rejected by server actions.
          </CardContent>
        </Card>
      ) : null}

      {result.ok ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Items</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{result.data.pagination.total}</p>
              <p className="mt-1 text-xs text-slate-500">Across all pages</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active on Page</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{pageActiveCount}</p>
              <p className="mt-1 text-xs text-slate-500">From current filter result</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Featured on Page</p>
              <p className="mt-2 text-2xl font-bold text-violet-600">{pageFeaturedCount}</p>
              <p className="mt-1 text-xs text-slate-500">From current filter result</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants / Rates</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">
                {pageVariantCount} / {pageRateCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">On this page only</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-6">
          <form className="grid gap-3 md:grid-cols-4">
            <FormField className="md:col-span-2" label="Search" htmlFor="catalog-filter-q">
              <Input id="catalog-filter-q" name="q" defaultValue={query.q} placeholder="Search name/slug" />
            </FormField>
            <FormField label="Page" htmlFor="catalog-filter-page">
              <Input id="catalog-filter-page" name="page" defaultValue={query.page} placeholder="1" />
            </FormField>
            <FormField label="Limit" htmlFor="catalog-filter-limit">
              <Input id="catalog-filter-limit" name="limit" defaultValue={query.limit} placeholder="20" />
            </FormField>
            <div className="md:col-span-4 flex flex-wrap items-center gap-2">
              <Button type="submit">Apply filter</Button>
              <Button asChild type="button" variant="ghost">
                <Link href="/catalog">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!result.ok ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-6 text-sm text-red-700">Core API unavailable: {result.error}</CardContent>
        </Card>
      ) : (
        <DataTableShell>
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Catalog Items ({result.data.pagination.total})
              </h2>
              <p className="text-xs text-slate-500">
                Page {result.data.pagination.page} of{" "}
                {Math.max(1, Math.ceil(result.data.pagination.total / result.data.pagination.limit))}
              </p>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead>Rate Summary</TableHead>
                <TableHead className="w-[160px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6">
                    <TableEmpty>No items found for current filter.</TableEmpty>
                  </TableCell>
                </TableRow>
              ) : (
                result.data.items.map((item) => {
                  const statusMeta = getCatalogItemStatusMeta(item.isActive, item.isFeatured);
                  return (
                    <TableRow key={item.itemId} className="hover:bg-slate-50/80">
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="line-clamp-2 text-xs text-slate-500">{item.description || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{item.slug}</TableCell>
                      <TableCell>
                        <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-700">{item.variants.length}</TableCell>
                      <TableCell className="max-w-[440px] text-xs text-slate-600">
                        {renderVariantPreview(item.variants)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/catalog/${item.itemId}`}>Edit</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </DataTableShell>
      )}
    </section>
  );
}
