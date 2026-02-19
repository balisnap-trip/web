# Phase-2 Migration Blueprint (Database Reconstruction)

Date: 2026-02-18  
Status: ready-to-execute blueprint  
Scope: DDL + backfill + reconciliation + cutover guard

## 1) Inputs (must read first)

1. `doc/prep-erd-final-2026-02-18.md`
2. `doc/prep-api-contract-v1-2026-02-18.md`
3. `doc/prep-migration-matrix-2026-02-18.md`
4. `doc/prep-decision-lock-2026-02-18.md`

## 2) Migration design principles

1. Additive-first: create new tables/columns before any drop.
2. Idempotent backfill: scripts must be safely re-runnable.
3. Observable: every major step writes reconciliation output.
4. Reversible: keep rollback path for each migration batch.

## 3) Execution batches

## Batch A - Schema foundation (DDL only)

Create new tables (no read-path switch yet):
1. `channels`
2. `channel_products`
3. `channel_variants`
4. `channel_rate_rules`
5. `channel_sync_logs`
6. `legacy_package_bridge`
7. `booking_source_events`

Also add bridge columns (if not present yet):
1. `finance_patterns.variant_id` (nullable at first)
2. `bookings.source_channel` (canonical field)
3. `bookings.travel_date` (canonical travel date field)

Indexes required in same batch:
1. `channel_products(channel_id, external_product_ref)`
2. `channel_variants(channel_product_id, external_variant_ref)`
3. `channel_variants(variant_id)`
4. `booking_source_events(channel_id, external_booking_ref)`
5. `legacy_package_bridge(legacy_package_id)`

## Batch B - Seed reference data

1. Seed `channels` from known sources:
- `WEB`, `DIRECT`, `GYG`, `VIATOR`, `BOKUN`, `TRIPDOTCOM`, `MANUAL`.
2. Upsert seed operation should use `code` unique key.

## Batch C - Legacy bridge backfill

1. Build `legacy_package_bridge` from:
- `balisnap.TourVariant.legacy_package_id`
- `balisnap.TourProduct.legacy_package_id`
- `bstadmin.TourPackage.id` linkage to migrated variant/product mapping.

2. Output report:
- bridged rows count
- duplicate legacy package conflicts
- unresolved package IDs.

## Batch D - Catalog mapping backfill

1. Populate `channel_products`:
- `WEB` channel from canonical `product`.
- OTA channels from booking-derived references (`tourName`, parser artifacts in note) as provisional rows.

2. Populate `channel_variants`:
- map known variant links from bridge.
- mark unknown as `UNMAPPED`.

3. Populate `channel_rate_rules`:
- from canonical `rate_plan` (if channel-specific override absent, store baseline projection).

## Batch E - Booking canonical enrichment

1. Populate/normalize `bookings.source_channel`.
2. Populate `bookings.travel_date`:
- direct web: fallback from booking date when no departure/travel field.
- admin/OTA: from `tourDate`.

3. Create `booking_source_events` from admin email relations:
- source: `BookingEmail + EmailInbox` pairs.
- include `relation_type`, `email_id`, and available payload snapshot.

4. For admin bookings without item rows:
- generate synthetic `booking_item` rows with `item_status` and totals based on migration matrix.

## Batch F - Finance bridge backfill

1. Fill `finance_patterns.variant_id` using `legacy_package_bridge`.
2. Keep `legacy_package_id` reference during transition.
3. Produce unresolved finance pattern report (must be manually mapped before Phase-3 cutover).

## 4) Reconciliation checkpoints (SQL-level)

Mandatory checks after each relevant batch:
1. Product-variant integrity:
- every `variant.product_id` points to existing product.

2. Booking totals:
- `booking.total_amount` equals sum active item totals where items exist.

3. Finance integrity:
- every `booking_finance.pattern_id` points to existing pattern.
- every pattern has at least one of: `variant_id` or `legacy_package_id`.

4. Channel mapping quality:
- count `UNMAPPED` channel variants per channel.
- count bookings with unresolved variant mapping.

5. Payment consistency:
- completed payments should map to paid/completed booking statuses according to current rules.

## 5) Rollout guards

1. Freeze window before switching write-path:
- block schema-destructive migrations.
- block ad-hoc manual updates on mapping tables.

2. Dry run then production run:
- run all backfill scripts on staging clone first.
- compare reconciliation deltas.

3. Cutover guard metrics:
- error rate on booking/payment endpoints.
- unresolved mapping ratio.
- finance unresolved pattern count.

## 6) Deliverables expected from Batch execution

1. SQL migration files (ordered and versioned).
2. Backfill scripts (idempotent, logged).
3. Reconciliation SQL pack + generated reports.
4. Rollback scripts for each batch.
5. Migration runbook with timings and owner per step.

## 7) Hard stop conditions

Stop cutover immediately if:
1. booking total mismatch rate > 0.
2. unresolved finance pattern references remain for active bookings.
3. payment capture path breaks amount/currency guard behavior.
4. `UNMAPPED` OTA booking ratio increases after backfill.
