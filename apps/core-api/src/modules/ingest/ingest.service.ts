import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DatabaseService } from "../database/database.service";

export type IngestProcessStatus = "RECEIVED" | "PROCESSING" | "DONE" | "FAILED";
export type IngestDeadLetterStatus =
  | "OPEN"
  | "READY"
  | "REPLAYING"
  | "SUCCEEDED"
  | "FAILED"
  | "RESOLVED"
  | "CLOSED";

export interface IngestEventRecord {
  eventId: string;
  idempotencyKey: string;
  processStatus: IngestProcessStatus;
  replayCount: number;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  source: string;
  channelCode: string;
  externalBookingRef: string;
  eventType: string;
  eventTime: string;
  eventTimeNormalized: string;
  nonce: string;
  payloadHash: string;
  errorMessage: string | null;
}

export interface IngestDeadLetterRecord {
  deadLetterKey: string;
  eventId: string;
  status: IngestDeadLetterStatus;
  reasonCode: string;
  reasonDetail: string | null;
  poisonMessage: boolean;
  replayCount: number;
  firstFailedAt: string;
  lastFailedAt: string;
  nextReplayAt: string | null;
  source: string;
  channelCode: string;
  externalBookingRef: string;
  eventType: string;
}

export interface IngestDeadLetterMetrics {
  total: number;
  byStatus: Record<IngestDeadLetterStatus, number>;
}

export interface IngestProcessingFailure {
  retryable: boolean;
  reasonCode: string;
  message: string;
}

interface IngestCreateInput {
  payload: unknown;
  idempotencyKey: string;
  nonce: string;
  payloadHash: string;
  signatureVerified: boolean;
}

interface ParsedPayload {
  source: string;
  channelCode: string;
  externalBookingRef: string;
  eventType: string;
  eventTime: string;
  eventTimeNormalized: string;
}

interface IngestEventRow {
  event_key: string;
  idempotency_key: string;
  process_status: string;
  raw_payload: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  source_enum: string;
  channel_code: string;
  external_booking_ref: string;
  event_type: string;
  event_time: Date | string;
  event_time_normalized: Date | string;
  nonce: string;
  payload_hash: string;
  error_message: string | null;
  replay_count: number | null;
}

interface IngestDeadLetterRow {
  dead_letter_key: string;
  event_key: string;
  status: string;
  reason_code: string;
  reason_detail: string | null;
  poison_message: boolean;
  replay_count: number;
  first_failed_at: Date | string;
  last_failed_at: Date | string;
  next_replay_at: Date | string | null;
  source_enum: string;
  channel_code: string;
  external_booking_ref: string;
  event_type: string;
}

@Injectable()
export class IngestService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createEvent(input: IngestCreateInput) {
    const parsedPayload = this.parsePayload(input.payload);
    const existingByIdempotency = await this.findByIdempotency(input.idempotencyKey);
    if (existingByIdempotency) {
      return {
        record: existingByIdempotency,
        idempotentReplay: true
      };
    }

    const existingBySecondaryDedup = await this.findBySecondaryDedup(parsedPayload);
    if (existingBySecondaryDedup) {
      return {
        record: existingBySecondaryDedup,
        idempotentReplay: true
      };
    }

    const eventKey = randomUUID();
    try {
      const result = await this.databaseService.opsQuery<IngestEventRow>(
        `
          insert into ingest_event_log (
            event_key,
            idempotency_key,
            nonce,
            source_enum,
            channel_code,
            external_booking_ref,
            event_type,
            event_time,
            event_time_normalized,
            payload_hash,
            signature_verified,
            process_status,
            attempt_count,
            request_received_at,
            raw_payload,
            created_at
          ) values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::timestamptz,
            $9::timestamptz,
            $10,
            $11,
            'RECEIVED',
            0,
            now(),
            $12::jsonb,
            now()
          )
          returning
            event_key,
            idempotency_key,
            process_status,
            raw_payload,
            created_at,
            coalesce(processed_at, request_received_at, created_at) as updated_at,
            source_enum,
            channel_code,
            external_booking_ref,
            event_type,
            event_time,
            event_time_normalized,
            nonce,
            payload_hash,
            error_message,
            0::int as replay_count
        `,
        [
          eventKey,
          input.idempotencyKey,
          input.nonce,
          parsedPayload.source,
          parsedPayload.channelCode,
          parsedPayload.externalBookingRef,
          parsedPayload.eventType,
          parsedPayload.eventTime,
          parsedPayload.eventTimeNormalized,
          input.payloadHash,
          input.signatureVerified,
          JSON.stringify(input.payload ?? {})
        ]
      );

      return {
        record: this.mapRow(result.rows[0]),
        idempotentReplay: false
      };
    } catch (error) {
      this.rethrowIfIngestSchemaMissing(error);

      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;

      if (pgErrorCode === "23505") {
        const existingAfterRace = await this.findByIdempotency(input.idempotencyKey);
        if (existingAfterRace) {
          return {
            record: existingAfterRace,
            idempotentReplay: true
          };
        }
      }
      if (pgErrorCode === "23503") {
        throw new BadRequestException("CHANNEL_NOT_REGISTERED");
      }

      throw new ServiceUnavailableException("INGEST_INSERT_FAILED");
    }
  }

  async getEvent(eventId: string): Promise<IngestEventRecord> {
    const result = await this.databaseService.opsQuery<IngestEventRow>(
      `
        select
          i.event_key,
          i.idempotency_key,
          i.process_status,
          i.raw_payload,
          i.created_at,
          coalesce(i.processed_at, i.request_received_at, i.created_at) as updated_at,
          i.source_enum,
          i.channel_code,
          i.external_booking_ref,
          i.event_type,
          i.event_time,
          i.event_time_normalized,
          i.nonce,
          i.payload_hash,
          i.error_message,
          coalesce(d.replay_count, 0) as replay_count
        from ingest_event_log i
        left join lateral (
          select replay_count
          from ingest_dead_letter
          where event_key = i.event_key
          order by updated_at desc
          limit 1
        ) d on true
        where i.event_key = $1
      `,
      [eventId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Ingest event not found: ${eventId}`);
    }
    return this.mapRow(result.rows[0]);
  }

  async replayEvent(eventId: string): Promise<IngestEventRecord> {
    const replayed = await this.databaseService.withOpsTransaction(async (client) => {
      const eventResult = await client.query<IngestEventRow>(
        `
          select
            event_key,
            idempotency_key,
            process_status,
            raw_payload,
            created_at,
            coalesce(processed_at, request_received_at, created_at) as updated_at,
            source_enum,
            channel_code,
            external_booking_ref,
            event_type,
            event_time,
            event_time_normalized,
            nonce,
            payload_hash,
            error_message,
            0::int as replay_count
          from ingest_event_log
          where event_key = $1
          for update
        `,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundException(`Ingest event not found: ${eventId}`);
      }

      const deadLetterResult = await client.query<{
        dead_letter_key: string;
        replay_count: number;
        status: string;
      }>(
        `
          select dead_letter_key, replay_count, status
          from ingest_dead_letter
          where event_key = $1
          order by updated_at desc
          limit 1
          for update
        `,
        [eventId]
      );

      if (deadLetterResult.rows.length === 0) {
        throw new ConflictException("EVENT_NOT_IN_DEAD_LETTER");
      }

      const deadLetter = deadLetterResult.rows[0];
      if (deadLetter.status !== "READY") {
        throw new ConflictException(`DEAD_LETTER_NOT_READY_FOR_REPLAY:${deadLetter.status}`);
      }

      await client.query(
        `
          update ingest_dead_letter
          set replay_count = replay_count + 1,
              status = 'REPLAYING',
              next_replay_at = null,
              updated_at = now()
          where dead_letter_key = $1
        `,
        [deadLetter.dead_letter_key]
      );

      const updated = await client.query<IngestEventRow>(
        `
          update ingest_event_log
          set process_status = 'RECEIVED',
              attempt_count = attempt_count + 1,
              next_retry_at = null,
              error_message = null
          where event_key = $1
          returning
            event_key,
            idempotency_key,
            process_status,
            raw_payload,
            created_at,
            coalesce(processed_at, request_received_at, created_at) as updated_at,
            source_enum,
            channel_code,
            external_booking_ref,
            event_type,
            event_time,
            event_time_normalized,
            nonce,
            payload_hash,
            error_message,
            $2::int as replay_count
        `,
        [eventId, deadLetter.replay_count + 1]
      );

      return this.mapRow(updated.rows[0]);
    });

    return replayed;
  }

  async markProcessingAttempt(eventId: string, attemptNumber: number) {
    await this.databaseService.opsQuery(
      `
        update ingest_event_log
        set process_status = 'PROCESSING',
            attempt_count = greatest(attempt_count, $2),
            error_message = null
        where event_key = $1
      `,
      [eventId, attemptNumber]
    );
  }

  async markRetryableFailure(input: {
    eventId: string;
    errorMessage: string;
    nextRetryAt: string;
  }) {
    await this.databaseService.opsQuery(
      `
        update ingest_event_log
        set process_status = 'FAILED',
            error_message = $2,
            next_retry_at = $3::timestamptz
        where event_key = $1
      `,
      [input.eventId, input.errorMessage, input.nextRetryAt]
    );
  }

  async markDone(eventId: string) {
    await this.databaseService.opsQuery(
      `
        update ingest_event_log
        set process_status = 'DONE',
            processed_at = now(),
            error_message = null,
            next_retry_at = null
        where event_key = $1
      `,
      [eventId]
    );
  }

  async markReplaySucceeded(eventId: string) {
    await this.databaseService.opsQuery(
      `
        update ingest_dead_letter
        set status = 'SUCCEEDED',
            next_replay_at = null,
            updated_at = now()
        where dead_letter_key = (
          select dead_letter_key
          from ingest_dead_letter
          where event_key = $1
          order by updated_at desc
          limit 1
        )
          and status = 'REPLAYING'
      `,
      [eventId]
    );
  }

  async processEvent(eventId: string): Promise<void> {
    const event = await this.getEvent(eventId);
    const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};

    const simulatedError = this.readOptionalString(payload._simulateProcessingError);
    if (simulatedError === "NON_RETRYABLE") {
      throw new BadRequestException("SCHEMA_MISMATCH");
    }
    if (simulatedError === "RETRYABLE") {
      throw new Error("TRANSIENT_RUNTIME_FAILURE");
    }

    await this.markDone(eventId);
  }

  classifyProcessingError(error: unknown): IngestProcessingFailure {
    if (error instanceof BadRequestException || error instanceof ConflictException) {
      return {
        retryable: false,
        reasonCode: "SCHEMA_MISMATCH",
        message: this.readErrorMessage(error, "NON_RETRYABLE_PROCESSING_ERROR")
      };
    }

    if (error instanceof NotFoundException) {
      return {
        retryable: false,
        reasonCode: "EVENT_NOT_FOUND",
        message: this.readErrorMessage(error, "EVENT_NOT_FOUND")
      };
    }

    if (error instanceof ServiceUnavailableException) {
      return {
        retryable: true,
        reasonCode: "INFRA_UNAVAILABLE",
        message: this.readErrorMessage(error, "SERVICE_UNAVAILABLE")
      };
    }

    return {
      retryable: true,
      reasonCode: "TRANSIENT_ERROR",
      message: this.readErrorMessage(error, "UNCLASSIFIED_ERROR")
    };
  }

  async markEventFailed(input: {
    eventId: string;
    reasonCode: string;
    reasonDetail?: string;
    poisonMessage?: boolean;
  }): Promise<IngestDeadLetterRecord> {
    const { eventId, reasonCode } = input;
    const normalizedReasonCode = this.readString(reasonCode, "reasonCode").toUpperCase();
    const reasonDetail = input.reasonDetail ?? null;
    const poisonMessage = input.poisonMessage ?? false;

    const result = await this.databaseService.withOpsTransaction(async (client) => {
      const event = await client.query<IngestEventRow>(
        `
          select
            event_key,
            source_enum,
            channel_code,
            external_booking_ref,
            event_type
          from ingest_event_log
          where event_key = $1
          for update
        `,
        [eventId]
      );

      if (event.rows.length === 0) {
        throw new NotFoundException(`Ingest event not found: ${eventId}`);
      }

      await client.query(
        `
          update ingest_event_log
          set process_status = 'FAILED',
              error_message = $2,
              processed_at = now(),
              next_retry_at = null
          where event_key = $1
        `,
        [eventId, reasonDetail ?? normalizedReasonCode]
      );

      const existingDeadLetter = await client.query<{
        dead_letter_key: string;
        replay_count: number;
        status: string;
      }>(
        `
          select dead_letter_key, replay_count, status
          from ingest_dead_letter
          where event_key = $1
          order by updated_at desc
          limit 1
          for update
        `,
        [eventId]
      );

      if (existingDeadLetter.rows.length === 0) {
        const deadLetterKey = randomUUID();
        const inserted = await client.query<{ dead_letter_key: string }>(
          `
            insert into ingest_dead_letter (
              dead_letter_key,
              event_key,
              reason_code,
              reason_detail,
              poison_message,
              replay_count,
              status,
              first_failed_at,
              last_failed_at,
              raw_payload,
              created_at,
              updated_at
            )
            select
              $1,
              i.event_key,
              $2,
              $3,
              $4,
              0,
              'OPEN',
              now(),
              now(),
              i.raw_payload,
              now(),
              now()
            from ingest_event_log i
            where i.event_key = $5
            returning dead_letter_key
          `,
          [deadLetterKey, normalizedReasonCode, reasonDetail, poisonMessage, eventId]
        );

        return inserted.rows[0].dead_letter_key;
      }

      const targetStatus = existingDeadLetter.rows[0].status === "REPLAYING" ? "FAILED" : "OPEN";
      const updated = await client.query<{ dead_letter_key: string }>(
        `
          update ingest_dead_letter
          set reason_code = $2,
              reason_detail = $3,
              poison_message = $4,
              status = $5,
              next_replay_at = null,
              last_failed_at = now(),
              updated_at = now()
          where dead_letter_key = $1
          returning dead_letter_key
        `,
        [
          existingDeadLetter.rows[0].dead_letter_key,
          normalizedReasonCode,
          reasonDetail,
          poisonMessage,
          targetStatus
        ]
      );

      return updated.rows[0].dead_letter_key;
    });

    return this.getDeadLetter(result);
  }

  async listDeadLetters(input: {
    status?: IngestDeadLetterStatus;
    limit?: number;
  }): Promise<IngestDeadLetterRecord[]> {
    const limit = Number.isFinite(Number(input.limit)) ? Math.min(Math.max(Number(input.limit), 1), 200) : 50;

    const values: unknown[] = [];
    let whereClause = "";
    if (input.status) {
      values.push(this.ensureDeadLetterStatus(input.status));
      whereClause = `where d.status = $${values.length}`;
    }
    values.push(limit);

    const result = await this.databaseService.opsQuery<IngestDeadLetterRow>(
      `
        select
          d.dead_letter_key,
          d.event_key,
          d.status,
          d.reason_code,
          d.reason_detail,
          d.poison_message,
          d.replay_count,
          d.first_failed_at,
          d.last_failed_at,
          d.next_replay_at,
          i.source_enum,
          i.channel_code,
          i.external_booking_ref,
          i.event_type
        from ingest_dead_letter d
        join ingest_event_log i on i.event_key = d.event_key
        ${whereClause}
        order by d.last_failed_at desc
        limit $${values.length}
      `,
      values
    );

    return result.rows.map((row) => this.mapDeadLetterRow(row));
  }

  async getDeadLetter(deadLetterKey: string): Promise<IngestDeadLetterRecord> {
    const result = await this.databaseService.opsQuery<IngestDeadLetterRow>(
      `
        select
          d.dead_letter_key,
          d.event_key,
          d.status,
          d.reason_code,
          d.reason_detail,
          d.poison_message,
          d.replay_count,
          d.first_failed_at,
          d.last_failed_at,
          d.next_replay_at,
          i.source_enum,
          i.channel_code,
          i.external_booking_ref,
          i.event_type
        from ingest_dead_letter d
        join ingest_event_log i on i.event_key = d.event_key
        where d.dead_letter_key = $1
        limit 1
      `,
      [deadLetterKey]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Dead letter not found: ${deadLetterKey}`);
    }
    return this.mapDeadLetterRow(result.rows[0]);
  }

  async getDeadLetterMetrics(): Promise<IngestDeadLetterMetrics> {
    const byStatus: Record<IngestDeadLetterStatus, number> = {
      OPEN: 0,
      READY: 0,
      REPLAYING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      RESOLVED: 0,
      CLOSED: 0
    };

    const result = await this.databaseService.opsQuery<{ status: string; count: number | string }>(
      `
        select status, count(*)::int as count
        from ingest_dead_letter
        group by status
      `
    );

    for (const row of result.rows) {
      const status = this.mapDeadLetterStatus(row.status);
      byStatus[status] = Number(row.count ?? 0);
    }

    const total = Object.values(byStatus).reduce((acc, value) => acc + value, 0);
    return {
      total,
      byStatus
    };
  }

  async updateDeadLetterStatus(input: {
    deadLetterKey: string;
    toStatus: IngestDeadLetterStatus;
  }): Promise<IngestDeadLetterRecord> {
    const targetStatus = this.ensureDeadLetterStatus(input.toStatus);
    const updated = await this.databaseService.withOpsTransaction(async (client) => {
      const current = await client.query<{ status: string }>(
        `
          select status
          from ingest_dead_letter
          where dead_letter_key = $1
          for update
        `,
        [input.deadLetterKey]
      );

      if (current.rows.length === 0) {
        throw new NotFoundException(`Dead letter not found: ${input.deadLetterKey}`);
      }

      const fromStatus = current.rows[0].status as IngestDeadLetterStatus;
      if (!this.canTransitionDeadLetterStatus(fromStatus, targetStatus)) {
        throw new ConflictException(`INVALID_DEAD_LETTER_TRANSITION:${fromStatus}->${targetStatus}`);
      }

      await client.query(
        `
          update ingest_dead_letter
          set status = $2,
              updated_at = now(),
              next_replay_at = case
                when $2 = 'READY' then now()
                else next_replay_at
              end
          where dead_letter_key = $1
        `,
        [input.deadLetterKey, targetStatus]
      );

      return input.deadLetterKey;
    });

    return this.getDeadLetter(updated);
  }

  private async findByIdempotency(idempotencyKey: string): Promise<IngestEventRecord | null> {
    try {
      const result = await this.databaseService.opsQuery<IngestEventRow>(
        `
          select
            i.event_key,
            i.idempotency_key,
            i.process_status,
            i.raw_payload,
            i.created_at,
            coalesce(i.processed_at, i.request_received_at, i.created_at) as updated_at,
            i.source_enum,
            i.channel_code,
            i.external_booking_ref,
            i.event_type,
            i.event_time,
            i.event_time_normalized,
            i.nonce,
            i.payload_hash,
            i.error_message,
            coalesce(d.replay_count, 0) as replay_count
          from ingest_event_log i
          left join lateral (
            select replay_count
            from ingest_dead_letter
            where event_key = i.event_key
            order by updated_at desc
            limit 1
          ) d on true
          where i.idempotency_key = $1
          limit 1
        `,
        [idempotencyKey]
      );

      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.rethrowIfIngestSchemaMissing(error);
      throw new ServiceUnavailableException("INGEST_LOOKUP_FAILED");
    }
  }

  private async findBySecondaryDedup(payload: ParsedPayload): Promise<IngestEventRecord | null> {
    try {
      const result = await this.databaseService.opsQuery<IngestEventRow>(
        `
          select
            i.event_key,
            i.idempotency_key,
            i.process_status,
            i.raw_payload,
            i.created_at,
            coalesce(i.processed_at, i.request_received_at, i.created_at) as updated_at,
            i.source_enum,
            i.channel_code,
            i.external_booking_ref,
            i.event_type,
            i.event_time,
            i.event_time_normalized,
            i.nonce,
            i.payload_hash,
            i.error_message,
            coalesce(d.replay_count, 0) as replay_count
          from ingest_event_log i
          left join lateral (
            select replay_count
            from ingest_dead_letter
            where event_key = i.event_key
            order by updated_at desc
            limit 1
          ) d on true
          where i.source_enum = $1
            and i.external_booking_ref = $2
            and i.event_type = $3
            and i.event_time_normalized = $4::timestamptz
          limit 1
        `,
        [
          payload.source,
          payload.externalBookingRef,
          payload.eventType,
          payload.eventTimeNormalized
        ]
      );

      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.rethrowIfIngestSchemaMissing(error);
      throw new ServiceUnavailableException("INGEST_SECONDARY_DEDUP_LOOKUP_FAILED");
    }
  }

  private parsePayload(payload: unknown): ParsedPayload {
    if (!payload || typeof payload !== "object") {
      throw new BadRequestException("INVALID_INGEST_PAYLOAD");
    }

    const row = payload as Record<string, unknown>;

    const payloadVersion = this.readString(row.payloadVersion, "payloadVersion").toLowerCase();
    const source = this.readString(row.source, "source").toUpperCase();
    const eventType = this.readString(row.eventType, "eventType").toUpperCase();
    const externalBookingRef = this.readString(row.externalBookingRef, "externalBookingRef");
    const eventTime = this.readString(row.eventTime, "eventTime");
    const normalizedEventTime = this.normalizeEventTime(eventTime);

    if (!["DIRECT", "GYG", "VIATOR", "BOKUN", "TRIPDOTCOM", "MANUAL"].includes(source)) {
      throw new BadRequestException(`UNSUPPORTED_SOURCE:${source}`);
    }

    if (payloadVersion !== "v1") {
      throw new BadRequestException(`UNSUPPORTED_PAYLOAD_VERSION:${payloadVersion}`);
    }

    if (!["CREATED", "UPDATED", "CANCELLED"].includes(eventType)) {
      throw new BadRequestException(`UNSUPPORTED_EVENT_TYPE:${eventType}`);
    }

    return {
      source,
      channelCode: source,
      externalBookingRef,
      eventType,
      eventTime,
      eventTimeNormalized: normalizedEventTime
    };
  }

  private normalizeEventTime(eventTime: string): string {
    const parsed = new Date(eventTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("INVALID_EVENT_TIME");
    }
    parsed.setMilliseconds(0);
    return parsed.toISOString();
  }

  private readString(value: unknown, fieldName: string): string {
    if (typeof value !== "string") {
      throw new BadRequestException(`INVALID_FIELD_${fieldName.toUpperCase()}`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`EMPTY_FIELD_${fieldName.toUpperCase()}`);
    }
    return trimmed;
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim().toUpperCase();
    return trimmed || null;
  }

  private readErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private mapRow(row: IngestEventRow): IngestEventRecord {
    return {
      eventId: row.event_key,
      idempotencyKey: row.idempotency_key,
      processStatus: this.mapStatus(row.process_status),
      replayCount: Number(row.replay_count ?? 0),
      payload: row.raw_payload,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      source: row.source_enum,
      channelCode: row.channel_code,
      externalBookingRef: row.external_booking_ref,
      eventType: row.event_type,
      eventTime: new Date(row.event_time).toISOString(),
      eventTimeNormalized: new Date(row.event_time_normalized).toISOString(),
      nonce: row.nonce,
      payloadHash: row.payload_hash,
      errorMessage: row.error_message
    };
  }

  private mapStatus(rawStatus: string): IngestProcessStatus {
    if (rawStatus === "RECEIVED" || rawStatus === "PROCESSING" || rawStatus === "DONE" || rawStatus === "FAILED") {
      return rawStatus;
    }
    return "FAILED";
  }

  private mapDeadLetterRow(row: IngestDeadLetterRow): IngestDeadLetterRecord {
    return {
      deadLetterKey: row.dead_letter_key,
      eventId: row.event_key,
      status: this.mapDeadLetterStatus(row.status),
      reasonCode: row.reason_code,
      reasonDetail: row.reason_detail,
      poisonMessage: row.poison_message,
      replayCount: Number(row.replay_count),
      firstFailedAt: new Date(row.first_failed_at).toISOString(),
      lastFailedAt: new Date(row.last_failed_at).toISOString(),
      nextReplayAt: row.next_replay_at ? new Date(row.next_replay_at).toISOString() : null,
      source: row.source_enum,
      channelCode: row.channel_code,
      externalBookingRef: row.external_booking_ref,
      eventType: row.event_type
    };
  }

  private mapDeadLetterStatus(rawStatus: string): IngestDeadLetterStatus {
    if (
      rawStatus === "OPEN" ||
      rawStatus === "READY" ||
      rawStatus === "REPLAYING" ||
      rawStatus === "SUCCEEDED" ||
      rawStatus === "FAILED" ||
      rawStatus === "RESOLVED" ||
      rawStatus === "CLOSED"
    ) {
      return rawStatus;
    }
    return "OPEN";
  }

  private canTransitionDeadLetterStatus(
    fromStatus: IngestDeadLetterStatus,
    toStatus: IngestDeadLetterStatus
  ): boolean {
    const transitions: Record<IngestDeadLetterStatus, IngestDeadLetterStatus[]> = {
      OPEN: ["READY", "RESOLVED", "CLOSED"],
      READY: ["REPLAYING"],
      REPLAYING: ["SUCCEEDED", "FAILED", "READY"],
      FAILED: ["READY", "RESOLVED", "CLOSED"],
      SUCCEEDED: ["CLOSED"],
      RESOLVED: ["CLOSED"],
      CLOSED: []
    };

    return transitions[fromStatus].includes(toStatus);
  }

  private ensureDeadLetterStatus(status: string): IngestDeadLetterStatus {
    const normalized = status.trim().toUpperCase();
    if (
      normalized === "OPEN" ||
      normalized === "READY" ||
      normalized === "REPLAYING" ||
      normalized === "SUCCEEDED" ||
      normalized === "FAILED" ||
      normalized === "RESOLVED" ||
      normalized === "CLOSED"
    ) {
      return normalized;
    }
    throw new BadRequestException(`INVALID_DEAD_LETTER_STATUS:${status}`);
  }

  private rethrowIfIngestSchemaMissing(error: unknown) {
    const pgErrorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;

    if (pgErrorCode === "42P01") {
      throw new ServiceUnavailableException("INGEST_SCHEMA_NOT_READY");
    }
  }
}
