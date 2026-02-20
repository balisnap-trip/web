import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { MappingService, MappingStatus, UnmappedStatus } from "./mapping.service";

@ApiTags("channel-mappings")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/channel-mappings")
export class MappingController {
  constructor(private readonly mappingService: MappingService) {}

  @Get()
  @ApiOperation({ summary: "List channel mappings" })
  @ApiQuery({ name: "channelCode", required: false, example: "DIRECT" })
  @ApiQuery({ name: "entityType", required: false, example: "BOOKING_CORE" })
  @ApiQuery({ name: "limit", required: false, example: 100 })
  async list(
    @Query("channelCode") channelCode?: string,
    @Query("entityType") entityType?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(
      await this.mappingService.list({
        channelCode,
        entityType,
        limit: parsedLimit
      })
    );
  }

  @Post()
  @ApiOperation({ summary: "Create channel mapping" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  async create(
    @Body()
    body: {
      entityType: string;
      channelCode: string;
      externalRefKind: string;
      externalRef: string;
      entityKey: string;
      mappingStatus: MappingStatus;
      sourceSystem?: string;
      sourceTable?: string;
      sourcePk?: string;
      reasonCode?: string;
    }
  ) {
    return successEnvelope(await this.mappingService.create(body));
  }

  @Patch("unmapped/:id/status/:status")
  @ApiOperation({ summary: "Update unmapped queue status" })
  @ApiParam({ name: "id", example: "e6f313cf-d00d-4aa0-8a89-b48f5a66f5cd" })
  @ApiParam({ name: "status", example: "RESOLVED" })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @RequireAdminRoles("ADMIN", "MANAGER")
  async patchUnmappedStatus(
    @Param("id") id: string,
    @Param("status") status: UnmappedStatus,
    @Headers() headers: Record<string, unknown>
  ) {
    const actorHeader = headers["x-actor"] ?? headers["x-admin-user"] ?? headers["x-user-id"];
    const actor = typeof actorHeader === "string" && actorHeader.trim() ? actorHeader.trim() : "system";
    return successEnvelope(await this.mappingService.updateUnmappedStatus(id, status, actor));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update channel mapping" })
  @ApiParam({ name: "id", example: "e6f313cf-d00d-4aa0-8a89-b48f5a66f5cd" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  async patch(
    @Param("id") id: string,
    @Body()
    body: {
      entityType?: string;
      channelCode?: string;
      externalRefKind?: string;
      externalRef?: string;
      entityKey?: string;
      mappingStatus?: MappingStatus;
      reasonCode?: string;
    }
  ) {
    return successEnvelope(await this.mappingService.update(id, body));
  }

  @Get("unmapped")
  @ApiOperation({ summary: "List unmapped queue records" })
  @ApiQuery({ name: "status", required: false, example: "OPEN" })
  @ApiQuery({ name: "queueType", required: false, example: "PRODUCT_MAPPING" })
  @ApiQuery({ name: "limit", required: false, example: 100 })
  async listUnmapped(
    @Query("status") status?: UnmappedStatus,
    @Query("queueType") queueType?: string,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(
      await this.mappingService.listUnmapped({
        status,
        queueType,
        limit: parsedLimit
      })
    );
  }
}
