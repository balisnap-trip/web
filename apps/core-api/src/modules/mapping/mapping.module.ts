import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { MappingController } from "./mapping.controller";
import { MappingService } from "./mapping.service";

@Module({
  controllers: [MappingController],
  providers: [MappingService, AdminAuthGuard]
})
export class MappingModule {}
