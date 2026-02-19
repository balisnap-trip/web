import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuditModule } from "./modules/audit/audit.module";
import { BookingModule } from "./modules/booking/booking.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DatabaseModule } from "./modules/database/database.module";
import { IngestModule } from "./modules/ingest/ingest.module";
import { MappingModule } from "./modules/mapping/mapping.module";
import { MetricsModule } from "./modules/metrics/metrics.module";

@Module({
  imports: [
    DatabaseModule,
    CatalogModule,
    BookingModule,
    IngestModule,
    MappingModule,
    AuditModule,
    MetricsModule
  ],
  controllers: [AppController]
})
export class AppModule {}
