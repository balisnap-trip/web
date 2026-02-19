import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ReconciliationCheckItem {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ReconciliationDomainSummary {
  mismatchRows: number;
  denominator: number;
  ratio: number | null;
  thresholdRatio: number | null;
  passed: boolean;
}

export interface ReconciliationMetricsSnapshot {
  generatedAt: string;
  result: "PASS" | "FAIL";
  thresholds: {
    maxGlobalMismatchRatio: number;
    maxOpsDoneNotPaidRatio: number;
    maxUnmappedRatioPercent: number;
  };
  metrics: {
    bookingCoreTotalRows: number;
    bookingCoreNullIdentity: number;
    bookingCoreDuplicateIdentityGroups: number;
    bookingCoreDuplicateIdentityExcessRows: number;
    paymentEventTotalRows: number;
    paymentOrphanRows: number;
    opsDoneTotal: number;
    opsDoneNotPaid: number;
    opsDoneNotPaidRatio: number;
    ingestEventTotalRows: number;
    ingestSecondaryDedupDuplicateGroups: number;
    ingestSecondaryDedupExcessRows: number;
    unmappedRows: number;
    totalCatalogEntities: number;
    unmappedRatioPercent: number | null;
    globalMismatchRatio: number;
  };
  domains: {
    booking: ReconciliationDomainSummary;
    payment: ReconciliationDomainSummary;
    ingest: ReconciliationDomainSummary;
    catalog: ReconciliationDomainSummary;
  };
  checks: ReconciliationCheckItem[];
}

interface CountRow {
  count: number | string;
}

interface DuplicateIdentityRow {
  group_count: number | string;
  excess_row_count: number | string;
}

interface OpsDonePaymentRow {
  ops_done_total: number | string;
  ops_done_not_paid: number | string;
}

interface UnmappedRatioRow {
  unmapped_rows: number | string;
  total_catalog_entities: number | string;
  ratio_percent: number | string | null;
}

interface TotalsRow {
  booking_total_rows: number | string;
  payment_total_rows: number | string;
  ingest_total_rows: number | string;
}

@Injectable()
export class ReconciliationMetricsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getSnapshot(): Promise<ReconciliationMetricsSnapshot> {
    const maxGlobalMismatchRatio = this.readNumber(
      process.env.RECON_MAX_GLOBAL_MISMATCH_RATIO,
      0.01,
      0
    );
    const maxOpsDoneNotPaidRatio = this.readNumber(
      process.env.QUALITY_MAX_OPS_DONE_NOT_PAID_RATIO,
      0.01,
      0
    );
    const maxUnmappedRatioPercent = this.readNumber(
      process.env.QUALITY_MAX_UNMAPPED_RATIO_PERCENT,
      5,
      0
    );

    try {
      const [
        bookingNullIdentityResult,
        duplicateIdentityResult,
        paymentOrphanResult,
        opsDoneNotPaidResult,
        ingestSecondaryDedupResult,
        unmappedRatioResult,
        totalsResult
      ] = await Promise.all([
        this.databaseService.opsQuery<CountRow>(
          `
            select count(*)::int as count
            from booking_core
            where channel_code is null
               or external_booking_ref is null
          `
        ),
        this.databaseService.opsQuery<DuplicateIdentityRow>(
          `
            with duplicate_groups as (
              select channel_code, external_booking_ref, count(*)::int as total_rows
              from booking_core
              group by channel_code, external_booking_ref
              having count(*) > 1
            )
            select
              count(*)::int as group_count,
              coalesce(sum(total_rows - 1), 0)::int as excess_row_count
            from duplicate_groups
          `
        ),
        this.databaseService.opsQuery<CountRow>(
          `
            select count(*)::int as count
            from payment_event p
            left join booking_core b on b.booking_key = p.booking_key
            where b.booking_key is null
          `
        ),
        this.databaseService.opsQuery<OpsDonePaymentRow>(
          `
            select
              count(*) filter (where ops_fulfillment_status = 'DONE')::int as ops_done_total,
              count(*) filter (
                where ops_fulfillment_status = 'DONE'
                  and customer_payment_status <> 'PAID'
              )::int as ops_done_not_paid
            from booking_core
          `
        ),
        this.databaseService.opsQuery<DuplicateIdentityRow>(
          `
            with duplicate_groups as (
              select source_enum, external_booking_ref, event_type, event_time_normalized, count(*)::int as total_rows
              from ingest_event_log
              group by source_enum, external_booking_ref, event_type, event_time_normalized
              having count(*) > 1
            )
            select
              count(*)::int as group_count,
              coalesce(sum(total_rows - 1), 0)::int as excess_row_count
            from duplicate_groups
          `
        ),
        this.databaseService.opsQuery<UnmappedRatioRow>(
          `
            with catalog_total as (
              select (
                (select count(*) from catalog_product) +
                (select count(*) from catalog_variant)
              )::numeric as total_catalog_entities
            ),
            unmapped_total as (
              select count(*)::numeric as unmapped_rows
              from unmapped_queue
              where status = 'OPEN'
                and queue_type in ('PRODUCT_MAPPING', 'VARIANT_MAPPING', 'CATALOG_EXTENDED_METADATA')
            )
            select
              u.unmapped_rows::int as unmapped_rows,
              c.total_catalog_entities::int as total_catalog_entities,
              case
                when c.total_catalog_entities = 0 then null
                else round((u.unmapped_rows / c.total_catalog_entities) * 100, 2)
              end as ratio_percent
            from unmapped_total u
            cross join catalog_total c
          `
        ),
        this.databaseService.opsQuery<TotalsRow>(
          `
            select
              (select count(*)::int from booking_core) as booking_total_rows,
              (select count(*)::int from payment_event) as payment_total_rows,
              (select count(*)::int from ingest_event_log) as ingest_total_rows
          `
        )
      ]);

      const bookingCoreNullIdentity = this.toNumber(bookingNullIdentityResult.rows[0]?.count);
      const bookingCoreDuplicateIdentityGroups = this.toNumber(
        duplicateIdentityResult.rows[0]?.group_count
      );
      const bookingCoreDuplicateIdentityExcessRows = this.toNumber(
        duplicateIdentityResult.rows[0]?.excess_row_count
      );
      const paymentOrphanRows = this.toNumber(paymentOrphanResult.rows[0]?.count);
      const opsDoneTotal = this.toNumber(opsDoneNotPaidResult.rows[0]?.ops_done_total);
      const opsDoneNotPaid = this.toNumber(opsDoneNotPaidResult.rows[0]?.ops_done_not_paid);
      const opsDoneNotPaidRatio = this.ratioOrZero(opsDoneNotPaid, opsDoneTotal);
      const ingestSecondaryDedupDuplicateGroups = this.toNumber(
        ingestSecondaryDedupResult.rows[0]?.group_count
      );
      const ingestSecondaryDedupExcessRows = this.toNumber(
        ingestSecondaryDedupResult.rows[0]?.excess_row_count
      );
      const unmappedRows = this.toNumber(unmappedRatioResult.rows[0]?.unmapped_rows);
      const totalCatalogEntities = this.toNumber(unmappedRatioResult.rows[0]?.total_catalog_entities);
      const unmappedRatioPercent = this.toNullableNumber(unmappedRatioResult.rows[0]?.ratio_percent);

      const bookingCoreTotalRows = this.toNumber(totalsResult.rows[0]?.booking_total_rows);
      const paymentEventTotalRows = this.toNumber(totalsResult.rows[0]?.payment_total_rows);
      const ingestEventTotalRows = this.toNumber(totalsResult.rows[0]?.ingest_total_rows);

      const bookingMismatchRows =
        bookingCoreNullIdentity + bookingCoreDuplicateIdentityExcessRows;
      const paymentMismatchRows = paymentOrphanRows + opsDoneNotPaid;
      const ingestMismatchRows = ingestSecondaryDedupExcessRows;
      const catalogMismatchRows = unmappedRows;

      const bookingRatio = this.ratioOrNull(bookingMismatchRows, bookingCoreTotalRows);
      const paymentDenominator = paymentEventTotalRows + opsDoneTotal;
      const paymentRatio = this.ratioOrNull(paymentMismatchRows, paymentDenominator);
      const ingestRatio = this.ratioOrNull(ingestMismatchRows, ingestEventTotalRows);
      const catalogRatio =
        unmappedRatioPercent === null ? null : this.round(unmappedRatioPercent / 100, 6);

      const globalMismatchNumerator =
        bookingMismatchRows +
        paymentOrphanRows +
        opsDoneNotPaid +
        ingestMismatchRows +
        catalogMismatchRows;
      const globalMismatchDenominator =
        bookingCoreTotalRows +
        paymentEventTotalRows +
        opsDoneTotal +
        ingestEventTotalRows +
        totalCatalogEntities;
      const globalMismatchRatio = this.ratioOrZero(
        globalMismatchNumerator,
        globalMismatchDenominator
      );

      const unmappedRatioPassed =
        totalCatalogEntities > 0 &&
        unmappedRatioPercent !== null &&
        unmappedRatioPercent <= maxUnmappedRatioPercent;

      const checks: ReconciliationCheckItem[] = [
        {
          name: "booking_core_null_identity",
          passed: bookingCoreNullIdentity === 0,
          detail: `count=${bookingCoreNullIdentity}`
        },
        {
          name: "booking_core_duplicate_identity",
          passed: bookingCoreDuplicateIdentityGroups === 0,
          detail: `groups=${bookingCoreDuplicateIdentityGroups}, excessRows=${bookingCoreDuplicateIdentityExcessRows}`
        },
        {
          name: "payment_orphan_rows",
          passed: paymentOrphanRows === 0,
          detail: `count=${paymentOrphanRows}`
        },
        {
          name: "ops_done_not_paid_ratio",
          passed: opsDoneNotPaidRatio <= maxOpsDoneNotPaidRatio,
          detail: `ratio=${opsDoneNotPaidRatio.toFixed(6)}, max=${maxOpsDoneNotPaidRatio.toFixed(6)}, opsDone=${opsDoneTotal}, mismatch=${opsDoneNotPaid}`
        },
        {
          name: "ingest_secondary_dedup_duplicates",
          passed: ingestSecondaryDedupDuplicateGroups === 0,
          detail: `groups=${ingestSecondaryDedupDuplicateGroups}, excessRows=${ingestSecondaryDedupExcessRows}`
        },
        {
          name: "unmapped_ratio_percent",
          passed: unmappedRatioPassed,
          detail: `ratio=${unmappedRatioPercent ?? "n/a"}, max=${maxUnmappedRatioPercent}, unmapped=${unmappedRows}, denominator=${totalCatalogEntities}`
        },
        {
          name: "global_mismatch_ratio",
          passed: globalMismatchRatio <= maxGlobalMismatchRatio,
          detail: `ratio=${globalMismatchRatio.toFixed(6)}, max=${maxGlobalMismatchRatio.toFixed(6)}, numerator=${globalMismatchNumerator}, denominator=${globalMismatchDenominator}`
        }
      ];

      const bookingDomainPassed = bookingMismatchRows === 0;
      const paymentDomainPassed =
        paymentOrphanRows === 0 && opsDoneNotPaidRatio <= maxOpsDoneNotPaidRatio;
      const ingestDomainPassed = ingestMismatchRows === 0;
      const catalogDomainPassed = unmappedRatioPassed;

      return {
        generatedAt: new Date().toISOString(),
        result: checks.every((item) => item.passed) ? "PASS" : "FAIL",
        thresholds: {
          maxGlobalMismatchRatio,
          maxOpsDoneNotPaidRatio,
          maxUnmappedRatioPercent
        },
        metrics: {
          bookingCoreTotalRows,
          bookingCoreNullIdentity,
          bookingCoreDuplicateIdentityGroups,
          bookingCoreDuplicateIdentityExcessRows,
          paymentEventTotalRows,
          paymentOrphanRows,
          opsDoneTotal,
          opsDoneNotPaid,
          opsDoneNotPaidRatio,
          ingestEventTotalRows,
          ingestSecondaryDedupDuplicateGroups,
          ingestSecondaryDedupExcessRows,
          unmappedRows,
          totalCatalogEntities,
          unmappedRatioPercent,
          globalMismatchRatio
        },
        domains: {
          booking: {
            mismatchRows: bookingMismatchRows,
            denominator: bookingCoreTotalRows,
            ratio: bookingRatio,
            thresholdRatio: 0,
            passed: bookingDomainPassed
          },
          payment: {
            mismatchRows: paymentMismatchRows,
            denominator: paymentDenominator,
            ratio: paymentRatio,
            thresholdRatio: maxOpsDoneNotPaidRatio,
            passed: paymentDomainPassed
          },
          ingest: {
            mismatchRows: ingestMismatchRows,
            denominator: ingestEventTotalRows,
            ratio: ingestRatio,
            thresholdRatio: 0,
            passed: ingestDomainPassed
          },
          catalog: {
            mismatchRows: catalogMismatchRows,
            denominator: totalCatalogEntities,
            ratio: catalogRatio,
            thresholdRatio: this.round(maxUnmappedRatioPercent / 100, 6),
            passed: catalogDomainPassed
          }
        },
        checks
      };
    } catch (error) {
      const pgErrorCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (pgErrorCode === "42P01") {
        throw new ServiceUnavailableException("RECONCILIATION_SCHEMA_NOT_READY");
      }
      throw error;
    }
  }

  private readNumber(rawValue: string | undefined, fallback: number, minValue: number): number {
    if (!rawValue) {
      return fallback;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < minValue) {
      return fallback;
    }
    return value;
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private ratioOrZero(numerator: number, denominator: number): number {
    if (denominator <= 0) {
      return 0;
    }
    return this.round(numerator / denominator, 6);
  }

  private ratioOrNull(numerator: number, denominator: number): number | null {
    if (denominator <= 0) {
      return null;
    }
    return this.round(numerator / denominator, 6);
  }

  private round(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
  }
}
