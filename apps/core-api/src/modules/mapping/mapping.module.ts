import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { DatabaseModule } from "../database/database.module";
import { MappingController } from "./mapping.controller";
import { MappingService } from "./mapping.service";

@Module({
  imports: [DatabaseModule],
  controllers: [MappingController],
  providers: [MappingService, AdminAuthGuard]
})
export class MappingModule {}
