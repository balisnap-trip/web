import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { CatalogController } from "./catalog.controller";
import { CatalogEditorService } from "./catalog-editor.service";
import { CatalogPublishService } from "./catalog-publish.service";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogEditorService, CatalogPublishService, AdminAuthGuard]
})
export class CatalogModule {}
