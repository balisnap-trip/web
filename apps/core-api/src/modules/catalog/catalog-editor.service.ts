import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PoolClient } from "pg";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../database/database.service";

export type CatalogTravelerType = "ADULT" | "CHILD" | "INFANT";

export interface CatalogEditorSlide {
  url: string;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
}

export interface CatalogEditorItineraryEntry {
  variantId: string | null;
  day: number;
  sortOrder: number;
  title: string;
  description: string | null;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface CatalogEditorFaqEntry {
  question: string;
  answer: string;
}

export interface CatalogEditorItemContent {
  slides: CatalogEditorSlide[];
  itinerary: CatalogEditorItineraryEntry[];
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  additionalInfo: string[];
  optionalFeatures: string[];
  faqs: CatalogEditorFaqEntry[];
}

export interface CatalogEditorRate {
  rateId: string;
  travelerType: CatalogTravelerType;
  currencyCode: string;
  price: number;
  isActive: boolean;
}

export interface CatalogEditorVariant {
  variantId: string;
  itemId: string;
  code: string;
  name: string;
  durationDays: number;
  currencyCode: string;
  isDefault: boolean;
  isActive: boolean;
  rates: CatalogEditorRate[];
}

export interface CatalogEditorItem {
  itemId: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  isFeatured: boolean;
  thumbnailUrl: string | null;
  content: CatalogEditorItemContent;
  variants: CatalogEditorVariant[];
}

export interface CatalogEditorItemCreateInput {
  slug: string;
  name: string;
  description?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
  variants?: CatalogEditorVariantCreateInput[];
}

export interface CatalogEditorItemPatchInput {
  slug?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  thumbnailUrl?: string | null;
}

export interface CatalogEditorVariantCreateInput {
  code: string;
  name: string;
  durationDays?: number;
  currencyCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
  rates?: CatalogEditorRateCreateInput[];
}

export interface CatalogEditorVariantPatchInput {
  code?: string;
  name?: string;
  durationDays?: number;
  currencyCode?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CatalogEditorRateCreateInput {
  travelerType: string;
  currencyCode?: string;
  price: number;
  isActive?: boolean;
}

export interface CatalogEditorRatePatchInput {
  travelerType?: string;
  currencyCode?: string;
  price?: number;
  isActive?: boolean;
}

export interface CatalogEditorItemContentPatchInput {
  content: unknown;
}

interface ProductRow {
  item_id: string;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  is_featured: boolean;
  thumbnail_url: string | null;
}

interface VariantRow {
  variant_id: string;
  item_id: string;
  code: string;
  name: string;
  duration_days: number | string;
  currency_code: string;
  is_default: boolean;
  is_active: boolean;
}

interface RateRow {
  rate_id: string;
  variant_id: string;
  traveler_type: string;
  currency_code: string;
  price: number | string;
  is_active: boolean;
}

interface ContentRow {
  item_id: string;
  payload: unknown;
}

interface VariantLookupRow {
  variant_id: string;
  item_id: string;
}

@Injectable()
export class CatalogEditorService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService
  ) {}

  async getItemById(itemId: string, includeInactive = true): Promise<CatalogEditorItem | null> {
    const items = await this.loadItems([itemId], includeInactive);
    return items[0] ?? null;
  }

  async listItemsByIds(itemIds: string[], includeInactive = true): Promise<CatalogEditorItem[]> {
    const normalizedIds = [...new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) {
      return [];
    }
    return this.loadItems(normalizedIds, includeInactive);
  }

  async listActiveItemsForPublish(): Promise<CatalogEditorItem[]> {
    try {
      const productResult = await this.databaseService.opsQuery<ProductRow>(
        `
          select
            p.product_key::text as item_id,
            p.slug,
            p.name,
            coalesce(nullif(p.description, ''), nullif(p.short_description, ''), '') as description,
            p.is_active,
            p.is_featured,
            p.thumbnail_url
          from catalog_product p
          where p.is_active = true
          order by p.is_featured desc, p.priority asc nulls last, p.updated_at desc, p.name asc
        `,
        []
      );

      const items = this.mapProducts(productResult.rows);
      await this.attachVariantsAndRates(items, false);
      await this.attachItemContent(items);
      return items;
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }
  }

  private mapProducts(rows: ProductRow[]): CatalogEditorItem[] {
    return rows.map((row) => ({
      itemId: row.item_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.is_active),
      isFeatured: Boolean(row.is_featured),
      thumbnailUrl: row.thumbnail_url,
      content: this.createEmptyItemContent(),
      variants: []
    }));
  }

  private async loadItems(itemIds: string[], includeInactive: boolean): Promise<CatalogEditorItem[]> {
    const filters = ["p.product_key = any($1::uuid[])"];
    if (!includeInactive) {
      filters.push("p.is_active = true");
    }

    try {
      const productResult = await this.databaseService.opsQuery<ProductRow>(
        `
          select
            p.product_key::text as item_id,
            p.slug,
            p.name,
            coalesce(nullif(p.description, ''), nullif(p.short_description, ''), '') as description,
            p.is_active,
            p.is_featured,
            p.thumbnail_url
          from catalog_product p
          where ${filters.join(" and ")}
          order by p.updated_at desc
        `,
        [itemIds]
      );

      const items = this.mapProducts(productResult.rows);
      await this.attachVariantsAndRates(items, includeInactive);
      await this.attachItemContent(items);
      return items;
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }
  }

  private async attachVariantsAndRates(items: CatalogEditorItem[], includeInactive: boolean) {
    if (items.length === 0) {
      return;
    }

    const itemIds = items.map((item) => item.itemId);
    const itemById = new Map(items.map((item) => [item.itemId, item]));

    const variantFilters = ["v.product_key = any($1::uuid[])"];
    if (!includeInactive) {
      variantFilters.push("v.is_active = true");
    }

    const variantResult = await this.databaseService.opsQuery<VariantRow>(
      `
        select
          v.variant_key::text as variant_id,
          v.product_key::text as item_id,
          v.code,
          v.name,
          v.duration_days,
          v.currency_code,
          v.is_default,
          v.is_active
        from catalog_variant v
        where ${variantFilters.join(" and ")}
        order by v.is_default desc, v.updated_at desc, v.name asc
      `,
      [itemIds]
    );

    const variantById = new Map<string, CatalogEditorVariant>();
    for (const row of variantResult.rows) {
      const item = itemById.get(row.item_id);
      if (!item) {
        continue;
      }
      const variant: CatalogEditorVariant = {
        variantId: row.variant_id,
        itemId: row.item_id,
        code: row.code,
        name: row.name,
        durationDays: Math.max(1, Number(row.duration_days) || 1),
        currencyCode: this.normalizeCurrencyCode(row.currency_code),
        isDefault: Boolean(row.is_default),
        isActive: Boolean(row.is_active),
        rates: []
      };
      item.variants.push(variant);
      variantById.set(row.variant_id, variant);
    }

    if (variantById.size === 0) {
      return;
    }

    const rateFilters = ["r.variant_key = any($1::uuid[])"];
    if (!includeInactive) {
      rateFilters.push("r.is_active = true");
    }

    const rateResult = await this.databaseService.opsQuery<RateRow>(
      `
        select
          r.variant_rate_key::text as rate_id,
          r.variant_key::text as variant_id,
          r.traveler_type,
          r.currency_code,
          r.price,
          r.is_active
        from catalog_variant_rate r
        where ${rateFilters.join(" and ")}
        order by r.variant_key asc, r.traveler_type asc, r.price asc
      `,
      [[...variantById.keys()]]
    );

    for (const row of rateResult.rows) {
      const variant = variantById.get(row.variant_id);
      if (!variant) {
        continue;
      }
      variant.rates.push({
        rateId: row.rate_id,
        travelerType: this.normalizeTravelerType(row.traveler_type),
        currencyCode: this.normalizeCurrencyCode(row.currency_code),
        price: Number(row.price) || 0,
        isActive: Boolean(row.is_active)
      });
    }
  }

  private async attachItemContent(items: CatalogEditorItem[]) {
    if (items.length === 0) {
      return;
    }

    const itemById = new Map(items.map((item) => [item.itemId, item]));
    const itemIds = [...itemById.keys()];

    try {
      const contentResult = await this.databaseService.opsQuery<ContentRow>(
        `
          select
            c.product_key::text as item_id,
            c.payload
          from catalog_product_content c
          where c.product_key = any($1::uuid[])
        `,
        [itemIds]
      );

      for (const row of contentResult.rows) {
        const item = itemById.get(row.item_id);
        if (!item) {
          continue;
        }
        item.content = this.normalizeItemContentForRead(row.payload);
      }
    } catch (error) {
      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (pgErrorCode === "42P01") {
        return;
      }
      throw error;
    }
  }

  private createEmptyItemContent(): CatalogEditorItemContent {
    return {
      slides: [],
      itinerary: [],
      highlights: [],
      inclusions: [],
      exclusions: [],
      additionalInfo: [],
      optionalFeatures: [],
      faqs: []
    };
  }

  async createItem(actor: string, input: CatalogEditorItemCreateInput): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const normalizedSlug = this.normalizeSlug(input.slug);
    const normalizedName = this.normalizeRequiredText(input.name, "CATALOG_ITEM_NAME_REQUIRED", 255);
    const description = this.normalizeOptionalText(input.description) || "";
    const productKey = randomUUID();
    const variants = (input.variants || []).map((variant) => this.normalizeVariantInput(variant));

    this.assertSingleDefaultVariant(variants);

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        await client.query(
          `
            insert into catalog_product (
              product_key,
              slug,
              name,
              short_description,
              description,
              is_active,
              is_featured,
              thumbnail_url,
              country_code
            ) values (
              $1,$2,$3,$4,$5,$6,$7,$8,$9
            )
          `,
          [
            productKey,
            normalizedSlug,
            normalizedName,
            description || null,
            description || null,
            input.isActive ?? true,
            input.isFeatured ?? false,
            this.normalizeOptionalText(input.thumbnailUrl),
            "ID"
          ]
        );

        for (const variant of variants) {
          await this.insertVariantWithRates(client, productKey, variant);
        }
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(productKey, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${productKey}`);
    }

    this.auditService.record({
      eventType: "CATALOG_ITEM_CREATED",
      actor: normalizedActor,
      resourceType: "CATALOG_ITEM",
      resourceId: productKey,
      metadata: {
        slug: normalizedSlug,
        variantCount: variants.length
      }
    });

    return item;
  }

  async patchItem(
    actor: string,
    itemId: string,
    input: CatalogEditorItemPatchInput
  ): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const values: unknown[] = [];
    const setClauses: string[] = [];

    if (input.slug !== undefined) {
      values.push(this.normalizeSlug(input.slug));
      setClauses.push(`slug = $${values.length}`);
    }

    if (input.name !== undefined) {
      values.push(this.normalizeRequiredText(input.name, "CATALOG_ITEM_NAME_REQUIRED", 255));
      setClauses.push(`name = $${values.length}`);
    }

    if (input.description !== undefined) {
      const normalizedDescription = this.normalizeOptionalText(input.description);
      values.push(normalizedDescription);
      setClauses.push(`description = $${values.length}`);
      values.push(normalizedDescription);
      setClauses.push(`short_description = $${values.length}`);
    }

    if (input.isActive !== undefined) {
      values.push(Boolean(input.isActive));
      setClauses.push(`is_active = $${values.length}`);
    }

    if (input.isFeatured !== undefined) {
      values.push(Boolean(input.isFeatured));
      setClauses.push(`is_featured = $${values.length}`);
    }

    if (input.thumbnailUrl !== undefined) {
      values.push(this.normalizeOptionalText(input.thumbnailUrl));
      setClauses.push(`thumbnail_url = $${values.length}`);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException("CATALOG_ITEM_PATCH_EMPTY");
    }

    values.push(itemId);

    try {
      const result = await this.databaseService.opsQuery<{ item_id: string }>(
        `
          update catalog_product
          set ${setClauses.join(", ")}, updated_at = now()
          where product_key = $${values.length}::uuid
          returning product_key::text as item_id
        `,
        values
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
      }
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_ITEM_UPDATED",
      actor: normalizedActor,
      resourceType: "CATALOG_ITEM",
      resourceId: itemId,
      metadata: {
        fields: setClauses.length
      }
    });

    return item;
  }

  async patchItemContent(
    actor: string,
    itemId: string,
    input: CatalogEditorItemContentPatchInput
  ): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const normalizedContent = this.normalizeItemContentForWrite(input.content);

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        await this.assertItemExists(client, itemId);
        await client.query(
          `
            insert into catalog_product_content (
              product_key,
              payload,
              updated_by
            ) values (
              $1::uuid,
              $2::jsonb,
              $3
            )
            on conflict (product_key) do update
            set payload = excluded.payload,
                updated_by = excluded.updated_by,
                updated_at = now()
          `,
          [itemId, JSON.stringify(normalizedContent), normalizedActor]
        );
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_ITEM_CONTENT_UPDATED",
      actor: normalizedActor,
      resourceType: "CATALOG_ITEM",
      resourceId: itemId,
      metadata: {
        slides: normalizedContent.slides.length,
        itinerary: normalizedContent.itinerary.length,
        highlights: normalizedContent.highlights.length,
        inclusions: normalizedContent.inclusions.length,
        exclusions: normalizedContent.exclusions.length,
        additionalInfo: normalizedContent.additionalInfo.length,
        optionalFeatures: normalizedContent.optionalFeatures.length,
        faqs: normalizedContent.faqs.length
      }
    });

    return item;
  }

  async deactivateItem(actor: string, itemId: string): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const result = await client.query<{ item_id: string }>(
          `
            update catalog_product
            set is_active = false, updated_at = now()
            where product_key = $1::uuid
            returning product_key::text as item_id
          `,
          [itemId]
        );

        if (result.rows.length === 0) {
          throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
        }

        await client.query(
          `
            update catalog_variant
            set is_active = false, is_default = false, updated_at = now()
            where product_key = $1::uuid
          `,
          [itemId]
        );

        await client.query(
          `
            update catalog_variant_rate r
            set is_active = false, updated_at = now()
            where r.variant_key in (
              select v.variant_key
              from catalog_variant v
              where v.product_key = $1::uuid
            )
          `,
          [itemId]
        );
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_ITEM_DEACTIVATED",
      actor: normalizedActor,
      resourceType: "CATALOG_ITEM",
      resourceId: itemId,
      metadata: {
        isActive: false
      }
    });

    return item;
  }

  async createVariant(
    actor: string,
    itemId: string,
    input: CatalogEditorVariantCreateInput
  ): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const normalizedVariant = this.normalizeVariantInput(input);

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        await this.assertItemExists(client, itemId);
        await this.insertVariantWithRates(client, itemId, normalizedVariant);
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_VARIANT_CREATED",
      actor: normalizedActor,
      resourceType: "CATALOG_ITEM",
      resourceId: itemId,
      metadata: {
        code: normalizedVariant.code,
        rates: normalizedVariant.rates.length
      }
    });

    return item;
  }

  async patchVariant(
    actor: string,
    variantId: string,
    input: CatalogEditorVariantPatchInput
  ): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const values: unknown[] = [];
    const setClauses: string[] = [];

    if (input.code !== undefined) {
      values.push(this.normalizeVariantCode(input.code));
      setClauses.push(`code = $${values.length}`);
    }

    if (input.name !== undefined) {
      values.push(this.normalizeRequiredText(input.name, "CATALOG_VARIANT_NAME_REQUIRED", 255));
      setClauses.push(`name = $${values.length}`);
    }

    if (input.durationDays !== undefined) {
      values.push(this.parsePositiveInteger(input.durationDays, "CATALOG_VARIANT_DURATION_DAYS_INVALID"));
      setClauses.push(`duration_days = $${values.length}`);
    }

    if (input.currencyCode !== undefined) {
      values.push(this.normalizeCurrencyCode(input.currencyCode));
      setClauses.push(`currency_code = $${values.length}`);
    }

    if (input.isDefault !== undefined) {
      values.push(Boolean(input.isDefault));
      setClauses.push(`is_default = $${values.length}`);
    }

    if (input.isActive !== undefined) {
      values.push(Boolean(input.isActive));
      setClauses.push(`is_active = $${values.length}`);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException("CATALOG_VARIANT_PATCH_EMPTY");
    }

    values.push(variantId);
    let itemId = "";

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const result = await client.query<VariantLookupRow>(
          `
            update catalog_variant
            set ${setClauses.join(", ")}, updated_at = now()
            where variant_key = $${values.length}::uuid
            returning variant_key::text as variant_id, product_key::text as item_id
          `,
          values
        );

        if (result.rows.length === 0) {
          throw new NotFoundException(`Catalog variant not found for id: ${variantId}`);
        }

        itemId = result.rows[0]?.item_id || "";

        if (input.isDefault === true) {
          await client.query(
            `
              update catalog_variant
              set is_default = false, updated_at = now()
              where product_key = $1::uuid
                and variant_key <> $2::uuid
            `,
            [itemId, variantId]
          );
        }
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_VARIANT_UPDATED",
      actor: normalizedActor,
      resourceType: "CATALOG_VARIANT",
      resourceId: variantId,
      metadata: {
        fields: setClauses.length
      }
    });

    return item;
  }

  async deactivateVariant(actor: string, variantId: string): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    let itemId = "";

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const result = await client.query<VariantLookupRow>(
          `
            update catalog_variant
            set is_active = false, is_default = false, updated_at = now()
            where variant_key = $1::uuid
            returning variant_key::text as variant_id, product_key::text as item_id
          `,
          [variantId]
        );

        if (result.rows.length === 0) {
          throw new NotFoundException(`Catalog variant not found for id: ${variantId}`);
        }

        itemId = result.rows[0]?.item_id || "";

        await client.query(
          `
            update catalog_variant_rate
            set is_active = false, updated_at = now()
            where variant_key = $1::uuid
          `,
          [variantId]
        );
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_VARIANT_DEACTIVATED",
      actor: normalizedActor,
      resourceType: "CATALOG_VARIANT",
      resourceId: variantId,
      metadata: {
        isActive: false
      }
    });

    return item;
  }

  async createRate(
    actor: string,
    variantId: string,
    input: CatalogEditorRateCreateInput
  ): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const normalizedRate = this.normalizeRateInput(input);
    let itemId = "";

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const lookup = await client.query<VariantLookupRow>(
          `
            select variant_key::text as variant_id, product_key::text as item_id
            from catalog_variant
            where variant_key = $1::uuid
            limit 1
          `,
          [variantId]
        );

        if (lookup.rows.length === 0) {
          throw new NotFoundException(`Catalog variant not found for id: ${variantId}`);
        }

        itemId = lookup.rows[0]?.item_id || "";

        await this.insertRate(client, variantId, normalizedRate);
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_RATE_CREATED",
      actor: normalizedActor,
      resourceType: "CATALOG_VARIANT",
      resourceId: variantId,
      metadata: {
        travelerType: normalizedRate.travelerType,
        price: normalizedRate.price
      }
    });

    return item;
  }

  async patchRate(actor: string, rateId: string, input: CatalogEditorRatePatchInput): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    const values: unknown[] = [];
    const setClauses: string[] = [];

    if (input.travelerType !== undefined) {
      values.push(this.normalizeTravelerType(input.travelerType));
      setClauses.push(`traveler_type = $${values.length}`);
    }

    if (input.currencyCode !== undefined) {
      values.push(this.normalizeCurrencyCode(input.currencyCode));
      setClauses.push(`currency_code = $${values.length}`);
    }

    if (input.price !== undefined) {
      values.push(this.parseDecimal(input.price, "CATALOG_RATE_PRICE_INVALID"));
      setClauses.push(`price = $${values.length}`);
    }

    if (input.isActive !== undefined) {
      values.push(Boolean(input.isActive));
      setClauses.push(`is_active = $${values.length}`);
    }

    if (setClauses.length === 0) {
      throw new BadRequestException("CATALOG_RATE_PATCH_EMPTY");
    }

    values.push(rateId);
    let variantId = "";
    let itemId = "";

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const rateResult = await client.query<{ variant_id: string }>(
          `
            update catalog_variant_rate
            set ${setClauses.join(", ")}, updated_at = now()
            where variant_rate_key = $${values.length}::uuid
            returning variant_key::text as variant_id
          `,
          values
        );

        if (rateResult.rows.length === 0) {
          throw new NotFoundException(`Catalog rate not found for id: ${rateId}`);
        }

        variantId = rateResult.rows[0]?.variant_id || "";

        const variantLookup = await client.query<VariantLookupRow>(
          `
            select variant_key::text as variant_id, product_key::text as item_id
            from catalog_variant
            where variant_key = $1::uuid
            limit 1
          `,
          [variantId]
        );

        if (variantLookup.rows.length === 0) {
          throw new NotFoundException(`Catalog variant not found for id: ${variantId}`);
        }

        itemId = variantLookup.rows[0]?.item_id || "";
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_RATE_UPDATED",
      actor: normalizedActor,
      resourceType: "CATALOG_RATE",
      resourceId: rateId,
      metadata: {
        variantId,
        fields: setClauses.length
      }
    });

    return item;
  }

  async deactivateRate(actor: string, rateId: string): Promise<CatalogEditorItem> {
    const normalizedActor = this.normalizeActor(actor);
    let variantId = "";
    let itemId = "";

    try {
      await this.databaseService.withOpsTransaction(async (client) => {
        const rateResult = await client.query<{ variant_id: string }>(
          `
            update catalog_variant_rate
            set is_active = false, updated_at = now()
            where variant_rate_key = $1::uuid
            returning variant_key::text as variant_id
          `,
          [rateId]
        );

        if (rateResult.rows.length === 0) {
          throw new NotFoundException(`Catalog rate not found for id: ${rateId}`);
        }

        variantId = rateResult.rows[0]?.variant_id || "";

        const variantLookup = await client.query<VariantLookupRow>(
          `
            select variant_key::text as variant_id, product_key::text as item_id
            from catalog_variant
            where variant_key = $1::uuid
            limit 1
          `,
          [variantId]
        );

        if (variantLookup.rows.length === 0) {
          throw new NotFoundException(`Catalog variant not found for id: ${variantId}`);
        }

        itemId = variantLookup.rows[0]?.item_id || "";
      });
    } catch (error) {
      this.rethrowKnownErrors(error);
      throw error;
    }

    const item = await this.getItemById(itemId, true);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }

    this.auditService.record({
      eventType: "CATALOG_RATE_DEACTIVATED",
      actor: normalizedActor,
      resourceType: "CATALOG_RATE",
      resourceId: rateId,
      metadata: {
        isActive: false,
        variantId
      }
    });

    return item;
  }

  private normalizeItemContentForWrite(content: unknown): CatalogEditorItemContent {
    if (!this.isRecord(content)) {
      throw new BadRequestException("CATALOG_ITEM_CONTENT_INVALID");
    }
    return this.normalizeItemContentRecord(content, true);
  }

  private normalizeItemContentForRead(payload: unknown): CatalogEditorItemContent {
    if (!this.isRecord(payload)) {
      return this.createEmptyItemContent();
    }
    return this.normalizeItemContentRecord(payload, false);
  }

  private normalizeItemContentRecord(
    input: Record<string, unknown>,
    strict: boolean
  ): CatalogEditorItemContent {
    return {
      slides: this.normalizeSlides(input.slides, strict),
      itinerary: this.normalizeItinerary(input.itinerary, strict),
      highlights: this.normalizeStringList(input.highlights, strict, "CATALOG_ITEM_CONTENT_HIGHLIGHTS_INVALID"),
      inclusions: this.normalizeStringList(input.inclusions, strict, "CATALOG_ITEM_CONTENT_INCLUSIONS_INVALID"),
      exclusions: this.normalizeStringList(input.exclusions, strict, "CATALOG_ITEM_CONTENT_EXCLUSIONS_INVALID"),
      additionalInfo: this.normalizeStringList(
        input.additionalInfo,
        strict,
        "CATALOG_ITEM_CONTENT_ADDITIONAL_INFO_INVALID"
      ),
      optionalFeatures: this.normalizeStringList(
        input.optionalFeatures,
        strict,
        "CATALOG_ITEM_CONTENT_OPTIONAL_FEATURES_INVALID"
      ),
      faqs: this.normalizeFaqs(input.faqs, strict)
    };
  }

  private normalizeSlides(value: unknown, strict: boolean): CatalogEditorSlide[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      if (strict) {
        throw new BadRequestException("CATALOG_ITEM_CONTENT_SLIDES_INVALID");
      }
      return [];
    }

    const slides: CatalogEditorSlide[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const row = value[index];
      if (!this.isRecord(row)) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_SLIDES_INVALID");
        }
        continue;
      }

      const url = this.normalizeOptionalTextFromUnknown(
        row.url,
        strict,
        "CATALOG_ITEM_CONTENT_SLIDE_URL_INVALID",
        2048
      );
      if (!url) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_SLIDE_URL_REQUIRED");
        }
        continue;
      }

      const altText = this.normalizeOptionalTextFromUnknown(
        row.altText,
        strict,
        "CATALOG_ITEM_CONTENT_SLIDE_ALT_TEXT_INVALID",
        255
      );

      slides.push({
        url,
        altText,
        isCover: Boolean(row.isCover),
        sortOrder: this.parseIntegerFromUnknown(
          row.sortOrder,
          index + 1,
          0,
          strict,
          "CATALOG_ITEM_CONTENT_SLIDE_SORT_ORDER_INVALID"
        )
      });
    }

    slides.sort((left, right) => left.sortOrder - right.sortOrder);

    const coverIndex = slides.findIndex((slide) => slide.isCover);
    if (coverIndex === -1 && slides.length > 0) {
      slides[0].isCover = true;
    } else if (coverIndex > -1) {
      for (let index = 0; index < slides.length; index += 1) {
        slides[index].isCover = index === coverIndex;
      }
    }

    return slides;
  }

  private normalizeItinerary(value: unknown, strict: boolean): CatalogEditorItineraryEntry[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      if (strict) {
        throw new BadRequestException("CATALOG_ITEM_CONTENT_ITINERARY_INVALID");
      }
      return [];
    }

    const itinerary: CatalogEditorItineraryEntry[] = [];

    for (let index = 0; index < value.length; index += 1) {
      const row = value[index];
      if (!this.isRecord(row)) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_ITINERARY_INVALID");
        }
        continue;
      }

      const title = this.normalizeOptionalTextFromUnknown(
        row.title,
        strict,
        "CATALOG_ITEM_CONTENT_ITINERARY_TITLE_INVALID",
        255
      );
      if (!title) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_ITINERARY_TITLE_REQUIRED");
        }
        continue;
      }

      const rawVariantId = this.normalizeOptionalTextFromUnknown(
        row.variantId,
        strict,
        "CATALOG_ITEM_CONTENT_ITINERARY_VARIANT_INVALID",
        64
      );

      itinerary.push({
        variantId: rawVariantId || null,
        day: this.parseIntegerFromUnknown(
          row.day,
          1,
          1,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_DAY_INVALID"
        ),
        sortOrder: this.parseIntegerFromUnknown(
          row.sortOrder,
          index + 1,
          0,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_SORT_ORDER_INVALID"
        ),
        title,
        description: this.normalizeOptionalTextFromUnknown(
          row.description,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_DESCRIPTION_INVALID",
          2000
        ),
        location: this.normalizeOptionalTextFromUnknown(
          row.location,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_LOCATION_INVALID",
          255
        ),
        startTime: this.normalizeOptionalTextFromUnknown(
          row.startTime,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_START_TIME_INVALID",
          32
        ),
        endTime: this.normalizeOptionalTextFromUnknown(
          row.endTime,
          strict,
          "CATALOG_ITEM_CONTENT_ITINERARY_END_TIME_INVALID",
          32
        )
      });
    }

    itinerary.sort((left, right) => {
      if (left.day !== right.day) {
        return left.day - right.day;
      }
      return left.sortOrder - right.sortOrder;
    });

    return itinerary;
  }

  private normalizeFaqs(value: unknown, strict: boolean): CatalogEditorFaqEntry[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      if (strict) {
        throw new BadRequestException("CATALOG_ITEM_CONTENT_FAQS_INVALID");
      }
      return [];
    }

    const faqs: CatalogEditorFaqEntry[] = [];
    for (const row of value) {
      if (!this.isRecord(row)) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_FAQS_INVALID");
        }
        continue;
      }

      const question = this.normalizeOptionalTextFromUnknown(
        row.question,
        strict,
        "CATALOG_ITEM_CONTENT_FAQ_QUESTION_INVALID",
        255
      );
      const answer = this.normalizeOptionalTextFromUnknown(
        row.answer,
        strict,
        "CATALOG_ITEM_CONTENT_FAQ_ANSWER_INVALID",
        2000
      );

      if (!question || !answer) {
        if (strict) {
          throw new BadRequestException("CATALOG_ITEM_CONTENT_FAQ_REQUIRED");
        }
        continue;
      }

      faqs.push({
        question,
        answer
      });
    }

    return faqs;
  }

  private normalizeStringList(value: unknown, strict: boolean, errorCode: string): string[] {
    if (value === null || value === undefined) {
      return [];
    }
    if (!Array.isArray(value)) {
      if (strict) {
        throw new BadRequestException(errorCode);
      }
      return [];
    }

    const output: string[] = [];
    const seen = new Set<string>();

    for (const entry of value) {
      if (typeof entry !== "string") {
        if (strict) {
          throw new BadRequestException(errorCode);
        }
        continue;
      }
      const normalized = this.normalizeOptionalText(entry)?.slice(0, 500) || "";
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }

    return output;
  }

  private parseIntegerFromUnknown(
    value: unknown,
    fallback: number,
    min: number,
    strict: boolean,
    errorCode: string
  ): number {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      if (strict) {
        throw new BadRequestException(errorCode);
      }
      return fallback;
    }

    const normalized = Math.trunc(parsed);
    if (normalized < min) {
      if (strict) {
        throw new BadRequestException(errorCode);
      }
      return fallback;
    }

    return normalized;
  }

  private normalizeOptionalTextFromUnknown(
    value: unknown,
    strict: boolean,
    errorCode: string,
    maxLength: number
  ): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== "string") {
      if (strict) {
        throw new BadRequestException(errorCode);
      }
      return null;
    }
    const normalized = this.normalizeOptionalText(value);
    return normalized ? normalized.slice(0, maxLength) : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private normalizeVariantInput(input: CatalogEditorVariantCreateInput): {
    code: string;
    name: string;
    durationDays: number;
    currencyCode: string;
    isDefault: boolean;
    isActive: boolean;
    rates: Array<{
      travelerType: CatalogTravelerType;
      currencyCode: string;
      price: number;
      isActive: boolean;
    }>;
  } {
    return {
      code: this.normalizeVariantCode(input.code),
      name: this.normalizeRequiredText(input.name, "CATALOG_VARIANT_NAME_REQUIRED", 255),
      durationDays: this.parsePositiveInteger(input.durationDays, "CATALOG_VARIANT_DURATION_DAYS_INVALID"),
      currencyCode: this.normalizeCurrencyCode(input.currencyCode),
      isDefault: input.isDefault ?? false,
      isActive: input.isActive ?? true,
      rates: (input.rates || []).map((rate) => this.normalizeRateInput(rate))
    };
  }

  private normalizeRateInput(input: CatalogEditorRateCreateInput): {
    travelerType: CatalogTravelerType;
    currencyCode: string;
    price: number;
    isActive: boolean;
  } {
    return {
      travelerType: this.normalizeTravelerType(input.travelerType),
      currencyCode: this.normalizeCurrencyCode(input.currencyCode),
      price: this.parseDecimal(input.price, "CATALOG_RATE_PRICE_INVALID"),
      isActive: input.isActive ?? true
    };
  }

  private assertSingleDefaultVariant(
    variants: Array<{
      isDefault: boolean;
    }>
  ) {
    if (variants.length === 0) {
      return;
    }

    const defaultCount = variants.filter((variant) => variant.isDefault).length;
    if (defaultCount > 1) {
      throw new BadRequestException("CATALOG_VARIANT_DEFAULT_CONFLICT");
    }

    if (defaultCount === 0) {
      variants[0].isDefault = true;
    }
  }

  private async assertItemExists(client: PoolClient, itemId: string) {
    const result = await client.query<{ item_id: string }>(
      `
        select product_key::text as item_id
        from catalog_product
        where product_key = $1::uuid
        limit 1
      `,
      [itemId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }
  }

  private async insertVariantWithRates(
    client: PoolClient,
    itemId: string,
    variant: {
      code: string;
      name: string;
      durationDays: number;
      currencyCode: string;
      isDefault: boolean;
      isActive: boolean;
      rates: Array<{
        travelerType: CatalogTravelerType;
        currencyCode: string;
        price: number;
        isActive: boolean;
      }>;
    }
  ): Promise<string> {
    const variantId = randomUUID();

    await client.query(
      `
        insert into catalog_variant (
          variant_key,
          product_key,
          code,
          name,
          service_type,
          duration_days,
          min_pax,
          currency_code,
          is_default,
          is_active,
          booking_cutoff_hours
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
      `,
      [
        variantId,
        itemId,
        variant.code,
        variant.name,
        "PRIVATE",
        variant.durationDays,
        1,
        variant.currencyCode,
        variant.isDefault,
        variant.isActive,
        24
      ]
    );

    if (variant.isDefault) {
      await client.query(
        `
          update catalog_variant
          set is_default = false, updated_at = now()
          where product_key = $1::uuid
            and variant_key <> $2::uuid
        `,
        [itemId, variantId]
      );
    }

    for (const rate of variant.rates) {
      await this.insertRate(client, variantId, rate);
    }

    return variantId;
  }

  private async insertRate(
    client: PoolClient,
    variantId: string,
    rate: {
      travelerType: CatalogTravelerType;
      currencyCode: string;
      price: number;
      isActive: boolean;
    }
  ) {
    await client.query(
      `
        insert into catalog_variant_rate (
          variant_rate_key,
          variant_key,
          traveler_type,
          currency_code,
          price,
          is_active
        ) values (
          $1,$2,$3,$4,$5,$6
        )
      `,
      [randomUUID(), variantId, rate.travelerType, rate.currencyCode, rate.price, rate.isActive]
    );
  }

  private normalizeSlug(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 191);

    if (!normalized) {
      throw new BadRequestException("CATALOG_ITEM_SLUG_REQUIRED");
    }

    return normalized;
  }

  private normalizeVariantCode(value: string): string {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

    if (!normalized) {
      throw new BadRequestException("CATALOG_VARIANT_CODE_REQUIRED");
    }

    return normalized;
  }

  private normalizeRequiredText(value: string, errorCode: string, maxLength: number): string {
    const normalized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
    if (!normalized) {
      throw new BadRequestException(errorCode);
    }
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = value.trim().replace(/\s+/g, " ");
    return normalized || null;
  }

  private normalizeCurrencyCode(value: string | undefined, fallback = "USD"): string {
    const normalized = (value || fallback).trim().toUpperCase().slice(0, 3);
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new BadRequestException("CATALOG_CURRENCY_CODE_INVALID");
    }
    return normalized;
  }

  private normalizeTravelerType(value: string): CatalogTravelerType {
    const normalized = value.trim().toUpperCase();
    if (normalized === "ADULT" || normalized === "CHILD" || normalized === "INFANT") {
      return normalized;
    }
    throw new BadRequestException("CATALOG_TRAVELER_TYPE_INVALID");
  }

  private parsePositiveInteger(value: number | undefined, errorCode: string): number {
    if (value === undefined) {
      return 1;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(errorCode);
    }

    const normalized = Math.trunc(parsed);
    if (normalized < 1) {
      throw new BadRequestException(errorCode);
    }

    return normalized;
  }

  private parseDecimal(value: number, errorCode: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(errorCode);
    }
    return parsed;
  }

  private normalizeActor(actor: string): string {
    const normalized = actor.trim();
    return normalized || "system";
  }

  private rethrowKnownErrors(error: unknown): never | void {
    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    const pgErrorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";

    if (pgErrorCode === "42P01") {
      throw new ServiceUnavailableException("CATALOG_SCHEMA_NOT_READY");
    }

    if (pgErrorCode === "22P02") {
      throw new BadRequestException("CATALOG_ID_INVALID");
    }

    if (pgErrorCode === "23505") {
      throw new ConflictException("CATALOG_RESOURCE_ALREADY_EXISTS");
    }

    if (pgErrorCode === "23503") {
      throw new BadRequestException("CATALOG_FOREIGN_KEY_INVALID");
    }
  }
}
