import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { IngestController } from "./ingest.controller";
import { IngestSecurityService } from "./ingest-security.service";
import { IngestService } from "./ingest.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IngestController],
  providers: [IngestService, IngestSecurityService]
})
export class IngestModule {}
