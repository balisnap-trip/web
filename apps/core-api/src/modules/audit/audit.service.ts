import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

export interface AuditLogRecord {
  eventId: string;
  eventType: string;
  actor: string;
  createdAt: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown> | null;
}

interface AuditCreateInput {
  eventType: string;
  actor: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly maxRecords = 500;
  private readonly records: AuditLogRecord[] = [];

  constructor() {
    this.record({
      eventType: "SYSTEM_BOOTSTRAP",
      actor: "system",
      metadata: {
        source: "core-api"
      }
    });
  }

  record(input: AuditCreateInput): AuditLogRecord {
    const record: AuditLogRecord = {
      eventId: randomUUID(),
      eventType: this.normalizeEventType(input.eventType),
      actor: this.normalizeActor(input.actor),
      createdAt: new Date().toISOString(),
      resourceType: input.resourceType?.trim() || undefined,
      resourceId: input.resourceId?.trim() || undefined,
      metadata: input.metadata ?? null
    };

    this.records.unshift(record);
    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    return record;
  }

  listRecent(limit = 50): AuditLogRecord[] {
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.min(Math.max(Number(limit), 1), this.maxRecords)
      : 50;
    return this.records.slice(0, normalizedLimit);
  }

  private normalizeEventType(value: string): string {
    const normalized = value.trim().toUpperCase();
    return normalized || "UNKNOWN_EVENT";
  }

  private normalizeActor(value: string): string {
    const normalized = value.trim();
    return normalized || "unknown";
  }
}
