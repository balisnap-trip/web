import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { RequireAdminRoles } from "../../common/auth/admin-auth.decorator";
import { AdminAuthGuard } from "../../common/auth/admin-auth.guard";
import { successEnvelope } from "../../common/http/envelope";
import { BookingService } from "./booking.service";

@ApiTags("ops-bookings")
@ApiBearerAuth()
@ApiHeader({ name: "x-admin-role", description: "Admin role (ADMIN/STAFF/MANAGER)", required: true })
@UseGuards(AdminAuthGuard)
@RequireAdminRoles("ADMIN", "STAFF", "MANAGER")
@Controller("v1/ops/bookings")
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @ApiOperation({ summary: "List ops bookings" })
  list() {
    return successEnvelope(this.bookingService.list());
  }

  @Get(":id")
  @ApiOperation({ summary: "Get ops booking detail" })
  @ApiParam({ name: "id", example: "book_demo_001" })
  get(@Param("id") id: string) {
    return successEnvelope(this.bookingService.get(id));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Patch editable booking fields" })
  @ApiParam({ name: "id", example: "book_demo_001" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  patch(
    @Param("id") id: string,
    @Body()
    body: {
      note?: string;
      meetingPoint?: string;
      packageRefType?: string;
      packageRefKey?: string;
    }
  ) {
    return successEnvelope(this.bookingService.patch(id, body));
  }

  @Post(":id/assign")
  @ApiOperation({ summary: "Assign driver to booking" })
  @ApiParam({ name: "id", example: "book_demo_001" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  assign(
    @Param("id") id: string,
    @Body() body: { driverId: number }
  ) {
    return successEnvelope(this.bookingService.assign(id, body.driverId));
  }

  @Post(":id/unassign")
  @ApiOperation({ summary: "Unassign driver from booking" })
  @ApiParam({ name: "id", example: "book_demo_001" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  unassign(@Param("id") id: string) {
    return successEnvelope(this.bookingService.unassign(id));
  }

  @Post(":id/status/sync")
  @ApiOperation({ summary: "Recompute booking fulfillment status" })
  @ApiParam({ name: "id", example: "book_demo_001" })
  @RequireAdminRoles("ADMIN", "MANAGER")
  syncStatus(@Param("id") id: string) {
    return successEnvelope(this.bookingService.syncStatus(id));
  }
}
