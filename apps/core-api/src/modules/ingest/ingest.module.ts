import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { IngestDeadLetterController } from "./ingest-dead-letter.controller";
import { IngestFeatureFlagsService } from "./ingest-feature-flags.service";
import { IngestMetricsController } from "./ingest-metrics.controller";
import { IngestQueueService } from "./ingest-queue.service";
import { IngestRetentionService } from "./ingest-retention.service";
import { IngestController } from "./ingest.controller";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [IngestController, IngestDeadLetterController, IngestMetricsController],
  providers: [
    IngestService,
    IngestSecurityService,
    IngestFeatureFlagsService,
    IngestQueueService,
    IngestRetentionService,
    AdminAuthGuard
  ]
})
export class IngestModule {}
