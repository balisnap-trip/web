import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { MetricsController } from "./metrics.controller";
import { RequestMetricsService } from "./request-metrics.service";

@Module({
  controllers: [MetricsController],
  providers: [RequestMetricsService, AdminAuthGuard],
  exports: [RequestMetricsService]
})
export class MetricsModule {}
