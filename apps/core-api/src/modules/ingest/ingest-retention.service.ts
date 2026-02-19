import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

interface RetentionCleanupResultRow {
  deleted_ingest_event_log_rows: number;
  deleted_dead_letter_rows: number;
  deleted_unmapped_rows: number;
}

@Injectable()
export class IngestRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestRetentionService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    if (!this.isRetentionEnabled()) {
      this.logger.log("Retention cleanup disabled by feature flag");
      return;
    }

    if (!this.databaseService.isOpsConfigured()) {
      this.logger.warn("Retention cleanup enabled but OPS_DB_URL is missing");
      return;
    }

    if (this.readBool(process.env.INGEST_RETENTION_RUN_ON_START, false)) {
      await this.runCleanup();
    }

    const intervalMs = this.readIntervalMs(process.env.INGEST_RETENTION_INTERVAL_MS, 24 * 60 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, intervalMs);

    this.logger.log(`Retention cleanup scheduler started intervalMs=${intervalMs}`);
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCleanup() {
    const idempotencyTtlDays = this.readPositiveInteger(process.env.INGEST_IDEMPOTENCY_TTL_DAYS, 35);
    const dlqTtlDays = this.readPositiveInteger(process.env.INGEST_DLQ_RETENTION_DAYS, 30);
    const unmappedTtlDays = this.readPositiveInteger(process.env.INGEST_UNMAPPED_RETENTION_DAYS, 90);

    try {
      const result = await this.databaseService.opsQuery<RetentionCleanupResultRow>(
        `
          with deleted_dead_letter as (
            delete from ingest_dead_letter d
            where d.updated_at < now() - ($1::int * interval '1 day')
              and d.status in ('RESOLVED', 'SUCCEEDED', 'CLOSED', 'FAILED')
            returning 1
          ),
          deleted_ingest as (
            delete from ingest_event_log l
            where l.created_at < now() - ($2::int * interval '1 day')
              and l.process_status in ('DONE', 'FAILED')
              and not exists (
                select 1
                from ingest_dead_letter d
                where d.event_key = l.event_key
              )
            returning 1
          ),
          deleted_unmapped as (
            delete from unmapped_queue u
            where u.status in ('RESOLVED', 'CLOSED')
              and u.updated_at < now() - ($3::int * interval '1 day')
            returning 1
          )
          select
            (select count(*) from deleted_ingest)::int as deleted_ingest_event_log_rows,
            (select count(*) from deleted_dead_letter)::int as deleted_dead_letter_rows,
            (select count(*) from deleted_unmapped)::int as deleted_unmapped_rows
        `,
        [dlqTtlDays, idempotencyTtlDays, unmappedTtlDays]
      );

      const row = result.rows[0];
      this.logger.log(
        `Retention cleanup done ingest=${row.deleted_ingest_event_log_rows} dlq=${row.deleted_dead_letter_rows} unmapped=${row.deleted_unmapped_rows}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "retention_cleanup_error";
      this.logger.error(`Retention cleanup failed: ${message}`);
    }
  }

  private isRetentionEnabled(): boolean {
    return this.readBool(process.env.INGEST_RETENTION_ENABLED, true);
  }

  private readBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  private readPositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private readIntervalMs(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 60_000) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
