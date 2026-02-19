import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { successEnvelope } from "../../common/http/envelope";
import { IngestQueueService } from "./ingest-queue.service";
import { IngestService } from "./ingest.service";

@ApiTags("ingest-metrics")
@Controller("v1/ingest/metrics")
export class IngestMetricsController {
  constructor(
    private readonly ingestQueueService: IngestQueueService,
    private readonly ingestService: IngestService
  ) {}

  @Get("queue")
  @ApiOperation({ summary: "Get ingest queue and dead-letter metrics" })
  async queue() {
    const [queue, deadLetter] = await Promise.all([
      this.ingestQueueService.getRuntimeMetrics(),
      this.ingestService.getDeadLetterMetrics()
    ]);

    return successEnvelope({
      queue,
      deadLetter
    });
  }
}
