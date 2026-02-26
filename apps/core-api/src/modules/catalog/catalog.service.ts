import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type CatalogTravelerType = "ADULT" | "CHILD" | "INFANT";

export interface CatalogRate {
  travelerType: CatalogTravelerType;
  price: number;
}

export interface CatalogVariant {
  variantId: string;
  name: string;
  durationDays: number;
  currency: string;
  rates: CatalogRate[];
}

export interface CatalogItem {
  itemId: string;
  slug: string;
  name: string;
  isActive: boolean;
  isFeatured: boolean;
  description: string;
  variants: CatalogVariant[];
}

export interface CatalogListQuery {
  page: number;
  limit: number;
  featured?: boolean;
  active?: boolean;
  q?: string;
}

interface ProductRow {
  item_id: string;
  slug: string;
  name: string;
  description: string;
  is_active: boolean;
  is_featured: boolean;
}

interface VariantRow {
  variant_id: string;
  item_id: string;
  name: string;
  duration_days: number | string;
  currency_code: string;
}

interface RateRow {
  variant_id: string;
  traveler_type: string;
  price: number | string;
}

@Injectable()
export class CatalogService {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(query: CatalogListQuery) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(Math.max(1, Math.trunc(Number(query.limit) || 20)), 100);
    const offset = (page - 1) * limit;
    const values: unknown[] = [];
    const filters: string[] = [];
    const normalizedQuery = (query.q || "").trim();

    if (typeof query.featured === "boolean") {
      values.push(query.featured);
      filters.push(`p.is_featured = $${values.length}`);
    }
    if (typeof query.active === "boolean") {
      values.push(query.active);
      filters.push(`p.is_active = $${values.length}`);
    }
    if (normalizedQuery) {
      values.push(`%${normalizedQuery}%`);
      const patternParam = `$${values.length}`;
      filters.push(
        `(p.name ilike ${patternParam} or p.slug ilike ${patternParam} or coalesce(p.description, p.short_description, '') ilike ${patternParam})`
      );
    }

    const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

    try {
      const totalResult = await this.databaseService.opsQuery<{ total: string }>(
        `
          select count(*)::text as total
          from catalog_product p
          ${whereClause}
        `,
        values
      );
      const total = Number(totalResult.rows[0]?.total || "0");

      const pagedValues = [...values, limit, offset];
      const limitParam = `$${pagedValues.length - 1}`;
      const offsetParam = `$${pagedValues.length}`;
      const productResult = await this.databaseService.opsQuery<ProductRow>(
        `
          select
            p.product_key::text as item_id,
            p.slug,
            p.name,
            coalesce(nullif(p.description, ''), nullif(p.short_description, ''), '') as description,
            p.is_active,
            p.is_featured
          from catalog_product p
          ${whereClause}
          order by p.is_featured desc, p.priority asc nulls last, p.updated_at desc, p.name asc
          limit ${limitParam}
          offset ${offsetParam}
        `,
        pagedValues
      );

      const items = this.mapProducts(productResult.rows);
      await this.attachVariantsAndRates(items);

      return {
        items,
        pagination: {
          page,
          limit,
          total
        }
      };
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async getBySlug(slug: string): Promise<CatalogItem | null> {
    const normalizedSlug = slug.trim();
    if (!normalizedSlug) {
      return null;
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
            p.is_featured
          from catalog_product p
          where lower(p.slug) = lower($1)
          limit 1
        `,
        [normalizedSlug]
      );

      const item = this.mapProducts(productResult.rows)[0];
      if (!item) {
        return null;
      }

      await this.attachVariantsAndRates([item]);
      return item;
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async featured(): Promise<CatalogItem[]> {
    try {
      const productResult = await this.databaseService.opsQuery<ProductRow>(
        `
          select
            p.product_key::text as item_id,
            p.slug,
            p.name,
            coalesce(nullif(p.description, ''), nullif(p.short_description, ''), '') as description,
            p.is_active,
            p.is_featured
          from catalog_product p
          where p.is_featured = true
          order by p.priority asc nulls last, p.updated_at desc, p.name asc
        `,
        []
      );

      const items = this.mapProducts(productResult.rows);
      await this.attachVariantsAndRates(items);
      return items;
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  private mapProducts(rows: ProductRow[]): CatalogItem[] {
    return rows.map((row) => ({
      itemId: row.item_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.is_active),
      isFeatured: Boolean(row.is_featured),
      variants: []
    }));
  }

  private async attachVariantsAndRates(items: CatalogItem[]) {
    if (items.length === 0) {
      return;
    }

    const itemIds = items.map((item) => item.itemId);
    const itemById = new Map(items.map((item) => [item.itemId, item]));

    const variantResult = await this.databaseService.opsQuery<VariantRow>(
      `
        select
          v.variant_key::text as variant_id,
          v.product_key::text as item_id,
          v.name,
          v.duration_days,
          v.currency_code
        from catalog_variant v
        where v.product_key = any($1::uuid[])
          and v.is_active = true
        order by v.is_default desc, v.updated_at desc, v.name asc
      `,
      [itemIds]
    );

    const variantById = new Map<string, CatalogVariant>();
    for (const row of variantResult.rows) {
      const item = itemById.get(row.item_id);
      if (!item) {
        continue;
      }
      const variant: CatalogVariant = {
        variantId: row.variant_id,
        name: row.name,
        durationDays: Math.max(1, Number(row.duration_days) || 1),
        currency: this.normalizeCurrency(row.currency_code),
        rates: []
      };
      item.variants.push(variant);
      variantById.set(row.variant_id, variant);
    }

    if (variantById.size === 0) {
      return;
    }

    const rateResult = await this.databaseService.opsQuery<RateRow>(
      `
        select
          r.variant_key::text as variant_id,
          r.traveler_type,
          r.price
        from catalog_variant_rate r
        where r.variant_key = any($1::uuid[])
          and r.is_active = true
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
        travelerType: this.normalizeTravelerType(row.traveler_type),
        price: Number(row.price) || 0
      });
    }
  }

  private normalizeCurrency(value: string): string {
    const normalized = value?.trim().toUpperCase();
    return normalized || "USD";
  }

  private normalizeTravelerType(value: string): CatalogTravelerType {
    const normalized = value?.trim().toUpperCase();
    if (normalized === "CHILD") {
      return "CHILD";
    }
    if (normalized === "INFANT") {
      return "INFANT";
    }
    return "ADULT";
  }

  private rethrowSchemaNotReady(error: unknown): never | void {
    const pgErrorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (pgErrorCode === "42P01") {
      throw new ServiceUnavailableException("CATALOG_READ_MODEL_NOT_READY");
    }

    if (error instanceof ServiceUnavailableException) {
      throw error;
    }
  }
}
