import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { isAllowedRole } from "@/lib/roles";
import { createCatalogItemAction } from "../actions";

interface CatalogNewPageProps {
  searchParams?: Promise<{
    result?: string;
    error?: string;
  }>;
}

export default async function CatalogNewPage({ searchParams }: CatalogNewPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedSearchParams = (await searchParams) || {};

  return (
    <main className="min-h-screen bg-muted">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Catalog Item</h1>
            <p className="text-sm text-muted-foreground">Buat item baru untuk tahap draft/edit.</p>
          </div>
          <Link href="/catalog" className="text-sm text-primary hover:underline">
            Back to catalog
          </Link>
        </header>

        {resolvedSearchParams.result ? (
          <Card>
            <CardContent className="pt-6 text-sm text-emerald-700">
              Result: {resolvedSearchParams.result}
            </CardContent>
          </Card>
        ) : null}

        {resolvedSearchParams.error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-red-700">
              Error: {resolvedSearchParams.error}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Item Form</CardTitle>
            <CardDescription>Field wajib: `slug`, `name`.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCatalogItemAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Slug</span>
                  <input
                    name="slug"
                    required
                    placeholder="hidden-gems-bali"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Name</span>
                  <input
                    name="name"
                    required
                    placeholder="Hidden Gems Bali"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3"
                  />
                </label>
              </div>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  name="description"
                  rows={4}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                />
              </label>

              <label className="space-y-1 text-sm">
                <span className="font-medium">Thumbnail URL</span>
                <input
                  name="thumbnailUrl"
                  placeholder="https://..."
                  className="h-10 w-full rounded-lg border border-input bg-background px-3"
                />
              </label>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" value="true" defaultChecked />
                  Active
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isFeatured" value="true" />
                  Featured
                </label>
              </div>

              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Create item
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
