import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";

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

interface BookingRow {
  booking_key: string;
  channel_code: string;
  external_booking_ref: string;
  customer_payment_status: string;
  ops_fulfillment_status: string;
  note: string | null;
  meeting_point: string | null;
  assigned_driver_id: number | null;
}

@Injectable()
export class BookingService {
  constructor(private readonly databaseService: DatabaseService) {}

  async list(): Promise<OpsBooking[]> {
    try {
      const result = await this.databaseService.opsQuery<BookingRow>(
        `
          select
            b.booking_key,
            b.channel_code,
            b.external_booking_ref,
            b.customer_payment_status,
            coalesce(o.ops_fulfillment_status, b.ops_fulfillment_status) as ops_fulfillment_status,
            b.note,
            c.meeting_point,
            o.assigned_driver_id
          from booking_core b
          left join booking_contact c on c.booking_key = b.booking_key
          left join ops_booking_state o on o.booking_key = b.booking_key
          order by b.booking_created_at desc, b.created_at desc
          limit 200
        `
      );
      return result.rows.map((row) => this.mapRow(row));
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async get(idOrExternalRef: string): Promise<OpsBooking> {
    const normalized = this.readRequired(idOrExternalRef, "id");
    try {
      const row = await this.findByKeyOrExternalRef(normalized);
      if (!row) {
        throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
      }
      return this.mapRow(row);
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async patch(
    idOrExternalRef: string,
    input: {
      note?: string;
      meetingPoint?: string;
      packageRefType?: string;
      packageRefKey?: string;
    }
  ) {
    const normalized = this.readRequired(idOrExternalRef, "id");
    try {
      const result = await this.databaseService.withOpsTransaction(async (client) => {
        const row = await this.findByKeyOrExternalRefWithClient(client, normalized, true);
        if (!row) {
          throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
        }

        if (input.note !== undefined) {
          await client.query(
            `
              update booking_core
              set note = $2,
                  updated_at = now()
              where booking_key = $1
            `,
            [row.booking_key, this.normalizeOptionalText(input.note)]
          );
        }

        if (input.packageRefType !== undefined || input.packageRefKey !== undefined) {
          const packageRefType =
            input.packageRefType === undefined
              ? null
              : this.readRequired(input.packageRefType, "packageRefType").toUpperCase();
          const packageRefKey =
            input.packageRefKey === undefined ? null : this.normalizeOptionalText(input.packageRefKey);

          if (
            packageRefType !== null &&
            !["LEGACY_PACKAGE", "CATALOG_PRODUCT", "CATALOG_VARIANT"].includes(packageRefType)
          ) {
            throw new BadRequestException(`INVALID_PACKAGE_REF_TYPE:${packageRefType}`);
          }

          await client.query(
            `
              update booking_core
              set package_ref_type = coalesce($2, package_ref_type),
                  package_ref_key = case
                    when $3::text is null then package_ref_key
                    else $3::uuid
                  end,
                  updated_at = now()
              where booking_key = $1
            `,
            [row.booking_key, packageRefType, packageRefKey]
          );
        }

        if (input.meetingPoint !== undefined) {
          await client.query(
            `
              insert into booking_contact (
                booking_key,
                meeting_point
              ) values (
                $1,
                $2
              )
              on conflict (booking_key)
              do update set
                meeting_point = excluded.meeting_point,
                updated_at = now()
            `,
            [row.booking_key, this.normalizeOptionalText(input.meetingPoint)]
          );
        }

        const updated = await this.findByKeyOrExternalRefWithClient(client, row.booking_key, false);
        if (!updated) {
          throw new NotFoundException(`Booking not found after patch: ${idOrExternalRef}`);
        }
        return updated;
      });

      return {
        booking: this.mapRow(result),
        packageRefType: input.packageRefType ?? null,
        packageRefKey: input.packageRefKey ?? null
      };
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async assign(idOrExternalRef: string, driverId: number): Promise<OpsBooking> {
    const normalized = this.readRequired(idOrExternalRef, "id");
    const parsedDriverId = Number(driverId);
    if (!Number.isFinite(parsedDriverId) || parsedDriverId <= 0) {
      throw new BadRequestException("INVALID_DRIVER_ID");
    }

    try {
      const row = await this.databaseService.withOpsTransaction(async (client) => {
        const current = await this.findByKeyOrExternalRefWithClient(client, normalized, true);
        if (!current) {
          throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
        }

        await client.query(
          `
            update ops_assignment
            set is_active = false,
                unassigned_at = now(),
                updated_at = now()
            where booking_key = $1
              and is_active = true
          `,
          [current.booking_key]
        );

        await client.query(
          `
            insert into ops_assignment (
              assignment_key,
              booking_key,
              driver_id,
              assignment_source,
              assigned_at,
              is_active
            ) values (
              $1,
              $2,
              $3,
              'CORE_API',
              now(),
              true
            )
          `,
          [randomUUID(), current.booking_key, Math.trunc(parsedDriverId)]
        );

        await client.query(
          `
            insert into ops_booking_state (
              booking_key,
              ops_fulfillment_status,
              assigned_driver_id,
              assigned_at,
              is_paid_flag
            ) values (
              $1,
              $2,
              $3,
              now(),
              $4
            )
            on conflict (booking_key)
            do update set
              assigned_driver_id = excluded.assigned_driver_id,
              assigned_at = excluded.assigned_at,
              updated_at = now()
          `,
          [
            current.booking_key,
            current.ops_fulfillment_status,
            Math.trunc(parsedDriverId),
            current.customer_payment_status === "PAID"
          ]
        );

        const updated = await this.findByKeyOrExternalRefWithClient(client, current.booking_key, false);
        if (!updated) {
          throw new NotFoundException(`Booking not found after assign: ${idOrExternalRef}`);
        }
        return updated;
      });

      return this.mapRow(row);
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async unassign(idOrExternalRef: string): Promise<OpsBooking> {
    const normalized = this.readRequired(idOrExternalRef, "id");
    try {
      const row = await this.databaseService.withOpsTransaction(async (client) => {
        const current = await this.findByKeyOrExternalRefWithClient(client, normalized, true);
        if (!current) {
          throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
        }

        await client.query(
          `
            update ops_assignment
            set is_active = false,
                unassigned_at = now(),
                updated_at = now()
            where booking_key = $1
              and is_active = true
          `,
          [current.booking_key]
        );

        await client.query(
          `
            insert into ops_booking_state (
              booking_key,
              ops_fulfillment_status,
              assigned_driver_id,
              assigned_at,
              is_paid_flag
            ) values (
              $1,
              $2,
              null,
              null,
              $3
            )
            on conflict (booking_key)
            do update set
              assigned_driver_id = null,
              assigned_at = null,
              updated_at = now()
          `,
          [current.booking_key, current.ops_fulfillment_status, current.customer_payment_status === "PAID"]
        );

        const updated = await this.findByKeyOrExternalRefWithClient(client, current.booking_key, false);
        if (!updated) {
          throw new NotFoundException(`Booking not found after unassign: ${idOrExternalRef}`);
        }
        return updated;
      });

      return this.mapRow(row);
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  async syncStatus(idOrExternalRef: string): Promise<OpsBooking> {
    const normalized = this.readRequired(idOrExternalRef, "id");
    try {
      const row = await this.databaseService.withOpsTransaction(async (client) => {
        const current = await this.findByKeyOrExternalRefWithClient(client, normalized, true);
        if (!current) {
          throw new NotFoundException(`Booking not found: ${idOrExternalRef}`);
        }

        const nextStatus = this.computeNextStatus(
          current.ops_fulfillment_status,
          current.assigned_driver_id,
          current.customer_payment_status
        );

        await client.query(
          `
            update booking_core
            set ops_fulfillment_status = $2,
                updated_at = now()
            where booking_key = $1
          `,
          [current.booking_key, nextStatus]
        );

        await client.query(
          `
            insert into ops_booking_state (
              booking_key,
              ops_fulfillment_status,
              assigned_driver_id,
              assigned_at,
              is_paid_flag
            ) values (
              $1,
              $2,
              $3,
              null,
              $4
            )
            on conflict (booking_key)
            do update set
              ops_fulfillment_status = excluded.ops_fulfillment_status,
              updated_at = now()
          `,
          [
            current.booking_key,
            nextStatus,
            current.assigned_driver_id,
            current.customer_payment_status === "PAID"
          ]
        );

        const updated = await this.findByKeyOrExternalRefWithClient(client, current.booking_key, false);
        if (!updated) {
          throw new NotFoundException(`Booking not found after status sync: ${idOrExternalRef}`);
        }
        return updated;
      });

      return this.mapRow(row);
    } catch (error) {
      this.rethrowSchemaNotReady(error);
      throw error;
    }
  }

  private computeNextStatus(
    currentStatus: string,
    assignedDriverId: number | null,
    customerPaymentStatus: string
  ): string {
    if (["DONE", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(currentStatus)) {
      return currentStatus;
    }
    if (assignedDriverId && customerPaymentStatus === "PAID") {
      return "READY";
    }
    return "ATTENTION";
  }

  private async findByKeyOrExternalRef(idOrExternalRef: string): Promise<BookingRow | null> {
    const result = await this.databaseService.opsQuery<BookingRow>(
      `
        select
          b.booking_key,
          b.channel_code,
          b.external_booking_ref,
          b.customer_payment_status,
          coalesce(o.ops_fulfillment_status, b.ops_fulfillment_status) as ops_fulfillment_status,
          b.note,
          c.meeting_point,
          o.assigned_driver_id
        from booking_core b
        left join booking_contact c on c.booking_key = b.booking_key
        left join ops_booking_state o on o.booking_key = b.booking_key
        where b.booking_key::text = $1
           or upper(b.external_booking_ref) = upper($1)
        limit 1
      `,
      [idOrExternalRef]
    );
    return result.rows[0] ?? null;
  }

  private async findByKeyOrExternalRefWithClient(
    client: PoolClient,
    idOrExternalRef: string,
    lockForUpdate: boolean
  ): Promise<BookingRow | null> {
    const result = await client.query<BookingRow>(
      `
        select
          b.booking_key,
          b.channel_code,
          b.external_booking_ref,
          b.customer_payment_status,
          coalesce(o.ops_fulfillment_status, b.ops_fulfillment_status) as ops_fulfillment_status,
          b.note,
          c.meeting_point,
          o.assigned_driver_id
        from booking_core b
        left join booking_contact c on c.booking_key = b.booking_key
        left join ops_booking_state o on o.booking_key = b.booking_key
        where b.booking_key::text = $1
           or upper(b.external_booking_ref) = upper($1)
        limit 1
        ${lockForUpdate ? "for update of b" : ""}
      `,
      [idOrExternalRef]
    );
    return result.rows[0] ?? null;
  }

  private mapRow(row: BookingRow): OpsBooking {
    return {
      bookingKey: row.booking_key,
      channelCode: row.channel_code,
      externalBookingRef: row.external_booking_ref,
      customerPaymentStatus: row.customer_payment_status,
      opsFulfillmentStatus: row.ops_fulfillment_status,
      note: row.note || undefined,
      meetingPoint: row.meeting_point || undefined,
      assignedDriverId: row.assigned_driver_id ?? undefined
    };
  }

  private normalizeOptionalText(value?: string): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
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
      throw new ServiceUnavailableException("BOOKING_SCHEMA_NOT_READY");
    }
  }
}
