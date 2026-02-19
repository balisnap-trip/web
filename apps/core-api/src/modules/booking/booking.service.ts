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

  get(idOrExternalRef: string): OpsBooking {
    const booking = this.findByKeyOrExternalRef(idOrExternalRef);
    if (!booking) {
      throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
    }
    return booking;
  }

  patch(
    idOrExternalRef: string,
    input: {
      note?: string;
      meetingPoint?: string;
      packageRefType?: string;
      packageRefKey?: string;
    }
  ) {
    const booking = this.get(idOrExternalRef);
    const updated: OpsBooking = {
      ...booking,
      note: input.note ?? booking.note,
      meetingPoint: input.meetingPoint ?? booking.meetingPoint
    };
    this.bookings.set(updated.bookingKey, updated);

    return {
      booking: updated,
      packageRefType: input.packageRefType ?? null,
      packageRefKey: input.packageRefKey ?? null
    };
  }

  assign(idOrExternalRef: string, driverId: number) {
    const booking = this.get(idOrExternalRef);
    const updated: OpsBooking = {
      ...booking,
      assignedDriverId: driverId
    };
    this.bookings.set(updated.bookingKey, updated);
    return updated;
  }

  unassign(idOrExternalRef: string) {
    const booking = this.get(idOrExternalRef);
    const updated: OpsBooking = {
      ...booking,
      assignedDriverId: undefined
    };
    this.bookings.set(updated.bookingKey, updated);
    return updated;
  }

  syncStatus(idOrExternalRef: string) {
    const booking = this.get(idOrExternalRef);
    const recomputedStatus =
      booking.assignedDriverId && booking.customerPaymentStatus === "PAID" ? "READY" : "ATTENTION";
    const updated: OpsBooking = {
      ...booking,
      opsFulfillmentStatus: recomputedStatus
    };
    this.bookings.set(updated.bookingKey, updated);
    return updated;
  }

  private findByKeyOrExternalRef(idOrExternalRef: string): OpsBooking | null {
    const normalized = idOrExternalRef.trim();
    if (!normalized) {
      return null;
    }

    const byKey = this.bookings.get(normalized);
    if (byKey) {
      return byKey;
    }

    return (
      this.list().find(
        (booking) =>
          booking.externalBookingRef.toUpperCase() === normalized.toUpperCase()
      ) ?? null
    );
  }
}
