import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AdminAuthGuard],
  exports: [AuditService]
})
export class AuditModule {}
