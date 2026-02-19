import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog")
@Controller("v1/catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("items")
  @ApiOperation({ summary: "List catalog items" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  @ApiQuery({ name: "featured", required: false, example: true })
  @ApiQuery({ name: "active", required: false, example: true })
  @ApiQuery({ name: "q", required: false, example: "hidden gems" })
  list(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("featured") featured?: string,
    @Query("active") active?: string,
    @Query("q") q?: string
  ) {
    const parsedPage = Number.isFinite(Number(page)) ? Number(page) : 1;
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 20;

    return successEnvelope(
      this.catalogService.list({
        page: parsedPage,
        limit: parsedLimit,
        featured: featured === undefined ? undefined : featured === "true",
        active: active === undefined ? undefined : active === "true",
        q
      })
    );
  }

  @Get("items/featured")
  @ApiOperation({ summary: "List featured catalog items" })
  featured() {
    return successEnvelope(this.catalogService.featured());
  }

  @Get("items/:slug")
  @ApiOperation({ summary: "Get catalog item by slug" })
  @ApiParam({ name: "slug", example: "hidden-gems-bali" })
  getBySlug(@Param("slug") slug: string) {
    const item = this.catalogService.getBySlug(slug);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for slug: ${slug}`);
    }

    return successEnvelope(item);
  }
}
