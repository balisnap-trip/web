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

interface IngestIdempotencyEntry {
  expiresAtMs: number;
  record: IngestEventRecord;
}

@Injectable()
export class IngestService {
  private readonly byIdempotency = new Map<string, IngestIdempotencyEntry>();
  private readonly byEventId = new Map<string, IngestEventRecord>();
  private readonly idempotencyTtlMs: number;

  constructor() {
    this.idempotencyTtlMs = this.toDays(process.env.INGEST_IDEMPOTENCY_TTL_DAYS, 35);
  }

  createEvent(payload: unknown, idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw new BadRequestException("Missing x-idempotency-key header");
    }

    this.cleanupExpiredIdempotencyKeys();

    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) {
      return {
        record: existing.record,
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

    this.byIdempotency.set(idempotencyKey, {
      record,
      expiresAtMs: Date.now() + this.idempotencyTtlMs
    });
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
    this.byIdempotency.set(updated.idempotencyKey, {
      record: updated,
      expiresAtMs: Date.now() + this.idempotencyTtlMs
    });
    return updated;
  }

  private cleanupExpiredIdempotencyKeys() {
    const now = Date.now();
    for (const [key, entry] of this.byIdempotency.entries()) {
      if (entry.expiresAtMs <= now) {
        this.byIdempotency.delete(key);
      }
    }
  }

  private toDays(input: string | undefined, fallbackDays: number): number {
    const value = Number(input);
    const days = Number.isFinite(value) && value > 0 ? value : fallbackDays;
    return days * 24 * 60 * 60 * 1000;
  }
}
