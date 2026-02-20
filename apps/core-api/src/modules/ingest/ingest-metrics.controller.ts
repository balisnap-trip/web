import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { IngestQueueService } from "./ingest-queue.service";
import { IngestService } from "./ingest.service";

@ApiTags("ingest-metrics")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/ingest/metrics")
export class IngestMetricsController {
  constructor(
    private readonly ingestQueueService: IngestQueueService,
    private readonly ingestService: IngestService
  ) {}

  @Get("queue")
  @ApiOperation({ summary: "Get ingest queue and dead-letter metrics" })
  async queue() {
    const retryPolicy = this.ingestQueueService.getRetryPolicy();
    const [queue, deadLetter, retry] = await Promise.all([
      this.ingestQueueService.getRuntimeMetrics(),
      this.ingestService.getDeadLetterMetrics(),
      this.ingestService.getRetryMetrics(retryPolicy)
    ]);

    return successEnvelope({
      queue,
      deadLetter,
      retry
    });
  }

  @Get("processing")
  @ApiOperation({ summary: "Get ingest processing metrics (rolling window)" })
  @ApiQuery({ name: "windowMinutes", required: false, example: 60 })
  async processing(@Query("windowMinutes") windowMinutes?: string) {
    const parsedWindowMinutes = Number.isFinite(Number(windowMinutes))
      ? Number(windowMinutes)
      : undefined;

    return successEnvelope(await this.ingestService.getProcessingMetrics(parsedWindowMinutes));
  }
}
