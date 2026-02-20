import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { RawBodyRequest } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import {
  CatalogEditorItemCreateInput,
  CatalogEditorItemPatchInput,
  CatalogEditorRateCreateInput,
  CatalogEditorRatePatchInput,
  CatalogEditorService,
  CatalogEditorVariantCreateInput,
  CatalogEditorVariantPatchInput
} from "./catalog-editor.service";
import { CatalogPublishDraftInput, CatalogPublishService } from "./catalog-publish.service";
import { CatalogService } from "./catalog.service";

interface CatalogRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  rawBody?: Buffer;
}

@ApiTags("catalog")
@Controller("v1/catalog")
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogEditorService: CatalogEditorService,
    private readonly catalogPublishService: CatalogPublishService
  ) {}

  @Get("items")
  @ApiOperation({ summary: "List catalog items" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  @ApiQuery({ name: "featured", required: false, example: true })
  @ApiQuery({ name: "active", required: false, example: true })
  @ApiQuery({ name: "q", required: false, example: "hidden gems" })
  async list(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("featured") featured?: string,
    @Query("active") active?: string,
    @Query("q") q?: string
  ) {
    const parsedPage = Number.isFinite(Number(page)) ? Number(page) : 1;
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : 20;

    return successEnvelope(
      await this.catalogService.list({
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
  async featured() {
    return successEnvelope(await this.catalogService.featured());
  }

  @Get("items/:slug")
  @ApiOperation({ summary: "Get catalog item by slug" })
  @ApiParam({ name: "slug", example: "hidden-gems-bali" })
  async getBySlug(@Param("slug") slug: string) {
    const item = await this.catalogService.getBySlug(slug);
    if (!item) {
      throw new NotFoundException(`Catalog item not found for slug: ${slug}`);
    }

    return successEnvelope(item);
  }

  @Get("items/id/:itemId")
  @ApiOperation({ summary: "Get catalog item by internal id (editor)" })
  @ApiParam({ name: "itemId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiQuery({ name: "includeInactive", required: false, example: true })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
  async getById(
    @Param("itemId") itemId: string,
    @Query("includeInactive") includeInactive?: string
  ) {
    const item = await this.catalogEditorService.getItemById(itemId, includeInactive !== "false");
    if (!item) {
      throw new NotFoundException(`Catalog item not found for id: ${itemId}`);
    }
    return successEnvelope(item);
  }

  @Post("items")
  @ApiOperation({ summary: "Create catalog item" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async createItem(
    @Body() body: CatalogEditorItemCreateInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.createItem(this.resolveActor(headers), body));
  }

  @Patch("items/:itemId")
  @ApiOperation({ summary: "Update catalog item" })
  @ApiParam({ name: "itemId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async patchItem(
    @Param("itemId") itemId: string,
    @Body() body: CatalogEditorItemPatchInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.patchItem(this.resolveActor(headers), itemId, body));
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Deactivate catalog item" })
  @ApiParam({ name: "itemId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async deactivateItem(
    @Param("itemId") itemId: string,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.deactivateItem(this.resolveActor(headers), itemId));
  }

  @Post("items/:itemId/variants")
  @ApiOperation({ summary: "Create catalog variant" })
  @ApiParam({ name: "itemId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async createVariant(
    @Param("itemId") itemId: string,
    @Body() body: CatalogEditorVariantCreateInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(
      await this.catalogEditorService.createVariant(this.resolveActor(headers), itemId, body)
    );
  }

  @Patch("variants/:variantId")
  @ApiOperation({ summary: "Update catalog variant" })
  @ApiParam({ name: "variantId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async patchVariant(
    @Param("variantId") variantId: string,
    @Body() body: CatalogEditorVariantPatchInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(
      await this.catalogEditorService.patchVariant(this.resolveActor(headers), variantId, body)
    );
  }

  @Delete("variants/:variantId")
  @ApiOperation({ summary: "Deactivate catalog variant" })
  @ApiParam({ name: "variantId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async deactivateVariant(
    @Param("variantId") variantId: string,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(
      await this.catalogEditorService.deactivateVariant(this.resolveActor(headers), variantId)
    );
  }

  @Post("variants/:variantId/rates")
  @ApiOperation({ summary: "Create catalog rate" })
  @ApiParam({ name: "variantId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async createRate(
    @Param("variantId") variantId: string,
    @Body() body: CatalogEditorRateCreateInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.createRate(this.resolveActor(headers), variantId, body));
  }

  @Patch("rates/:rateId")
  @ApiOperation({ summary: "Update catalog rate" })
  @ApiParam({ name: "rateId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async patchRate(
    @Param("rateId") rateId: string,
    @Body() body: CatalogEditorRatePatchInput,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.patchRate(this.resolveActor(headers), rateId, body));
  }

  @Delete("rates/:rateId")
  @ApiOperation({ summary: "Deactivate catalog rate" })
  @ApiParam({ name: "rateId", example: "7f139f89-59df-4bb3-9bc6-1e579f5df9fa" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async deactivateRate(
    @Param("rateId") rateId: string,
    @Headers() headers: Record<string, unknown>
  ) {
    return successEnvelope(await this.catalogEditorService.deactivateRate(this.resolveActor(headers), rateId));
  }

  @Get("publish/jobs")
  @ApiOperation({ summary: "List catalog publish jobs" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
  async listPublishJobs(@Query("limit") limit?: string) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(this.catalogPublishService.list(parsedLimit));
  }

  @Get("publish/jobs/:jobId")
  @ApiOperation({ summary: "Get catalog publish job" })
  @ApiParam({ name: "jobId", example: "3d5d6ece-b4f0-4e70-b532-2cb2c2f0e4f9" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
  async getPublishJob(@Param("jobId") jobId: string) {
    return successEnvelope(this.catalogPublishService.get(jobId));
  }

  @Post("publish/jobs")
  @ApiOperation({ summary: "Create catalog publish draft job" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @ApiHeader({ name: "x-signature", description: "HMAC signature (optional unless enforced)", required: false })
  @ApiHeader({ name: "x-signature-algorithm", description: "HMAC-SHA256", required: false })
  @ApiHeader({ name: "x-timestamp", description: "UTC ISO-8601 timestamp", required: false })
  @ApiHeader({ name: "x-nonce", description: "Unique nonce", required: false })
  @ApiHeader({ name: "x-idempotency-key", description: "Idempotency key", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async createPublishJob(
    @Body() body: CatalogPublishDraftInput,
    @Headers() headers: Record<string, unknown>,
    @Req() request: RawBodyRequest<CatalogRequestLike>
  ) {
    this.assertPublishSignature(request, headers, body);
    return successEnvelope(await this.catalogPublishService.createDraft(this.resolveActor(headers), body));
  }

  @Post("publish/jobs/:jobId/submit-review")
  @ApiOperation({ summary: "Submit catalog publish job for review" })
  @ApiParam({ name: "jobId", example: "3d5d6ece-b4f0-4e70-b532-2cb2c2f0e4f9" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async submitPublishReview(
    @Param("jobId") jobId: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
    @Req() request: RawBodyRequest<CatalogRequestLike>
  ) {
    this.assertPublishSignature(request, headers, body);
    return successEnvelope(await this.catalogPublishService.submitReview(jobId, this.resolveActor(headers)));
  }

  @Post("publish/jobs/:jobId/publish")
  @ApiOperation({ summary: "Publish catalog payload versioned" })
  @ApiParam({ name: "jobId", example: "3d5d6ece-b4f0-4e70-b532-2cb2c2f0e4f9" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async publishCatalogJob(
    @Param("jobId") jobId: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
    @Req() request: RawBodyRequest<CatalogRequestLike>
  ) {
    this.assertPublishSignature(request, headers, body);
    return successEnvelope(await this.catalogPublishService.publish(jobId, this.resolveActor(headers)));
  }

  @Post("publish/jobs/:jobId/retry")
  @ApiOperation({ summary: "Retry failed catalog publish job" })
  @ApiParam({ name: "jobId", example: "3d5d6ece-b4f0-4e70-b532-2cb2c2f0e4f9" })
  @ApiBearerAuth()
  @ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/MANAGER)", required: true })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @UseGuards(AdminAuthGuard)
  @RequireAdminRoles("ADMIN", "MANAGER")
  async retryPublishJob(
    @Param("jobId") jobId: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
    @Req() request: RawBodyRequest<CatalogRequestLike>
  ) {
    this.assertPublishSignature(request, headers, body);
    return successEnvelope(await this.catalogPublishService.retry(jobId, this.resolveActor(headers)));
  }

  private assertPublishSignature(
    request: RawBodyRequest<CatalogRequestLike>,
    headers: Record<string, unknown>,
    body: unknown
  ) {
    const rawBody =
      request.rawBody instanceof Buffer ? request.rawBody : Buffer.from(JSON.stringify(body ?? {}));

    this.catalogPublishService.assertSignedRequest({
      method: request.method || "POST",
      path: this.resolvePath(request),
      headers,
      rawBody
    });
  }

  private resolvePath(request: CatalogRequestLike): string {
    return (request.originalUrl || request.url || "/").split("?")[0] || "/";
  }

  private resolveActor(headers: Record<string, unknown>): string {
    const rawActor = headers["x-actor"] ?? headers["x-admin-user"] ?? headers["x-user-id"];
    if (typeof rawActor === "string" && rawActor.trim()) {
      return rawActor.trim();
    }
    return "system";
  }
}
