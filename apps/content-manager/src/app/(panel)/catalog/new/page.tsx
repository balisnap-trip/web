import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CatalogActionFeedback } from "@/components/catalog/action-feedback";
import { CatalogSlugFields } from "@/components/catalog/catalog-slug-fields";
import { FormSubmitButton } from "@/components/catalog/form-submit-button";
import { ThumbnailInput } from "@/components/catalog/thumbnail-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { authOptions } from "@/lib/auth";
import { canEditCatalog, isAllowedRole } from "@/lib/roles";
import { createCatalogItemAction } from "../actions";

interface CatalogNewPageProps {
  searchParams?: Promise<{
    result?: string;
    error?: string;
  }>;
}

const travelerTypeOptions = ["ADULT", "CHILD", "INFANT"] as const;

export default async function CatalogNewPage({ searchParams }: CatalogNewPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    redirect("/login");
  }
  if (!canEditCatalog(session.user.role)) {
    redirect("/catalog?error=CM_ROLE_FORBIDDEN_CATALOG_EDIT");
  }

  const resolvedSearchParams = (await searchParams) || {};

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Create Catalog Item
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Catalog Item</h1>
              <p className="text-sm text-slate-600">
                Fill item metadata, upload thumbnail, then optionally create a starter variant so the item is review-ready.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/catalog">Back to catalog</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CatalogActionFeedback result={resolvedSearchParams.result} error={resolvedSearchParams.error} />

      <form action={createCatalogItemAction} className="space-y-6">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Main Information</h2>
              <p className="text-sm text-muted-foreground">Primary data used as the catalog item identity.</p>
            </div>

            <CatalogSlugFields />

            <FormField label="Description" htmlFor="catalog-create-description">
              <Textarea id="catalog-create-description" name="description" rows={4} />
            </FormField>

            <ThumbnailInput id="catalog-create-thumbnail" name="thumbnailUrl" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Visibility</h2>
              <p className="text-sm text-muted-foreground">Set item status in the internal catalog.</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <label htmlFor="catalog-create-active" className="inline-flex items-center gap-2 text-sm">
                <Checkbox id="catalog-create-active" name="isActive" value="true" defaultChecked />
                Active
              </label>
              <label htmlFor="catalog-create-featured" className="inline-flex items-center gap-2 text-sm">
                <Checkbox id="catalog-create-featured" name="isFeatured" value="true" />
                Featured
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Starter Variant</h2>
              <p className="text-sm text-muted-foreground">
                Enable this to create an initial package so new items are immediately ready for review/publish.
              </p>
            </div>

            <label htmlFor="catalog-create-starter-enabled" className="inline-flex items-center gap-2 text-sm">
              <Checkbox
                id="catalog-create-starter-enabled"
                name="createStarterVariant"
                value="true"
                defaultChecked
              />
              Create starter variant + rate
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Variant Code" htmlFor="catalog-create-starter-code">
                <Input id="catalog-create-starter-code" name="starterVariantCode" defaultValue="VAR-DEFAULT" />
              </FormField>
              <FormField label="Variant Name" htmlFor="catalog-create-starter-name">
                <Input id="catalog-create-starter-name" name="starterVariantName" defaultValue="Default Package" />
              </FormField>
              <FormField label="Duration Days" htmlFor="catalog-create-starter-duration">
                <Input
                  id="catalog-create-starter-duration"
                  name="starterVariantDurationDays"
                  type="number"
                  min={1}
                  defaultValue={1}
                />
              </FormField>
              <FormField label="Currency" htmlFor="catalog-create-starter-currency">
                <Input id="catalog-create-starter-currency" name="starterVariantCurrencyCode" defaultValue="USD" />
              </FormField>
              <FormField label="Traveler Type" htmlFor="catalog-create-starter-traveler">
                <Select id="catalog-create-starter-traveler" name="starterVariantTravelerType" defaultValue="ADULT">
                  {travelerTypeOptions.map((travelerType) => (
                    <option key={travelerType} value={travelerType}>
                      {travelerType}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Price" htmlFor="catalog-create-starter-price">
                <Input
                  id="catalog-create-starter-price"
                  name="starterVariantPrice"
                  type="number"
                  min={0}
                  defaultValue={100}
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <FormSubmitButton idleLabel="Create item" pendingLabel="Creating item..." />
          <Button asChild variant="ghost" type="button">
            <Link href="/catalog">Cancel</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
