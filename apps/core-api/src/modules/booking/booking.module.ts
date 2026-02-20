import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { DatabaseModule } from "../database/database.module";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";

@Module({
  imports: [DatabaseModule],
  controllers: [BookingController],
  providers: [BookingService, AdminAuthGuard]
})
export class BookingModule {}
