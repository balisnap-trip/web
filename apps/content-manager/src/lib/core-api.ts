import { createHash, createHmac, randomUUID } from "crypto";

export interface CatalogRateDto {
  rateId: string;
  travelerType: "ADULT" | "CHILD" | "INFANT";
  currencyCode: string;
  price: number;
  isActive: boolean;
}

export interface CatalogVariantDto {
  variantId: string;
  itemId: string;
  code: string;
  name: string;
  durationDays: number;
  currencyCode: string;
  isDefault: boolean;
  isActive: boolean;
  rates: CatalogRateDto[];
}

export interface CatalogItemSlideDto {
  url: string;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
}

export interface CatalogItemItineraryEntryDto {
  variantId: string | null;
  day: number;
  sortOrder: number;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface CatalogItemFaqEntryDto {
  question: string;
  answer: string;
}

export interface CatalogItemContentDto {
  slides: CatalogItemSlideDto[];
  itinerary: CatalogItemItineraryEntryDto[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  additionalInfo: string[];
  optionalFeatures: string[];
  faqs: CatalogItemFaqEntryDto[];
}

export interface CatalogItemDto {
  itemId: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  isFeatured: boolean;
  thumbnailUrl: string | null;
  content?: CatalogItemContentDto;
  variants: CatalogVariantDto[];
}

export interface CatalogListDto {
  items: CatalogItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CatalogPublishJobDto {
  jobId: string;
  payloadVersion: "v1";
  status: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "FAILED";
  itemIds: string[];
  itemCount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  reviewedBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  snapshotPath: string | null;
  checksum: string | null;
  failureReason: string | null;
}

export interface CatalogItemCreateInput {
  slug: string;
  name: string;
  description?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
  variants?: CatalogVariantCreateInput[];
}

export interface CatalogItemPatchInput {
  slug?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
}

export interface CatalogVariantCreateInput {
  code: string;
  name: string;
  durationDays?: number;
  currencyCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
  rates?: CatalogRateCreateInput[];
}

export interface CatalogVariantPatchInput {
  code?: string;
  name?: string;
  durationDays?: number;
  currencyCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CatalogRateCreateInput {
  travelerType: "ADULT" | "CHILD" | "INFANT";
  currencyCode?: string;
  price: number;
  isActive?: boolean;
}

export interface CatalogRatePatchInput {
  travelerType?: "ADULT" | "CHILD" | "INFANT";
  currencyCode?: string;
  price?: number;
  isActive?: boolean;
}

export interface CatalogItemContentPatchInput {
  content: unknown;
}

function readCoreApiBaseUrl() {
  return process.env.CORE_API_BASE_URL?.trim() || "http://127.0.0.1:4000";
}

function readAdminToken() {
  return process.env.CORE_API_ADMIN_TOKEN?.trim() || "";
}

function readAdminRole() {
  return process.env.CORE_API_ADMIN_ROLE?.trim() || "MANAGER";
}

function readPublishSecret() {
  return process.env.CORE_API_PUBLISH_SECRET?.trim() || "";
}

function normalizeActor(actor: string | undefined): string {
  const normalized = actor?.trim();
  return normalized || "content-manager";
}

function resolveUrl(path: string, query?: Record<string, string | undefined>) {
  const url = new URL(path, readCoreApiBaseUrl().replace(/\/+$/, "") + "/");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value && value.trim()) {
        url.searchParams.set(key, value.trim());
      }
    }
  }
  return url.toString();
}

function resolvePath(url: string) {
  const parsed = new URL(url);
  return parsed.pathname;
}

function signHeaders(method: string, path: string, body: string): Record<string, string> {
  const secret = readPublishSecret();
  if (!secret) {
    return {};
  }

  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const idempotencyKey = randomUUID();
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const canonical = [method.toUpperCase(), path, timestamp, nonce, idempotencyKey, payloadHash].join("\n");
  const signature = createHmac("sha256", secret).update(canonical).digest("hex");

  return {
    "x-signature": signature,
    "x-signature-algorithm": "HMAC-SHA256",
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-idempotency-key": idempotencyKey
  };
}

async function coreApiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: Record<string, string | undefined>;
    body?: unknown;
    adminAuth?: boolean;
    signPublish?: boolean;
    actor?: string;
  }
): Promise<T> {
  const method = options?.method || "GET";
  const url = resolveUrl(path, options?.query);
  const bodyString = options?.body === undefined ? "" : JSON.stringify(options.body);

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (options?.adminAuth) {
    const token = readAdminToken();
    if (!token) {
      throw new Error("CORE_API_ADMIN_TOKEN_MISSING");
    }
    headers.authorization = `Bearer ${token}`;
    headers["x-admin-role"] = readAdminRole();
    headers["x-actor"] = normalizeActor(options.actor);
  }

  if (options?.signPublish) {
    Object.assign(headers, signHeaders(method, resolvePath(url), bodyString || "{}"));
  }

  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers,
    body: method === "GET" ? undefined : bodyString || "{}"
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || payload?.message || payload?.error?.code || `CORE_API_HTTP_${response.status}`
    );
  }

  return payload?.data as T;
}

export async function fetchCatalogList(query?: {
  page?: string;
  limit?: string;
  q?: string;
}): Promise<{ ok: true; data: CatalogListDto } | { ok: false; error: string }> {
  try {
    const data = await coreApiRequest<CatalogListDto>("/v1/catalog/items", {
      method: "GET",
      query: {
        page: query?.page || "1",
        limit: query?.limit || "20",
        q: query?.q
      }
    });

    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function fetchCatalogItemById(itemId: string, includeInactive = true) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/items/id/${itemId}`, {
    method: "GET",
    query: {
      includeInactive: includeInactive ? "true" : "false"
    },
    adminAuth: true
  });
}

export async function createCatalogItem(input: CatalogItemCreateInput, options?: { actor?: string }) {
  return coreApiRequest<CatalogItemDto>("/v1/catalog/items", {
    method: "POST",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function updateCatalogItem(
  itemId: string,
  input: CatalogItemPatchInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/items/${itemId}`, {
    method: "PATCH",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function updateCatalogItemContent(
  itemId: string,
  input: CatalogItemContentPatchInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/items/${itemId}/content`, {
    method: "PATCH",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function deactivateCatalogItem(itemId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/items/${itemId}`, {
    method: "DELETE",
    adminAuth: true,
    actor: options?.actor
  });
}

export async function createCatalogVariant(
  itemId: string,
  input: CatalogVariantCreateInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/items/${itemId}/variants`, {
    method: "POST",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function updateCatalogVariant(
  variantId: string,
  input: CatalogVariantPatchInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/variants/${variantId}`, {
    method: "PATCH",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function deactivateCatalogVariant(variantId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/variants/${variantId}`, {
    method: "DELETE",
    adminAuth: true,
    actor: options?.actor
  });
}

export async function createCatalogRate(
  variantId: string,
  input: CatalogRateCreateInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/variants/${variantId}/rates`, {
    method: "POST",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function updateCatalogRate(
  rateId: string,
  input: CatalogRatePatchInput,
  options?: { actor?: string }
) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/rates/${rateId}`, {
    method: "PATCH",
    adminAuth: true,
    body: input,
    actor: options?.actor
  });
}

export async function deactivateCatalogRate(rateId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogItemDto>(`/v1/catalog/rates/${rateId}`, {
    method: "DELETE",
    adminAuth: true,
    actor: options?.actor
  });
}

export async function listCatalogPublishJobs(limit = 50, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto[]>("/v1/catalog/publish/jobs", {
    method: "GET",
    query: {
      limit: String(limit)
    },
    adminAuth: true,
    actor: options?.actor
  });
}

export async function getCatalogPublishJob(jobId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto>(`/v1/catalog/publish/jobs/${jobId}`, {
    method: "GET",
    adminAuth: true,
    actor: options?.actor
  });
}

export async function createCatalogPublishJob(input: {
  itemIds?: string[];
  note?: string;
}, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto>("/v1/catalog/publish/jobs", {
    method: "POST",
    adminAuth: true,
    signPublish: true,
    body: input,
    actor: options?.actor
  });
}

export async function submitCatalogPublishReview(jobId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto>(`/v1/catalog/publish/jobs/${jobId}/submit-review`, {
    method: "POST",
    adminAuth: true,
    signPublish: true,
    body: {},
    actor: options?.actor
  });
}

export async function publishCatalogJob(jobId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto>(`/v1/catalog/publish/jobs/${jobId}/publish`, {
    method: "POST",
    adminAuth: true,
    signPublish: true,
    body: {},
    actor: options?.actor
  });
}

export async function retryCatalogPublishJob(jobId: string, options?: { actor?: string }) {
  return coreApiRequest<CatalogPublishJobDto>(`/v1/catalog/publish/jobs/${jobId}/retry`, {
    method: "POST",
    adminAuth: true,
    signPublish: true,
    body: {},
    actor: options?.actor
  });
}
