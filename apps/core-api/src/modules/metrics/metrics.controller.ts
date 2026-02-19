import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { RequestMetricsService } from "./request-metrics.service";

@ApiTags("metrics")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/metrics")
export class MetricsController {
  constructor(private readonly requestMetricsService: RequestMetricsService) {}

  @Get("api")
  @ApiOperation({ summary: "Get API request metrics (latency, status rates, throughput)" })
  @ApiQuery({ name: "windowMinutes", required: false, example: 15 })
  getApiMetrics(@Query("windowMinutes") windowMinutes?: string) {
    const parsedWindowMinutes = Number.isFinite(Number(windowMinutes))
      ? Number(windowMinutes)
      : undefined;

    return successEnvelope(this.requestMetricsService.getApiRequestMetrics(parsedWindowMinutes));
  }
}
