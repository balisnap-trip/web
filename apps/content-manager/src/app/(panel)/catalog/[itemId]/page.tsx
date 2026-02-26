import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CatalogActionFeedback } from "@/components/catalog/action-feedback";
import { CatalogContentEditorFields } from "@/components/catalog/content-editor-fields";
import { CatalogItemDeleteModal } from "@/components/catalog/catalog-item-delete-modal";
import { FormSubmitButton } from "@/components/catalog/form-submit-button";
import { ThumbnailInput } from "@/components/catalog/thumbnail-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { authOptions } from "@/lib/auth";
import { getCatalogItemStatusMeta, getCatalogVariantStatusMeta } from "@/lib/catalog-status";
import { fetchCatalogItemById } from "@/lib/core-api";
import { canEditCatalog, isAllowedRole } from "@/lib/roles";
import {
  createCatalogRateAction,
  createCatalogVariantAction,
  deactivateCatalogItemAction,
  deactivateCatalogRateAction,
  deactivateCatalogVariantAction,
  updateCatalogItemContentAction,
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

const travelerTypeOptions = ["ADULT", "CHILD", "INFANT"] as const;

export default async function CatalogItemDetailPage({ params, searchParams }: CatalogItemDetailPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) || {};
  const canEdit = canEditCatalog(session.user.role);

  let itemError = "";
  let item = null as Awaited<ReturnType<typeof fetchCatalogItemById>> | null;

  try {
    item = await fetchCatalogItemById(resolvedParams.itemId, true);
  } catch (error) {
    itemError = error instanceof Error ? error.message : String(error);
  }

  const itemStatusMeta = item ? getCatalogItemStatusMeta(item.isActive, item.isFeatured) : null;
  const variantCount = item?.variants.length || 0;
  const activeVariantCount = item?.variants.filter((variant) => variant.isActive).length || 0;
  const rateCount =
    item?.variants.reduce((count, variant) => count + variant.rates.length, 0) || 0;
  const slideCount = item?.content?.slides.length || 0;
  const itineraryCount = item?.content?.itinerary.length || 0;

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Catalog Item Detail
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {item?.name || "Catalog Item"}
              </h1>
              <p className="text-sm text-slate-600">
                Manage item metadata, variants, and rates in one workspace.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono">{item?.slug || "-"}</span>
                {itemStatusMeta ? <StatusBadge label={itemStatusMeta.label} tone={itemStatusMeta.tone} /> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/catalog">Back to catalog</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/publish">Publish workflow</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/site-content">Site content</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CatalogActionFeedback result={resolvedSearchParams.result} error={resolvedSearchParams.error} />

      {!canEdit ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="pt-6 text-sm text-amber-700">
            Your current role is read-only. All data-change actions will be rejected by server actions.
          </CardContent>
        </Card>
      ) : null}

      {itemError ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardHeader>
            <CardTitle className="text-lg text-red-800">Item Not Available</CardTitle>
            <CardDescription className="text-red-700">Core API returned an error while loading this item.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-red-700">{itemError}</CardContent>
        </Card>
      ) : null}

      {item ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variants</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{variantCount}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Variants</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{activeVariantCount}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rates</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">{rateCount}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-fuchsia-500">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slides</p>
                <p className="mt-2 text-2xl font-bold text-fuchsia-600">{slideCount}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-cyan-500">
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itinerary Rows</p>
                <p className="mt-2 text-2xl font-bold text-cyan-600">{itineraryCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Item Metadata</CardTitle>
              <CardDescription>Update key item details before review/publish workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={updateCatalogItemAction} className="space-y-4">
                <input type="hidden" name="itemId" value={item.itemId} />

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="Slug" htmlFor="catalog-item-slug">
                    <Input id="catalog-item-slug" name="slug" defaultValue={item.slug} disabled={!canEdit} />
                  </FormField>
                  <FormField label="Name" htmlFor="catalog-item-name">
                    <Input id="catalog-item-name" name="name" defaultValue={item.name} disabled={!canEdit} />
                  </FormField>
                </div>

                <FormField label="Description" htmlFor="catalog-item-description">
                  <Textarea
                    id="catalog-item-description"
                    name="description"
                    defaultValue={item.description}
                    rows={4}
                    disabled={!canEdit}
                  />
                </FormField>

                <ThumbnailInput id="catalog-item-thumbnail" name="thumbnailUrl" defaultValue={item.thumbnailUrl || ""} />

                <div className="flex flex-wrap gap-4">
                  <label htmlFor="catalog-item-active" className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      id="catalog-item-active"
                      name="isActive"
                      value="true"
                      defaultChecked={item.isActive}
                      disabled={!canEdit}
                    />
                    Active
                  </label>
                  <label htmlFor="catalog-item-featured" className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      id="catalog-item-featured"
                      name="isFeatured"
                      value="true"
                      defaultChecked={item.isFeatured}
                      disabled={!canEdit}
                    />
                    Featured
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <FormSubmitButton idleLabel="Save item" pendingLabel="Saving item..." disabled={!canEdit} />
                </div>
              </form>

              <CatalogItemDeleteModal
                itemId={item.itemId}
                itemName={item.name}
                canEdit={canEdit}
                action={deactivateCatalogItemAction}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Variant</CardTitle>
              <CardDescription>Create a new variant with an optional initial rate.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createCatalogVariantAction} className="grid gap-3 md:grid-cols-4">
                <input type="hidden" name="itemId" value={item.itemId} />

                <FormField label="Code" htmlFor="catalog-variant-create-code" required>
                  <Input
                    id="catalog-variant-create-code"
                    name="code"
                    required
                    placeholder="VAR-PRIVATE"
                    disabled={!canEdit}
                  />
                </FormField>

                <FormField label="Name" htmlFor="catalog-variant-create-name" required>
                  <Input
                    id="catalog-variant-create-name"
                    name="name"
                    required
                    placeholder="Private Tour"
                    disabled={!canEdit}
                  />
                </FormField>

                <FormField label="Duration Days" htmlFor="catalog-variant-create-duration">
                  <Input
                    id="catalog-variant-create-duration"
                    name="durationDays"
                    type="number"
                    min={1}
                    defaultValue={1}
                    disabled={!canEdit}
                  />
                </FormField>

                <FormField label="Currency" htmlFor="catalog-variant-create-currency">
                  <Input
                    id="catalog-variant-create-currency"
                    name="currencyCode"
                    defaultValue="USD"
                    disabled={!canEdit}
                  />
                </FormField>

                <FormField label="Initial Traveler" htmlFor="catalog-variant-create-traveler">
                  <Select
                    id="catalog-variant-create-traveler"
                    name="travelerType"
                    defaultValue="ADULT"
                    disabled={!canEdit}
                  >
                    {travelerTypeOptions.map((travelerType) => (
                      <option key={travelerType} value={travelerType}>
                        {travelerType}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Initial Price" htmlFor="catalog-variant-create-price">
                  <Input
                    id="catalog-variant-create-price"
                    name="price"
                    type="number"
                    min={0}
                    placeholder="100"
                    disabled={!canEdit}
                  />
                </FormField>

                <FormField label="Initial Rate Currency" htmlFor="catalog-variant-create-rate-currency">
                  <Input
                    id="catalog-variant-create-rate-currency"
                    name="rateCurrencyCode"
                    defaultValue="USD"
                    disabled={!canEdit}
                  />
                </FormField>

                <div className="flex items-end">
                  <label htmlFor="catalog-variant-create-default" className="inline-flex h-10 items-center gap-2 text-sm">
                    <Checkbox
                      id="catalog-variant-create-default"
                      name="isDefault"
                      value="true"
                      disabled={!canEdit}
                    />
                    Default
                  </label>
                </div>

                <div className="flex items-end">
                  <label htmlFor="catalog-variant-create-active" className="inline-flex h-10 items-center gap-2 text-sm">
                    <Checkbox
                      id="catalog-variant-create-active"
                      name="isActive"
                      value="true"
                      defaultChecked
                      disabled={!canEdit}
                    />
                    Active
                  </label>
                </div>

                <div className="md:col-span-4">
                  <FormSubmitButton idleLabel="Add variant" pendingLabel="Adding variant..." disabled={!canEdit} />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tour Content Manager</CardTitle>
              <CardDescription>
                Manage slides, itinerary, highlights, include/exclude, additional info, optional features, and FAQ.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={updateCatalogItemContentAction} className="space-y-4">
                <input type="hidden" name="itemId" value={item.itemId} />
                <CatalogContentEditorFields initialContent={item.content} variants={item.variants} canEdit={canEdit} />
                <div className="flex flex-wrap items-center gap-2">
                  <FormSubmitButton
                    idleLabel="Save tour content"
                    pendingLabel="Saving content..."
                    disabled={!canEdit}
                  />
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {item.variants.map((variant) => {
              const variantStatusMeta = getCatalogVariantStatusMeta(variant.isActive, variant.isDefault);

              return (
                <Card key={variant.variantId}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Variant: {variant.name} ({variant.code})
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <span>Manage variant and rate configuration.</span>
                      <StatusBadge label={variantStatusMeta.label} tone={variantStatusMeta.tone} />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form action={updateCatalogVariantAction} className="grid gap-3 md:grid-cols-4">
                      <input type="hidden" name="itemId" value={item.itemId} />
                      <input type="hidden" name="variantId" value={variant.variantId} />

                      <FormField label="Code" htmlFor={`variant-${variant.variantId}-code`}>
                        <Input
                          id={`variant-${variant.variantId}-code`}
                          name="code"
                          defaultValue={variant.code}
                          disabled={!canEdit}
                        />
                      </FormField>

                      <FormField label="Name" htmlFor={`variant-${variant.variantId}-name`}>
                        <Input
                          id={`variant-${variant.variantId}-name`}
                          name="name"
                          defaultValue={variant.name}
                          disabled={!canEdit}
                        />
                      </FormField>

                      <FormField label="Duration Days" htmlFor={`variant-${variant.variantId}-duration`}>
                        <Input
                          id={`variant-${variant.variantId}-duration`}
                          name="durationDays"
                          type="number"
                          min={1}
                          defaultValue={variant.durationDays}
                          disabled={!canEdit}
                        />
                      </FormField>

                      <FormField label="Currency" htmlFor={`variant-${variant.variantId}-currency`}>
                        <Input
                          id={`variant-${variant.variantId}-currency`}
                          name="currencyCode"
                          defaultValue={variant.currencyCode}
                          disabled={!canEdit}
                        />
                      </FormField>

                      <div className="flex items-end">
                        <label
                          htmlFor={`variant-${variant.variantId}-default`}
                          className="inline-flex h-10 items-center gap-2 text-sm"
                        >
                          <Checkbox
                            id={`variant-${variant.variantId}-default`}
                            name="isDefault"
                            value="true"
                            defaultChecked={variant.isDefault}
                            disabled={!canEdit}
                          />
                          Default
                        </label>
                      </div>

                      <div className="flex items-end">
                        <label
                          htmlFor={`variant-${variant.variantId}-active`}
                          className="inline-flex h-10 items-center gap-2 text-sm"
                        >
                          <Checkbox
                            id={`variant-${variant.variantId}-active`}
                            name="isActive"
                            value="true"
                            defaultChecked={variant.isActive}
                            disabled={!canEdit}
                          />
                          Active
                        </label>
                      </div>

                      <div className="md:col-span-4 flex flex-wrap items-center gap-2">
                        <FormSubmitButton idleLabel="Save variant" pendingLabel="Saving variant..." disabled={!canEdit} />
                      </div>
                    </form>

                    <form action={deactivateCatalogVariantAction}>
                      <input type="hidden" name="itemId" value={item.itemId} />
                      <input type="hidden" name="variantId" value={variant.variantId} />
                      <FormSubmitButton
                        idleLabel="Deactivate variant"
                        pendingLabel="Deactivating..."
                        variant="destructive"
                        size="sm"
                        disabled={!canEdit}
                      />
                    </form>

                    <Card className="border-dashed">
                      <CardContent className="p-4">
                        <form action={createCatalogRateAction} className="grid gap-3 md:grid-cols-5">
                          <input type="hidden" name="itemId" value={item.itemId} />
                          <input type="hidden" name="variantId" value={variant.variantId} />

                          <FormField label="Traveler Type" htmlFor={`variant-${variant.variantId}-rate-traveler`}>
                            <Select
                              id={`variant-${variant.variantId}-rate-traveler`}
                              name="travelerType"
                              defaultValue="ADULT"
                              disabled={!canEdit}
                            >
                              {travelerTypeOptions.map((travelerType) => (
                                <option key={travelerType} value={travelerType}>
                                  {travelerType}
                                </option>
                              ))}
                            </Select>
                          </FormField>

                          <FormField label="Currency" htmlFor={`variant-${variant.variantId}-rate-currency`}>
                            <Input
                              id={`variant-${variant.variantId}-rate-currency`}
                              name="currencyCode"
                              defaultValue={variant.currencyCode}
                              disabled={!canEdit}
                            />
                          </FormField>

                          <FormField label="Price" htmlFor={`variant-${variant.variantId}-rate-price`}>
                            <Input
                              id={`variant-${variant.variantId}-rate-price`}
                              name="price"
                              type="number"
                              min={0}
                              placeholder="100"
                              disabled={!canEdit}
                            />
                          </FormField>

                          <div className="flex items-end">
                            <label
                              htmlFor={`variant-${variant.variantId}-rate-active`}
                              className="inline-flex h-10 items-center gap-2 text-sm"
                            >
                              <Checkbox
                                id={`variant-${variant.variantId}-rate-active`}
                                name="isActive"
                                value="true"
                                defaultChecked
                                disabled={!canEdit}
                              />
                              Active
                            </label>
                          </div>

                          <div className="flex items-end">
                            <FormSubmitButton idleLabel="Add rate" pendingLabel="Adding rate..." disabled={!canEdit} />
                          </div>
                        </form>
                      </CardContent>
                    </Card>

                    {variant.rates.length === 0 ? (
                      <TableEmpty>No rates on this variant yet.</TableEmpty>
                    ) : (
                      <DataTableShell className="shadow-none">
                        <Table>
                          <TableHeader className="bg-slate-50/80">
                            <TableRow>
                              <TableHead>Traveler</TableHead>
                              <TableHead>Currency</TableHead>
                              <TableHead>Price</TableHead>
                              <TableHead>Active</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {variant.rates.map((rate) => (
                              <TableRow key={rate.rateId} className="hover:bg-slate-50/80">
                                <TableCell>{rate.travelerType}</TableCell>
                                <TableCell>{rate.currencyCode}</TableCell>
                                <TableCell>{rate.price}</TableCell>
                                <TableCell>
                                  <StatusBadge
                                    label={rate.isActive ? "Yes" : "No"}
                                    tone={rate.isActive ? "success" : "destructive"}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    <form action={updateCatalogRateAction} className="flex flex-wrap items-center gap-2">
                                      <input type="hidden" name="itemId" value={item.itemId} />
                                      <input type="hidden" name="rateId" value={rate.rateId} />
                                      <Input
                                        name="travelerType"
                                        defaultValue={rate.travelerType}
                                        className="h-8 w-24 rounded text-xs"
                                        disabled={!canEdit}
                                      />
                                      <Input
                                        name="currencyCode"
                                        defaultValue={rate.currencyCode}
                                        className="h-8 w-20 rounded text-xs"
                                        disabled={!canEdit}
                                      />
                                      <Input
                                        name="price"
                                        type="number"
                                        min={0}
                                        defaultValue={rate.price}
                                        className="h-8 w-24 rounded text-xs"
                                        disabled={!canEdit}
                                      />
                                      <label htmlFor={`rate-${rate.rateId}-active`} className="inline-flex items-center gap-1 text-xs">
                                        <Checkbox
                                          id={`rate-${rate.rateId}-active`}
                                          name="isActive"
                                          value="true"
                                          defaultChecked={rate.isActive}
                                          disabled={!canEdit}
                                        />
                                        Active
                                      </label>
                                      <FormSubmitButton
                                        idleLabel="Save"
                                        pendingLabel="Saving..."
                                        size="sm"
                                        variant="outline"
                                        disabled={!canEdit}
                                      />
                                    </form>
                                    <form action={deactivateCatalogRateAction}>
                                      <input type="hidden" name="itemId" value={item.itemId} />
                                      <input type="hidden" name="rateId" value={rate.rateId} />
                                      <FormSubmitButton
                                        idleLabel="Deactivate"
                                        pendingLabel="Deactivating..."
                                        size="sm"
                                        variant="destructive"
                                        disabled={!canEdit}
                                      />
                                    </form>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </DataTableShell>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
