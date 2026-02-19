import { Controller, Get, Headers, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { AuditService } from "../audit/audit.service";
import { IngestDeadLetterStatus, IngestService } from "./ingest.service";

@ApiTags("ingest-dead-letter")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/ingest/dead-letter")
export class IngestDeadLetterController {
  constructor(
    private readonly ingestService: IngestService,
    private readonly auditService: AuditService
  ) {}

  @Get()
  @ApiOperation({ summary: "List dead-letter events" })
  @ApiQuery({ name: "status", required: false, example: "OPEN" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  async list(
    @Query("status") status?: IngestDeadLetterStatus,
    @Query("limit") limit?: string
  ) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(
      await this.ingestService.listDeadLetters({
        status,
        limit: parsedLimit
      })
    );
  }

  @Get(":deadLetterKey")
  @ApiOperation({ summary: "Get dead-letter detail" })
  @ApiParam({ name: "deadLetterKey", example: "11ba6d8e-9bfd-4c9d-bcf3-537abcbf2d73" })
  async get(@Param("deadLetterKey") deadLetterKey: string) {
    return successEnvelope(await this.ingestService.getDeadLetter(deadLetterKey));
  }

  @Patch(":deadLetterKey/status/:status")
  @ApiOperation({ summary: "Update dead-letter status" })
  @ApiParam({ name: "deadLetterKey", example: "11ba6d8e-9bfd-4c9d-bcf3-537abcbf2d73" })
  @ApiParam({ name: "status", example: "READY" })
  @ApiHeader({ name: "x-actor", description: "Actor identifier for audit trail", required: false })
  @RequireAdminRoles("ADMIN", "MANAGER")
  async updateStatus(
    @Param("deadLetterKey") deadLetterKey: string,
    @Param("status") status: IngestDeadLetterStatus,
    @Headers() headers: Record<string, unknown>
  ) {
    const updated = await this.ingestService.updateDeadLetterStatus({
      deadLetterKey,
      toStatus: status
    });

    const actorHeader = headers["x-actor"] ?? headers["x-admin-user"] ?? headers["x-user-id"];
    const actor = typeof actorHeader === "string" && actorHeader.trim() ? actorHeader.trim() : "system";

    this.auditService.record({
      eventType: "INGEST_DEAD_LETTER_STATUS_UPDATED",
      actor,
      resourceType: "INGEST_DEAD_LETTER",
      resourceId: deadLetterKey,
      metadata: {
        status: updated.status,
        eventId: updated.eventId
      }
    });

    return successEnvelope(updated);
  }
}
