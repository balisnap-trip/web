"use server";

import { getServerSession } from "next-auth";
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
  updateCatalogItemContent,
  updateCatalogRate,
  updateCatalogVariant
} from "@/lib/core-api";
import { authOptions } from "@/lib/auth";
import {
  canEditCatalog,
  canPublishCatalog,
  canRetryPublish,
  canSubmitPublishReview,
  isAllowedRole
} from "@/lib/roles";

type ActionRolePredicate = (role: string | null | undefined) => boolean;
type TravelerType = "ADULT" | "CHILD" | "INFANT";

const TRAVELER_TYPES = new Set<TravelerType>(["ADULT", "CHILD", "INFANT"]);

function isRedirectSignal(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function slugify(rawValue: string): string {
  return rawValue
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function requireActorForAction(predicate: ActionRolePredicate, errorCode: string): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAllowedRole(session.user.role)) {
    throw new Error("CM_AUTH_REQUIRED");
  }

  if (!predicate(session.user.role)) {
    throw new Error(errorCode);
  }

  const actor = `${session.user.email || ""}`.trim() || `${session.user.id || ""}`.trim() || "content-manager";
  return actor;
}

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

function readTravelerType(formData: FormData, key: string, fallback: TravelerType): TravelerType {
  const rawValue = readOptionalString(formData, key) || fallback;
  const normalized = rawValue.trim().toUpperCase();
  if (!TRAVELER_TYPES.has(normalized as TravelerType)) {
    throw new Error(`INVALID_TRAVELER_TYPE:${key}`);
  }
  return normalized as TravelerType;
}

function readJsonValue(formData: FormData, key: string): unknown {
  const raw = readString(formData, key);
  if (!raw) {
    throw new Error(`JSON_REQUIRED:${key}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON_INVALID:${key}`);
  }
}

function readRequiredNumber(formData: FormData, key: string, errorCode: string): number {
  const parsed = readOptionalNumber(formData, key);
  if (parsed === undefined) {
    throw new Error(errorCode);
  }
  return parsed;
}

function buildStarterVariantInput(formData: FormData) {
  if (!readBoolean(formData, "createStarterVariant")) {
    return undefined;
  }

  const code = readOptionalString(formData, "starterVariantCode");
  const name = readOptionalString(formData, "starterVariantName");
  if (!code) {
    throw new Error("STARTER_VARIANT_CODE_REQUIRED");
  }
  if (!name) {
    throw new Error("STARTER_VARIANT_NAME_REQUIRED");
  }

  const price = readRequiredNumber(formData, "starterVariantPrice", "STARTER_VARIANT_PRICE_REQUIRED");
  const durationDays = readOptionalNumber(formData, "starterVariantDurationDays") ?? 1;
  const currencyCode = readOptionalString(formData, "starterVariantCurrencyCode") || "USD";
  const travelerType = readTravelerType(formData, "starterVariantTravelerType", "ADULT");

  return {
    code,
    name,
    durationDays,
    currencyCode,
    isDefault: true,
    isActive: true,
    rates: [
      {
        travelerType,
        price,
        currencyCode,
        isActive: true
      }
    ]
  };
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    const starterVariant = buildStarterVariantInput(formData);
    const name = readString(formData, "name");
    if (!name) {
      throw new Error("ITEM_NAME_REQUIRED");
    }

    const rawSlug = readString(formData, "slug");
    const slug = slugify(rawSlug || name);
    if (!slug) {
      throw new Error("ITEM_SLUG_REQUIRED");
    }

    const item = await createCatalogItem({
      slug,
      name,
      description: readOptionalString(formData, "description"),
      isActive: readBoolean(formData, "isActive"),
      isFeatured: readBoolean(formData, "isFeatured"),
      thumbnailUrl: readOptionalString(formData, "thumbnailUrl"),
      variants: starterVariant ? [starterVariant] : undefined
    }, { actor });

    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${item.itemId}`, "ITEM_CREATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/catalog/new", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function updateCatalogItemAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await updateCatalogItem(itemId, {
      slug: readOptionalString(formData, "slug"),
      name: readOptionalString(formData, "name"),
      description: readOptionalString(formData, "description") || null,
      isActive: readBoolean(formData, "isActive"),
      isFeatured: readBoolean(formData, "isFeatured"),
      thumbnailUrl: readOptionalString(formData, "thumbnailUrl") || null
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${itemId}`, "ITEM_UPDATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function updateCatalogItemContentAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await updateCatalogItemContent(itemId, {
      content: readJsonValue(formData, "content")
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${itemId}`, "CONTENT_UPDATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await deactivateCatalogItem(itemId, { actor });
    revalidatePath("/catalog");
    redirectWithResult("/catalog", "ITEM_DEACTIVATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/catalog", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function createCatalogVariantAction(formData: FormData) {
  const itemId = readString(formData, "itemId");
  if (!itemId) {
    redirectWithResult("/catalog", "FAILED", "ITEM_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
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
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    revalidatePath("/catalog");
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_CREATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await updateCatalogVariant(variantId, {
      code: readOptionalString(formData, "code"),
      name: readOptionalString(formData, "name"),
      durationDays: readOptionalNumber(formData, "durationDays"),
      currencyCode: readOptionalString(formData, "currencyCode"),
      isDefault: readBoolean(formData, "isDefault"),
      isActive: readBoolean(formData, "isActive")
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_UPDATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await deactivateCatalogVariant(variantId, { actor });
    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "VARIANT_DEACTIVATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    const price = readOptionalNumber(formData, "price");
    if (price === undefined) {
      throw new Error("RATE_PRICE_REQUIRED");
    }

    await createCatalogRate(variantId, {
      travelerType: (readString(formData, "travelerType") || "ADULT") as "ADULT" | "CHILD" | "INFANT",
      currencyCode: readOptionalString(formData, "currencyCode"),
      price,
      isActive: readBoolean(formData, "isActive")
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_CREATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await updateCatalogRate(rateId, {
      travelerType: readOptionalString(formData, "travelerType") as "ADULT" | "CHILD" | "INFANT" | undefined,
      currencyCode: readOptionalString(formData, "currencyCode"),
      price: readOptionalNumber(formData, "price"),
      isActive: readBoolean(formData, "isActive")
    }, { actor });

    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_UPDATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
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
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_CATALOG_EDIT");
    await deactivateCatalogRate(rateId, { actor });
    revalidatePath(`/catalog/${itemId}`);
    redirectWithResult(`/catalog/${itemId}`, "RATE_DEACTIVATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult(
      `/catalog/${itemId}`,
      "FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function createCatalogPublishJobAction(formData: FormData) {
  try {
    const actor = await requireActorForAction(canEditCatalog, "CM_ROLE_FORBIDDEN_PUBLISH_DRAFT");
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
    }, { actor });

    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_CREATED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function submitCatalogPublishReviewAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canSubmitPublishReview, "CM_ROLE_FORBIDDEN_PUBLISH_REVIEW");
    await submitCatalogPublishReview(jobId, { actor });
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_IN_REVIEW");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function publishCatalogJobAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canPublishCatalog, "CM_ROLE_FORBIDDEN_PUBLISH_EXECUTE");
    await publishCatalogJob(jobId, { actor });
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_PUBLISHED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}

export async function retryCatalogPublishJobAction(formData: FormData) {
  const jobId = readString(formData, "jobId");
  if (!jobId) {
    redirectWithResult("/publish", "FAILED", "JOB_ID_REQUIRED");
  }

  try {
    const actor = await requireActorForAction(canRetryPublish, "CM_ROLE_FORBIDDEN_PUBLISH_RETRY");
    await retryCatalogPublishJob(jobId, { actor });
    revalidatePath("/publish");
    redirectWithResult("/publish", "PUBLISH_JOB_RETRIED");
  } catch (error) {
    if (isRedirectSignal(error)) {
      throw error;
    }
    redirectWithResult("/publish", "FAILED", error instanceof Error ? error.message : String(error));
  }
}
