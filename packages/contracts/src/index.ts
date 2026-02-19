export type BookingEventType = "CREATED" | "UPDATED" | "CANCELLED";

export type IngestionSource =
  | "DIRECT"
  | "GYG"
  | "VIATOR"
  | "BOKUN"
  | "TRIPDOTCOM"
  | "MANUAL";

export interface BookingIngestEventV1 {
  payloadVersion: "v1";
  eventType: BookingEventType;
  eventTime: string;
  source: IngestionSource;
  externalBookingRef: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  booking: {
    tourDate: string;
    tourTime?: string;
    adult: number;
    child: number;
    currency: string;
    totalPrice: number;
    pickupLocation?: string;
    meetingPoint?: string;
    note?: string;
  };
  raw: {
    providerPayload: unknown;
  };
}

export interface IngestionSecurityHeaders {
  authorization: string;
  "x-signature": string;
  "x-signature-algorithm": "HMAC-SHA256";
  "x-timestamp": string;
  "x-nonce": string;
  "x-idempotency-key": string;
}
