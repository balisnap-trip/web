import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IngestDeadLetterController } from "./ingest-dead-letter.controller";
import { IngestController } from "./ingest.controller";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestController, IngestDeadLetterController],
  providers: [IngestService, IngestSecurityService]
})
export class IngestModule {}
