import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("events")
  @ApiOperation({ summary: "List recent audit events" })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  listRecent(@Query("limit") limit?: string) {
    const parsedLimit = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return successEnvelope(this.auditService.listRecent(parsedLimit));
  }
}
