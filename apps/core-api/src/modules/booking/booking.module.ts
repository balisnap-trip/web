import { Module } from "@nestjs/common";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";

@Module({
  controllers: [BookingController],
  providers: [BookingService, AdminAuthGuard]
})
export class BookingModule {}
