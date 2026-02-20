"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCatalogItem,
  createCatalogRate,
  createCatalogVariant,
  createCatalogPublishJob,
  deactivateCatalogItem,
  deactivateCatalogRate,
  deactivateCatalogVariant,
  publishCatalogJob,
  retryCatalogPublishJob,
  submitCatalogPublishReview,
  updateCatalogItem,
  updateCatalogRate,
  updateCatalogVariant
} from "@/lib/core-api";

function readString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value ? value : undefined;
}

function readBoolean(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  if (typeof raw !== "string") {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function readOptionalNumber(formData: FormData, key: string): number | undefined {
  const raw = readString(formData, key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`INVALID_NUMBER:${key}`);
  }
  return parsed;
}

function redirectWithResult(path: string, result: string, error?: string): never {
  const url = new URL(path, "http://localhost");
  if (result) {
    url.searchParams.set("result", result);
  }
  if (error) {
    url.searchParams.set("error", error);
  }
  redirect(`${url.pathname}${url.search}`);
}

export async function createCatalogItemAction(formData: FormData) {
  try {
    const item = await createCatalogItem({
      slug: readString(formData, "slug"),
      name: readString(formData, "name"),
      description: readOptionalString(formData, "description"),
      isActive: readBoolean(formData, "isActive"),
      isFeatured: readBoolean(formData, "isFeatured"),
      thumbnailUrl: readOptionalString(formData, "thumbnailUrl")
    });

    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${item.itemId}`, "ITEM_CREATED");
  } catch (error) {
    redirectWithResult("/catalog/new", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function updateCatalogItemAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    await updateCatalogItem(itemId, {
      slug: readOptionalString(formData, "slug"),
      name: readOptionalString(formData, "name"),
      description: readOptionalString(formData, "description") || null,
      isActive: readBoolean(formData, "isActive"),
      isFeatured: readBoolean(formData, "isFeatured"),
      thumbnailUrl: readOptionalString(formData, "thumbnailUrl") || null
    });

    revalidatePath(`/catalog/${itemId}`);
    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${itemId}`, "ITEM_UPDATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function deactivateCatalogItemAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    await deactivateCatalogItem(itemId);
    revalidatePath("/catalog");
    redirectWithResult("/catalog", "ITEM_DEACTIVATED");
  } catch (error) {
    redirectWithResult("/catalog", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function createCatalogVariantAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    const travelerType = readOptionalString(formData, "travelerType") as "ADULT" | "CHILD" | "INFANT" | undefined;
    const price = readOptionalNumber(formData, "price");
    await createCatalogVariant(itemId, {
      code: readString(formData, "code"),
      name: readString(formData, "name"),
      durationDays: readOptionalNumber(formData, "durationDays"),
      currencyCode: readOptionalString(formData, "currencyCode"),
      isDefault: readBoolean(formData, "isDefault"),
      isActive: readBoolean(formData, "isActive"),
      rates:
        travelerType && price !== undefined
          ? [
              {
                travelerType,
                price,
                currencyCode: readOptionalString(formData, "rateCurrencyCode"),
                isActive: true
              }
            ]
          : undefined
    });

    revalidatePath(`/catalog/${itemId}`);
    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_CREATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function updateCatalogVariantAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  const variantId = readString(formData, "variantId");
  if (!itemId || !variantId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_OR_VARIANT_ID_REQUIRED");
  }

  try {
    await updateCatalogVariant(variantId, {
      code: readOptionalString(formData, "code"),
      name: readOptionalString(formData, "name"),
      durationDays: readOptionalNumber(formData, "durationDays"),
      currencyCode: readOptionalString(formData, "currencyCode"),
      isDefault: readBoolean(formData, "isDefault"),
      isActive: readBoolean(formData, "isActive")
    });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_UPDATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function deactivateCatalogVariantAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  const variantId = readString(formData, "variantId");
  if (!itemId || !variantId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_OR_VARIANT_ID_REQUIRED");
  }

  try {
    await deactivateCatalogVariant(variantId);
    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_DEACTIVATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function createCatalogRateAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  const variantId = readString(formData, "variantId");
  if (!itemId || !variantId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_OR_VARIANT_ID_REQUIRED");
  }

  try {
    const price = readOptionalNumber(formData, "price");
    if (price === undefined) {
      throw new Error("RATE_PRICE_REQUIRED");
    }

    await createCatalogRate(variantId, {
      travelerType: (readString(formData, "travelerType") || "ADULT") as "ADULT" | "CHILD" | "INFANT",
      currencyCode: readOptionalString(formData, "currencyCode"),
      price,
      isActive: readBoolean(formData, "isActive")
    });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_CREATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function updateCatalogRateAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  const rateId = readString(formData, "rateId");
  if (!itemId || !rateId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_OR_RATE_ID_REQUIRED");
  }

  try {
    await updateCatalogRate(rateId, {
      travelerType: readOptionalString(formData, "travelerType") as "ADULT" | "CHILD" | "INFANT" | undefined,
      currencyCode: readOptionalString(formData, "currencyCode"),
      price: readOptionalNumber(formData, "price"),
      isActive: readBoolean(formData, "isActive")
    });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_UPDATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function deactivateCatalogRateAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  const rateId = readString(formData, "rateId");
  if (!itemId || !rateId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_OR_RATE_ID_REQUIRED");
  }

  try {
    await deactivateCatalogRate(rateId);
    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_DEACTIVATED");
  } catch (error) {
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function createCatalogPublishJobAction(formData: FormData) {
  try {
    const itemIdsRaw = readOptionalString(formData, "itemIds");
    const itemIds = itemIdsRaw
      ? itemIdsRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    await createCatalogPublishJob({
      itemIds,
      note: readOptionalString(formData, "note")
    });

    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_CREATED");
  } catch (error) {
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function submitCatalogPublishReviewAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    await submitCatalogPublishReview(jobId);
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_IN_REVIEW");
  } catch (error) {
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function publishCatalogJobAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    await publishCatalogJob(jobId);
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_PUBLISHED");
  } catch (error) {
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function retryCatalogPublishJobAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    await retryCatalogPublishJob(jobId);
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_RETRIED");
  } catch (error) {
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}
