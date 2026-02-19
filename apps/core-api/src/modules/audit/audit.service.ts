import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";

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
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  private readonly maxRecords = 500;
  private readonly records: AuditLogRecord[] = [];
  private readonly persistenceEnabled = this.readBoolean(process.env.AUDIT_PERSISTENCE_ENABLED, true);
  private readonly persistencePath = path.resolve(
    process.cwd(),
    process.env.AUDIT_LOG_PATH || "reports/audit/audit-events.ndjson"
  );
  private persistenceWriteQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.record({
      eventType: "SYSTEM_BOOTSTRAP",
      actor: "system",
      metadata: {
        source: "core-api"
      }
    });
  }

  async onModuleInit() {
    if (!this.persistenceEnabled) {
      return;
    }

    try {
      const content = await readFile(this.persistencePath, "utf8");
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const recovered = lines
        .slice(-this.maxRecords)
        .map((line) => {
          try {
            return JSON.parse(line) as AuditLogRecord;
          } catch {
            return null;
          }
        })
        .filter((row): row is AuditLogRecord => row !== null)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      this.records.length = 0;
      this.records.push(...recovered.slice(0, this.maxRecords));
      this.logger.log(`Recovered ${this.records.length} audit event(s) from persistence`);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code === "ENOENT") {
        return;
      }
      this.logger.warn(
        `Audit persistence recovery failed: ${error instanceof Error ? error.message : "UNKNOWN_ERROR"}`
      );
    }
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

    if (this.persistenceEnabled) {
      this.enqueuePersistence(record);
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

  private readBoolean(rawValue: string | undefined, fallback: boolean): boolean {
    if (rawValue === undefined) {
      return fallback;
    }
    const normalized = rawValue.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  private enqueuePersistence(record: AuditLogRecord) {
    this.persistenceWriteQueue = this.persistenceWriteQueue
      .then(async () => {
        await mkdir(path.dirname(this.persistencePath), { recursive: true });
        await appendFile(this.persistencePath, `${JSON.stringify(record)}\n`, "utf8");
      })
      .catch((error) => {
        this.logger.warn(
          `Audit persistence write failed: ${error instanceof Error ? error.message : "UNKNOWN_ERROR"}`
        );
      });
  }
}
