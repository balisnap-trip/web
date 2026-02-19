import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { AuditService } from "./audit.service";

@ApiTags("audit")
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
