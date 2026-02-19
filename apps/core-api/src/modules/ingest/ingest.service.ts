import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";

export type IngestProcessStatus = "RECEIVED" | "PROCESSING" | "DONE" | "FAILED";

export interface IngestEventRecord {
  eventId: string;
  idempotencyKey: string;
  processStatus: IngestProcessStatus;
  replayCount: number;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class IngestService {
  private readonly byIdempotency = new Map<string, IngestEventRecord>();
  private readonly byEventId = new Map<string, IngestEventRecord>();

  createEvent(payload: unknown, idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw new BadRequestException("Missing x-idempotency-key header");
    }

    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) {
      return {
        record: existing,
        idempotentReplay: true
      };
    }

    const now = new Date().toISOString();
    const record: IngestEventRecord = {
      eventId: randomUUID(),
      idempotencyKey,
      processStatus: "RECEIVED",
      replayCount: 0,
      payload,
      createdAt: now,
      updatedAt: now
    };

    this.byIdempotency.set(idempotencyKey, record);
    this.byEventId.set(record.eventId, record);

    return {
      record,
      idempotentReplay: false
    };
  }

  getEvent(eventId: string): IngestEventRecord {
    const event = this.byEventId.get(eventId);
    if (!event) {
      throw new NotFoundException(`Ingest event not found: ${eventId}`);
    }
    return event;
  }

  replayEvent(eventId: string) {
    const event = this.getEvent(eventId);
    const now = new Date().toISOString();
    const updated: IngestEventRecord = {
      ...event,
      processStatus: "RECEIVED",
      replayCount: event.replayCount + 1,
      updatedAt: now
    };

    this.byEventId.set(eventId, updated);
    this.byIdempotency.set(updated.idempotencyKey, updated);
    return updated;
  }
}
