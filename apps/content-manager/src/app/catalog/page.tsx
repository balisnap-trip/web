import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCatalogList } from "@/lib/core-api";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";

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

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  if (!isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};
  const query = {
    q: resolvedSearchParams.q || "",
    page: resolvedSearchParams.page || "1",
    limit: resolvedSearchParams.limit || "20",
    result: resolvedSearchParams.result || "",
    error: resolvedSearchParams.error || ""
  };

  const result = await fetchCatalogList(query);

  return (
    <main className="min-h-screen bg-muted">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Catalog Editor</h1>
            <p className="text-sm text-muted-foreground">
              CRUD item/variant/rate + workflow publish untuk EP-010.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/catalog/new" className="font-medium text-primary hover:underline">
              New item
            </Link>
            <Link href="/publish" className="font-medium text-primary hover:underline">
              Publish workflow
            </Link>
            <Link href="/dashboard" className="text-muted-foreground hover:underline">
              Back to dashboard
            </Link>
          </div>
        </header>

        {query.result ? (
          <Card>
            <CardContent className="pt-6 text-sm text-emerald-700">Result: {query.result}</CardContent>
          </Card>
        ) : null}

        {query.error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-red-700">Error: {query.error}</CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Filter</CardTitle>
            <CardDescription>Gunakan query nama/slug untuk memeriksa item katalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-4">
              <input
                name="q"
                defaultValue={query.q}
                placeholder="Search name/slug"
                className="col-span-2 h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <input
                name="page"
                defaultValue={query.page}
                placeholder="Page"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <input
                name="limit"
                defaultValue={query.limit}
                placeholder="Limit"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Apply
              </button>
            </form>
          </CardContent>
        </Card>

        {!result.ok ? (
          <Card>
            <CardHeader>
              <CardTitle>Core API Unavailable</CardTitle>
              <CardDescription>Gagal memuat data catalog.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-red-700">{result.error}</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Catalog Items</CardTitle>
              <CardDescription>
                Total {result.data.pagination.total} item | page {result.data.pagination.page} | limit{" "}
                {result.data.pagination.limit}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items found for current filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2 py-2 text-left">Name</th>
                        <th className="px-2 py-2 text-left">Slug</th>
                        <th className="px-2 py-2 text-left">Status</th>
                        <th className="px-2 py-2 text-left">Variants</th>
                        <th className="px-2 py-2 text-left">Rate Summary</th>
                        <th className="px-2 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.items.map((item) => (
                        <tr key={item.itemId} className="border-b align-top">
                          <td className="px-2 py-2">{item.name}</td>
                          <td className="px-2 py-2">{item.slug}</td>
                          <td className="px-2 py-2">
                            {item.isActive ? "ACTIVE" : "INACTIVE"}
                            {item.isFeatured ? " / FEATURED" : ""}
                          </td>
                          <td className="px-2 py-2">{item.variants.length}</td>
                          <td className="px-2 py-2">
                            {item.variants
                              .slice(0, 2)
                              .map((variant) => `${variant.name}(${renderRateSummary(variant.rates)})`)
                              .join(" || ") || "-"}
                          </td>
                          <td className="px-2 py-2">
                            <Link href={`/catalog/${item.itemId}`} className="font-medium text-primary hover:underline">
                              Edit
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
