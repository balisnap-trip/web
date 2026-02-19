import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { DatabaseModule } from "../database/database.module";
import { MetricsController } from "./metrics.controller";
import { ReconciliationMetricsService } from "./reconciliation-metrics.service";
import { RequestMetricsService } from "./request-metrics.service";

@Module({
  imports: [DatabaseModule],
  controllers: [MetricsController],
  providers: [RequestMetricsService, ReconciliationMetricsService, AdminAuthGuard],
  exports: [RequestMetricsService]
})
export class MetricsModule {}
