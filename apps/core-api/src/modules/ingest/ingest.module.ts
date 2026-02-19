import { Module } from "@nestjs/common";
import { IngestController } from "./ingest.controller";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

@Module({
  controllers: [IngestController],
  providers: [IngestService, IngestSecurityService]
})
export class IngestModule {}
