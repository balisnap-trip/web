import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IngestDeadLetterController } from "./ingest-dead-letter.controller";
import { IngestFeatureFlagsService } from "./ingest-feature-flags.service";
import { IngestQueueService } from "./ingest-queue.service";
import { IngestRetentionService } from "./ingest-retention.service";
import { IngestController } from "./ingest.controller";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestController, IngestDeadLetterController],
  providers: [
    IngestService,
    IngestSecurityService,
    IngestFeatureFlagsService,
    IngestQueueService,
    IngestRetentionService
  ]
})
export class IngestModule {}
