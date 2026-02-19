import { Injectable, NotFoundException } from "@nestjs/common";

export interface OpsBooking {
  bookingKey: string;
  channelCode: string;
  externalBookingRef: string;
  customerPaymentStatus: string;
  opsFulfillmentStatus: string;
  note?: string;
  meetingPoint?: string;
  assignedDriverId?: number;
}

@Injectable()
export class BookingService {
  private readonly bookings = new Map<string, OpsBooking>([
    [
      "book_demo_001",
      {
        bookingKey: "book_demo_001",
        channelCode: "DIRECT",
        externalBookingRef: "WEB-12345",
        customerPaymentStatus: "PAID",
        opsFulfillmentStatus: "READY",
        note: "Seeded booking for API scaffold",
        meetingPoint: "Hotel Lobby"
      }
    ]
  ]);

  list() {
    return Array.from(this.bookings.values());
  }

  get(id: string): OpsBooking {
    const booking = this.bookings.get(id);
    if (!booking) {
      throw new NotFoundException(`Booking not found: ${id}`);
    }
    return booking;
  }

  patch(
    id: string,
    input: {
      note?: string;
      meetingPoint?: string;
      packageRefType?: string;
      packageRefKey?: string;
    }
  ) {
    const booking = this.get(id);
    const updated: OpsBooking = {
      ...booking,
      note: input.note ?? booking.note,
      meetingPoint: input.meetingPoint ?? booking.meetingPoint
    };
    this.bookings.set(id, updated);

    return {
      booking: updated,
      packageRefType: input.packageRefType ?? null,
      packageRefKey: input.packageRefKey ?? null
    };
  }

  assign(id: string, driverId: number) {
    const booking = this.get(id);
    const updated: OpsBooking = {
      ...booking,
      assignedDriverId: driverId
    };
    this.bookings.set(id, updated);
    return updated;
  }

  syncStatus(id: string) {
    const booking = this.get(id);
    const recomputedStatus =
      booking.assignedDriverId && booking.customerPaymentStatus === "PAID" ? "READY" : "ATTENTION";
    const updated: OpsBooking = {
      ...booking,
      opsFulfillmentStatus: recomputedStatus
    };
    this.bookings.set(id, updated);
    return updated;
  }
}
