import { Injectable } from "@nestjs/common";

export interface CatalogRate {
  travelerType: "ADULT" | "CHILD";
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

@Injectable()
export class CatalogService {
  private readonly items: CatalogItem[] = [
    {
      itemId: "cat_demo_hidden_gems",
      slug: "hidden-gems-bali",
      name: "Hidden Gems Bali",
      isActive: true,
      isFeatured: true,
      description: "Demo item for contract scaffolding",
      variants: [
        {
          variantId: "var_demo_private",
          name: "Private Tour",
          durationDays: 1,
          currency: "USD",
          rates: [
            {
              travelerType: "ADULT",
              price: 100
            },
            {
              travelerType: "CHILD",
              price: 70
            }
          ]
        }
      ]
    }
  ];

  list(query: CatalogListQuery) {
    const normalizedQuery = (query.q || "").toLowerCase();
    const filtered = this.items.filter((item) => {
      if (typeof query.featured === "boolean" && item.isFeatured !== query.featured) {
        return false;
      }
      if (typeof query.active === "boolean" && item.isActive !== query.active) {
        return false;
      }
      if (normalizedQuery.length > 0 && !item.name.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      return true;
    });

    const page = Math.max(1, query.page);
    const limit = Math.max(1, query.limit);
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return {
      items: data,
      pagination: {
        page,
        limit,
        total: filtered.length
      }
    };
  }

  getBySlug(slug: string): CatalogItem | null {
    return this.items.find((item) => item.slug === slug) ?? null;
  }

  featured(): CatalogItem[] {
    return this.items.filter((item) => item.isFeatured);
  }
}
