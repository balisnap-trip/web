import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { fetchCatalogItemById } from "@/lib/core-api";
import { isAllowedRole } from "@/lib/roles";
import {
  createCatalogRateAction,
  createCatalogVariantAction,
  deactivateCatalogItemAction,
  deactivateCatalogRateAction,
  deactivateCatalogVariantAction,
  updateCatalogItemAction,
  updateCatalogRateAction,
  updateCatalogVariantAction
} from "../actions";

interface CatalogItemDetailPageProps {
  params: Promise<{
    itemId: string;
  }>;
  searchParams?: Promise<{
    result?: string;
    error?: string;
  }>;
}

export default async function CatalogItemDetailPage({ params, searchParams }: CatalogItemDetailPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) || {};

  let itemError = "";
  let item = null as Awaited<ReturnType<typeof fetchCatalogItemById>> | null;

  try {
    item = await fetchCatalogItemById(resolvedParams.itemId, true);
  } catch (error) {
    itemError = error instanceof Error ? error.message : String(error);
  }

  return (
    <main className="min-h-screen bg-muted">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Catalog Item Detail</h1>
            <p className="text-sm text-muted-foreground">Kelola item, variant, dan rate pada satu halaman.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/catalog" className="text-primary hover:underline">
              Back to catalog
            </Link>
            <Link href="/publish" className="text-primary hover:underline">
              Publish workflow
            </Link>
          </div>
        </header>

        {resolvedSearchParams.result ? (
          <Card>
            <CardContent className="pt-6 text-sm text-emerald-700">Result: {resolvedSearchParams.result}</CardContent>
          </Card>
        ) : null}

        {resolvedSearchParams.error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-red-700">Error: {resolvedSearchParams.error}</CardContent>
          </Card>
        ) : null}

        {itemError ? (
          <Card>
            <CardHeader>
              <CardTitle>Item Not Available</CardTitle>
              <CardDescription>Core API mengembalikan error saat memuat item.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-red-700">{itemError}</CardContent>
          </Card>
        ) : null}

        {item ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Item</CardTitle>
                <CardDescription>Update metadata item katalog.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form action={updateCatalogItemAction} className="space-y-4">
                  <input type="hidden" name="itemId" value={item.itemId} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Slug</span>
                      <input
                        name="slug"
                        defaultValue={item.slug}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Name</span>
                      <input
                        name="name"
                        defaultValue={item.name}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3"
                      />
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Description</span>
                    <textarea
                      name="description"
                      defaultValue={item.description}
                      rows={4}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Thumbnail URL</span>
                    <input
                      name="thumbnailUrl"
                      defaultValue={item.thumbnailUrl || ""}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3"
                    />
                  </label>

                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isActive" value="true" defaultChecked={item.isActive} />
                      Active
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isFeatured" value="true" defaultChecked={item.isFeatured} />
                      Featured
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    Save item
                  </button>
                </form>

                <form action={deactivateCatalogItemAction}>
                  <input type="hidden" name="itemId" value={item.itemId} />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-medium text-red-700"
                  >
                    Deactivate item
                  </button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add Variant</CardTitle>
                <CardDescription>Create variant baru beserta optional rate awal.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={createCatalogVariantAction} className="grid gap-3 md:grid-cols-4">
                  <input type="hidden" name="itemId" value={item.itemId} />
                  <input
                    name="code"
                    required
                    placeholder="VAR-PRIVATE"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="name"
                    required
                    placeholder="Private Tour"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="durationDays"
                    type="number"
                    min={1}
                    defaultValue={1}
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="currencyCode"
                    defaultValue="USD"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="travelerType"
                    defaultValue="ADULT"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="price"
                    type="number"
                    min={0}
                    placeholder="100"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <input
                    name="rateCurrencyCode"
                    defaultValue="USD"
                    className="h-10 rounded-lg border border-input bg-background px-3"
                  />
                  <label className="inline-flex h-10 items-center gap-2 text-sm">
                    <input type="checkbox" name="isDefault" value="true" />
                    Default
                  </label>
                  <label className="inline-flex h-10 items-center gap-2 text-sm">
                    <input type="checkbox" name="isActive" value="true" defaultChecked />
                    Active
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    Add variant
                  </button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {item.variants.map((variant) => (
                <Card key={variant.variantId}>
                  <CardHeader>
                    <CardTitle>
                      Variant: {variant.name} ({variant.code})
                    </CardTitle>
                    <CardDescription>
                      {variant.isActive ? "ACTIVE" : "INACTIVE"} {variant.isDefault ? " / DEFAULT" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form action={updateCatalogVariantAction} className="grid gap-3 md:grid-cols-4">
                      <input type="hidden" name="itemId" value={item.itemId} />
                      <input type="hidden" name="variantId" value={variant.variantId} />
                      <input name="code" defaultValue={variant.code} className="h-10 rounded-lg border border-input bg-background px-3" />
                      <input name="name" defaultValue={variant.name} className="h-10 rounded-lg border border-input bg-background px-3" />
                      <input name="durationDays" type="number" min={1} defaultValue={variant.durationDays} className="h-10 rounded-lg border border-input bg-background px-3" />
                      <input name="currencyCode" defaultValue={variant.currencyCode} className="h-10 rounded-lg border border-input bg-background px-3" />
                      <label className="inline-flex h-10 items-center gap-2 text-sm">
                        <input type="checkbox" name="isDefault" value="true" defaultChecked={variant.isDefault} />
                        Default
                      </label>
                      <label className="inline-flex h-10 items-center gap-2 text-sm">
                        <input type="checkbox" name="isActive" value="true" defaultChecked={variant.isActive} />
                        Active
                      </label>
                      <button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Save variant</button>
                    </form>

                    <form action={deactivateCatalogVariantAction}>
                      <input type="hidden" name="itemId" value={item.itemId} />
                      <input type="hidden" name="variantId" value={variant.variantId} />
                      <button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-3 text-sm text-red-700">Deactivate variant</button>
                    </form>

                    <form action={createCatalogRateAction} className="grid gap-3 md:grid-cols-5">
                      <input type="hidden" name="itemId" value={item.itemId} />
                      <input type="hidden" name="variantId" value={variant.variantId} />
                      <input name="travelerType" defaultValue="ADULT" className="h-10 rounded-lg border border-input bg-background px-3" />
                      <input name="currencyCode" defaultValue={variant.currencyCode} className="h-10 rounded-lg border border-input bg-background px-3" />
                      <input name="price" type="number" min={0} placeholder="100" className="h-10 rounded-lg border border-input bg-background px-3" />
                      <label className="inline-flex h-10 items-center gap-2 text-sm">
                        <input type="checkbox" name="isActive" value="true" defaultChecked />
                        Active
                      </label>
                      <button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Add rate</button>
                    </form>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="px-2 py-2 text-left">Traveler</th>
                            <th className="px-2 py-2 text-left">Currency</th>
                            <th className="px-2 py-2 text-left">Price</th>
                            <th className="px-2 py-2 text-left">Active</th>
                            <th className="px-2 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variant.rates.map((rate) => (
                            <tr key={rate.rateId} className="border-b">
                              <td className="px-2 py-2">{rate.travelerType}</td>
                              <td className="px-2 py-2">{rate.currencyCode}</td>
                              <td className="px-2 py-2">{rate.price}</td>
                              <td className="px-2 py-2">{rate.isActive ? "YES" : "NO"}</td>
                              <td className="px-2 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <form action={updateCatalogRateAction} className="flex flex-wrap items-center gap-2">
                                    <input type="hidden" name="itemId" value={item.itemId} />
                                    <input type="hidden" name="rateId" value={rate.rateId} />
                                    <input name="travelerType" defaultValue={rate.travelerType} className="h-8 w-24 rounded border border-input bg-background px-2 text-xs" />
                                    <input name="currencyCode" defaultValue={rate.currencyCode} className="h-8 w-20 rounded border border-input bg-background px-2 text-xs" />
                                    <input name="price" type="number" min={0} defaultValue={rate.price} className="h-8 w-24 rounded border border-input bg-background px-2 text-xs" />
                                    <label className="inline-flex items-center gap-1 text-xs">
                                      <input type="checkbox" name="isActive" value="true" defaultChecked={rate.isActive} />
                                      Active
                                    </label>
                                    <button type="submit" className="h-8 rounded border border-input px-2 text-xs">Save</button>
                                  </form>
                                  <form action={deactivateCatalogRateAction}>
                                    <input type="hidden" name="itemId" value={item.itemId} />
                                    <input type="hidden" name="rateId" value={rate.rateId} />
                                    <button type="submit" className="h-8 rounded border border-red-300 bg-red-50 px-2 text-xs text-red-700">Deactivate</button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
