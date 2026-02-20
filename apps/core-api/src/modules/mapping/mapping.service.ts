import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DatabaseService } from "../database/database.service";

export type MappingStatus = "UNMAPPED" | "MAPPED" | "REVIEW_REQUIRED";
export type UnmappedStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";

export interface ChannelMappingRecord {
  mappingId: string;
  entityType: string;
  channelCode: string;
  externalRefKind: string;
  externalRef: string;
  entityKey: string;
  mappingStatus: MappingStatus;
}

export interface UnmappedRecord {
  queueId: string;
  queueType: string;
  channelCode: string | null;
  sourceSystem: string;
  sourceTable: string;
  sourcePk: string;
  reasonCode: string;
  reasonDetail: string | null;
  status: UnmappedStatus;
}

interface MappingRow {
  external_ref_key: string;
  entity_type: string;
  channel_code: string;
  external_ref_kind: string;
  external_ref: string;
  entity_key: string;
  queue_status: string | null;
}

interface UnmappedRow {
  queue_key: string;
  queue_type: string;
  channel_code: string | null;
  source_system: string;
  source_table: string;
  source_pk: string;
  reason_code: string;
  reason_detail: string | null;
  status: string;
}

@Injectable()
export class MappingService {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(input?: {
    channelCode?: string;
    entityType?: string;
    limit?: number;
  }): Promise<ChannelMappingRecord[]> {
    const values: unknown[] = [];
    const filters: string[] = [];

    if (input?.channelCode) {
      values.push(input.channelCode.trim().toUpperCase());
      filters.push(`c.channel_code = $${values.length}`);
    }
    if (input?.entityType) {
      values.push(input.entityType.trim().toUpperCase());
      filters.push(`c.entity_type = $${values.length}`);
    }

    const limit = Math.min(Math.max(Math.trunc(Number(input?.limit) || 100), 1), 200);
    values.push(limit);
    const limitParam = `$${values.length}`;
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

    try {
      const result = await this.databaseService.opsQuery<MappingRow>(
        `
          select
            c.external_ref_key,
            c.entity_type,
            c.channel_code,
            c.external_ref_kind,
            c.external_ref,
            c.entity_key,
            q.status as queue_status
          from channel_external_refs c
          left join lateral (
            select u.status
            from unmapped_queue u
            where u.queue_type = 'CHANNEL_MAPPING'
              and u.source_table = 'channel_external_refs'
              and u.source_pk = c.external_ref_key::text
              and u.status in ('OPEN', 'IN_REVIEW')
            order by u.updated_at desc
            limit 1
          ) q on true
          ${whereClause}
          order by c.updated_at desc, c.created_at desc
          limit ${limitParam}
        `,
        values
      );
      return result.rows.map((row) => ({
        mappingId: row.external_ref_key,
        entityType: row.entity_type,
        channelCode: row.channel_code,
        externalRefKind: row.external_ref_kind,
        externalRef: row.external_ref,
        entityKey: row.entity_key,
        mappingStatus: this.mapMappingStatus(row.queue_status)
      }));
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async create(
    input: Omit<ChannelMappingRecord, "mappingId"> & {
      sourceSystem?: string;
      sourceTable?: string;
      sourcePk?: string;
      reasonCode?: string;
    }
  ): Promise<ChannelMappingRecord> {
    const entityType = this.readRequired(input.entityType, "entityType").toUpperCase();
    const channelCode = this.readRequired(input.channelCode, "channelCode").toUpperCase();
    const externalRefKind = this.readRequired(input.externalRefKind, "externalRefKind").toUpperCase();
    const externalRef = this.readRequired(input.externalRef, "externalRef");
    const entityKey = this.readRequired(input.entityKey, "entityKey");
    const sourceSystem = (input.sourceSystem || "manual").trim();
    const sourceTable = (input.sourceTable || "manual_mapping").trim();
    const sourcePk = (input.sourcePk || `${entityType}:${externalRef}`).trim();
    const mappingStatus = input.mappingStatus || "MAPPED";
    const reasonCode = (input.reasonCode || "MANUAL_REVIEW").trim().toUpperCase();

    try {
      const result = await this.databaseService.opsQuery<{
        external_ref_key: string;
        entity_type: string;
        channel_code: string;
        external_ref_kind: string;
        external_ref: string;
        entity_key: string;
      }>(
        `
          insert into channel_external_refs (
            external_ref_key,
            entity_type,
            entity_key,
            channel_code,
            external_ref_kind,
            external_ref,
            source_system,
            source_table,
            source_pk
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
          on conflict (entity_type, channel_code, external_ref_kind, external_ref)
          do update set
            entity_key = excluded.entity_key,
            source_system = excluded.source_system,
            source_table = excluded.source_table,
            source_pk = excluded.source_pk,
            updated_at = now()
          returning
            external_ref_key,
            entity_type,
            channel_code,
            external_ref_kind,
            external_ref,
            entity_key
        `,
        [randomUUID(), entityType, entityKey, channelCode, externalRefKind, externalRef, sourceSystem, sourceTable, sourcePk]
      );

      const row = result.rows[0];
      if (!row) {
        throw new ServiceUnavailableException("CHANNEL_MAPPING_CREATE_FAILED");
      }

      if (mappingStatus !== "MAPPED") {
        await this.upsertMappingReviewQueue({
          mappingId: row.external_ref_key,
          channelCode: row.channel_code,
          reasonCode,
          reasonDetail: `mappingStatus=${mappingStatus}`
        });
      } else {
        await this.resolveMappingReviewQueue(row.external_ref_key, "system");
      }

      return {
        mappingId: row.external_ref_key,
        entityType: row.entity_type,
        channelCode: row.channel_code,
        externalRefKind: row.external_ref_kind,
        externalRef: row.external_ref,
        entityKey: row.entity_key,
        mappingStatus
      };
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (pgErrorCode === "23503") {
        throw new BadRequestException("CHANNEL_OR_ENTITY_REFERENCE_INVALID");
      }
      throw error;
    }
  }

  async update(
    mappingId: string,
    input: Partial<Omit<ChannelMappingRecord, "mappingId">> & {
      reasonCode?: string;
    }
  ): Promise<ChannelMappingRecord> {
    const id = this.readRequired(mappingId, "mappingId");
    const existing = await this.getMappingRow(id);

    const entityType = input.entityType ? this.readRequired(input.entityType, "entityType").toUpperCase() : existing.entity_type;
    const channelCode = input.channelCode ? this.readRequired(input.channelCode, "channelCode").toUpperCase() : existing.channel_code;
    const externalRefKind = input.externalRefKind
      ? this.readRequired(input.externalRefKind, "externalRefKind").toUpperCase()
      : existing.external_ref_kind;
    const externalRef = input.externalRef ? this.readRequired(input.externalRef, "externalRef") : existing.external_ref;
    const entityKey = input.entityKey ? this.readRequired(input.entityKey, "entityKey") : existing.entity_key;
    const mappingStatus = input.mappingStatus || existing.mappingStatus;

    try {
      const result = await this.databaseService.opsQuery<{
        external_ref_key: string;
        entity_type: string;
        channel_code: string;
        external_ref_kind: string;
        external_ref: string;
        entity_key: string;
      }>(
        `
          update channel_external_refs
          set entity_type = $2,
              entity_key = $3,
              channel_code = $4,
              external_ref_kind = $5,
              external_ref = $6,
              updated_at = now()
          where external_ref_key = $1
          returning
            external_ref_key,
            entity_type,
            channel_code,
            external_ref_kind,
            external_ref,
            entity_key
        `,
        [id, entityType, entityKey, channelCode, externalRefKind, externalRef]
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException(`Channel mapping not found: ${id}`);
      }

      if (mappingStatus === "MAPPED") {
        await this.resolveMappingReviewQueue(id, "system");
      } else {
        await this.upsertMappingReviewQueue({
          mappingId: id,
          channelCode: channelCode,
          reasonCode: (input.reasonCode || "MANUAL_REVIEW").trim().toUpperCase(),
          reasonDetail: `mappingStatus=${mappingStatus}`
        });
      }

      return {
        mappingId: row.external_ref_key,
        entityType: row.entity_type,
        channelCode: row.channel_code,
        externalRefKind: row.external_ref_kind,
        externalRef: row.external_ref,
        entityKey: row.entity_key,
        mappingStatus
      };
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (pgErrorCode === "23505") {
        throw new ConflictException("CHANNEL_MAPPING_DUPLICATE_REF");
      }
      if (pgErrorCode === "23503") {
        throw new BadRequestException("CHANNEL_OR_ENTITY_REFERENCE_INVALID");
      }
      throw error;
    }
  }

  async listUnmapped(input?: {
    status?: UnmappedStatus;
    queueType?: string;
    limit?: number;
  }): Promise<UnmappedRecord[]> {
    const values: unknown[] = [];
    const filters: string[] = [];

    if (input?.status) {
      values.push(this.ensureUnmappedStatus(input.status));
      filters.push(`u.status = $${values.length}`);
    }
    if (input?.queueType) {
      values.push(input.queueType.trim().toUpperCase());
      filters.push(`u.queue_type = $${values.length}`);
    }

    const limit = Math.min(Math.max(Math.trunc(Number(input?.limit) || 100), 1), 500);
    values.push(limit);
    const limitParam = `$${values.length}`;
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";

    try {
      const result = await this.databaseService.opsQuery<UnmappedRow>(
        `
          select
            u.queue_key,
            u.queue_type,
            u.channel_code,
            u.source_system,
            u.source_table,
            u.source_pk,
            u.reason_code,
            u.reason_detail,
            u.status
          from unmapped_queue u
          ${whereClause}
          order by u.updated_at desc, u.created_at desc
          limit ${limitParam}
        `,
        values
      );

      return result.rows.map((row) => ({
        queueId: row.queue_key,
        queueType: row.queue_type,
        channelCode: row.channel_code,
        sourceSystem: row.source_system,
        sourceTable: row.source_table,
        sourcePk: row.source_pk,
        reasonCode: row.reason_code,
        reasonDetail: row.reason_detail,
        status: this.ensureUnmappedStatus(row.status)
      }));
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async updateUnmappedStatus(
    queueId: string,
    toStatus: UnmappedStatus,
    resolvedBy: string
  ): Promise<UnmappedRecord> {
    const id = this.readRequired(queueId, "queueId");
    const targetStatus = this.ensureUnmappedStatus(toStatus);
    const actor = this.readRequired(resolvedBy, "resolvedBy");

    try {
      const result = await this.databaseService.opsQuery<UnmappedRow>(
        `
          update unmapped_queue
          set status = $2,
              resolved_by = case when $2 in ('RESOLVED', 'CLOSED') then $3 else null end,
              resolved_at = case when $2 in ('RESOLVED', 'CLOSED') then now() else null end,
              updated_at = now()
          where queue_key = $1
          returning
            queue_key,
            queue_type,
            channel_code,
            source_system,
            source_table,
            source_pk,
            reason_code,
            reason_detail,
            status
        `,
        [id, targetStatus, actor]
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException(`Unmapped queue not found: ${id}`);
      }

      return {
        queueId: row.queue_key,
        queueType: row.queue_type,
        channelCode: row.channel_code,
        sourceSystem: row.source_system,
        sourceTable: row.source_table,
        sourcePk: row.source_pk,
        reasonCode: row.reason_code,
        reasonDetail: row.reason_detail,
        status: this.ensureUnmappedStatus(row.status)
      };
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  private async getMappingRow(mappingId: string): Promise<{
    external_ref_key: string;
    entity_type: string;
    channel_code: string;
    external_ref_kind: string;
    external_ref: string;
    entity_key: string;
    mappingStatus: MappingStatus;
  }> {
    const result = await this.databaseService.opsQuery<MappingRow>(
      `
        select
          c.external_ref_key,
          c.entity_type,
          c.channel_code,
          c.external_ref_kind,
          c.external_ref,
          c.entity_key,
          q.status as queue_status
        from channel_external_refs c
        left join lateral (
          select u.status
          from unmapped_queue u
          where u.queue_type = 'CHANNEL_MAPPING'
            and u.source_table = 'channel_external_refs'
            and u.source_pk = c.external_ref_key::text
            and u.status in ('OPEN', 'IN_REVIEW')
          order by u.updated_at desc
          limit 1
        ) q on true
        where c.external_ref_key = $1
        limit 1
      `,
      [mappingId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Channel mapping not found: ${mappingId}`);
    }

    return {
      external_ref_key: row.external_ref_key,
      entity_type: row.entity_type,
      channel_code: row.channel_code,
      external_ref_kind: row.external_ref_kind,
      external_ref: row.external_ref,
      entity_key: row.entity_key,
      mappingStatus: this.mapMappingStatus(row.queue_status)
    };
  }

  private async upsertMappingReviewQueue(input: {
    mappingId: string;
    channelCode: string;
    reasonCode: string;
    reasonDetail: string;
  }) {
    const existing = await this.databaseService.opsQuery<{ queue_key: string }>(
      `
        select queue_key
        from unmapped_queue
        where queue_type = 'CHANNEL_MAPPING'
          and source_table = 'channel_external_refs'
          and source_pk = $1
          and status in ('OPEN', 'IN_REVIEW')
        order by updated_at desc
        limit 1
      `,
      [input.mappingId]
    );

    if (existing.rows.length > 0) {
      await this.databaseService.opsQuery(
        `
          update unmapped_queue
          set channel_code = $2,
              reason_code = $3,
              reason_detail = $4,
              status = 'IN_REVIEW',
              updated_at = now()
          where queue_key = $1
        `,
        [existing.rows[0].queue_key, input.channelCode, input.reasonCode, input.reasonDetail]
      );
      return;
    }

    await this.databaseService.opsQuery(
      `
        insert into unmapped_queue (
          queue_key,
          queue_type,
          channel_code,
          source_system,
          source_table,
          source_pk,
          reason_code,
          reason_detail,
          status,
          payload
        ) values (
          $1,
          'CHANNEL_MAPPING',
          $2,
          'core-api',
          'channel_external_refs',
          $3,
          $4,
          $5,
          'IN_REVIEW',
          $6::jsonb
        )
      `,
      [
        randomUUID(),
        input.channelCode,
        input.mappingId,
        input.reasonCode,
        input.reasonDetail,
        JSON.stringify({ mappingId: input.mappingId })
      ]
    );
  }

  private async resolveMappingReviewQueue(mappingId: string, actor: string) {
    await this.databaseService.opsQuery(
      `
        update unmapped_queue
        set status = 'RESOLVED',
            resolved_by = $2,
            resolved_at = now(),
            updated_at = now()
        where queue_type = 'CHANNEL_MAPPING'
          and source_table = 'channel_external_refs'
          and source_pk = $1
          and status in ('OPEN', 'IN_REVIEW')
      `,
      [mappingId, actor]
    );
  }

  private mapMappingStatus(queueStatus: string | null): MappingStatus {
    if (queueStatus === "IN_REVIEW") {
      return "REVIEW_REQUIRED";
    }
    if (queueStatus === "OPEN") {
      return "UNMAPPED";
    }
    return "MAPPED";
  }

  private ensureUnmappedStatus(status: string): UnmappedStatus {
    const normalized = status.trim().toUpperCase();
    if (
      normalized === "OPEN" ||
      normalized === "IN_REVIEW" ||
      normalized === "RESOLVED" ||
      normalized === "CLOSED"
    ) {
      return normalized;
    }
    throw new BadRequestException(`INVALID_UNMAPPED_STATUS:${status}`);
  }

  private readRequired(rawValue: string, fieldName: string): string {
    if (typeof rawValue !== "string") {
      throw new BadRequestException(`INVALID_FIELD_${fieldName.toUpperCase()}`);
    }
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException(`EMPTY_FIELD_${fieldName.toUpperCase()}`);
    }
    return value;
  }

  private rethrowSchemaNotReady(error: unknown): never | void {
    const pgErrorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    if (pgErrorCode === "42P01") {
      throw new ServiceUnavailableException("MAPPING_SCHEMA_NOT_READY");
    }
  }
}
