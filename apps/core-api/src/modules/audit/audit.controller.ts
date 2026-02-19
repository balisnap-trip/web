import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@Controller("v1/audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("events")
  @ApiOperation({ summary: "List recent audit events" })
  listRecent() {
    return successEnvelope(this.auditService.listRecent());
  }
}
