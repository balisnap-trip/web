# Core Schema Target v1 (Active, Executable Baseline)

Tanggal lock: 2026-02-19  
Status: aktif (sumber final untuk desain schema target phase-2)  
Engine target: PostgreSQL 15+

Dokumen ini menggantikan kebutuhan referensi ERD dari arsip.  
Jika ada konflik, prioritas:

1. source code aktif,
2. `doc/prep-decision-lock-2026-02-18.md`,
3. dokumen ini,
4. dokumen rencana lain.

## 1. Tujuan

1. Menetapkan schema target yang executable untuk migration batch A-B.
2. Menghilangkan ambiguity nama tabel/kolom lintas dokumen aktif.
3. Menjadi kontrak tunggal antara:
   1. `prep-migration-matrix`,
   2. `prep-phase2-migration-blueprint`,
   3. implementasi SQL migration.

## 2. Konvensi Wajib

1. Nama tabel/kolom: `snake_case`.
2. Waktu: `timestamptz` UTC.
3. Monetary: `numeric(12,2)` kecuali ada kebutuhan eksplisit lain.
4. Semua tabel wajib punya:
   1. `created_at timestamptz not null default now()`,
   2. `updated_at timestamptz not null default now()` (kecuali log append-only).
5. Soft delete untuk bridge table: `is_deleted boolean not null default false` jika dibutuhkan.

## 3. ID Generation Policy (Locked)

1. New write di core-api:
   1. gunakan UUIDv7 (application-generated).
2. Backfill dari source legacy:
   1. gunakan UUIDv5 deterministik, bukan random.
3. Namespace UUIDv5 (literal constants, locked):
   1. `NS_BOOKING = 1396788e-dfe4-558e-977f-cbac85111c4c`,
   2. `NS_CATALOG_PRODUCT = 1b2c8dda-1d99-57f5-bdc1-b9fb772d8186`,
   3. `NS_CATALOG_VARIANT = 6b647a19-b987-5dd4-8c1e-94bceb859370`,
   4. `NS_PAYMENT = 2dfcb1f0-47c5-5823-9bc3-c281e0fd702f`.
4. Namespace di atas tidak dihitung ulang saat runtime/migration.
5. Name string UUIDv5 wajib format:
   1. `{source_system}:{source_table}:{source_pk}`.

## 4. Table Set (Batch A)

Batch A wajib membuat tabel berikut:

1. `channel_registry`
2. `channel_external_refs`
3. `catalog_product`
4. `catalog_variant`
5. `catalog_variant_rate`
6. `booking_core`
7. `booking_contact`
8. `booking_party`
9. `booking_item_snapshot`
10. `payment_event`
11. `ops_booking_state`
12. `ops_assignment`
13. `ops_finance_bridge`
14. `ingest_event_log`
15. `ingest_dead_letter`
16. `unmapped_queue`
17. `migration_run_log`

## 4.3 Auxiliary Reference Tables (Batch B Support)

1. Tabel referensi berikut dibuat via template `003_seed_required_enums_and_checks.sql`:
   1. `ref_mapping_status`,
   2. `ref_ingest_status`,
   3. `ref_replay_status`,
   4. `ref_package_ref_type`,
   5. `ref_dead_letter_status`,
   6. `ref_unmapped_queue_status`.
2. Tabel referensi ini tidak mengubah baseline core table count `17/17` untuk gate Batch A.
3. Seed data tabel referensi dilakukan pada Batch B.

## 4.1 Physical Placement (Transition Lock)

1. Untuk fase transisi phase-2, seluruh 17 tabel Batch A dibuat di `ops_db`.
2. `channel_db` tidak menerima DDL baru pada batch A-B; dipakai pada fase lanjut untuk projection/read model.
3. Alasan lock ini:
   1. menjaga FK/constraint tetap executable pada baseline aktif,
   2. menjaga migration rerun tetap idempotent tanpa split orchestrasi lintas DB.
4. Saat split fisik ke `channel_db` pada fase lanjut:
   1. integritas lintas domain dijaga via API/reconciliation,
   2. tidak memakai cross-db foreign key.

## 4.2 Out-of-Scope Entities (Schema v1)

1. Entitas berikut tidak termasuk schema target v1:
   1. `catalog_media`,
   2. `catalog_itinerary`,
   3. `finance_item`,
   4. `booking_email_link`.
2. Data untuk entitas di atas tetap dipertahankan di source legacy selama fase transisi.
3. Bila butuh tindak lanjut manual saat migration:
   1. simpan issue ke `unmapped_queue`,
   2. simpan detail payload ke field raw payload domain terkait.

## 5. DDL Contract (Canonical)

### 5.1 Channel and Mapping

```sql
create table if not exists channel_registry (
  channel_code varchar(32) primary key,
  channel_name varchar(128) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists channel_external_refs (
  external_ref_key uuid primary key,
  entity_type varchar(32) not null,
  entity_key uuid not null,
  channel_code varchar(32) not null references channel_registry(channel_code),
  external_ref_kind varchar(64) not null,
  external_ref varchar(128) not null,
  source_system varchar(32) not null,
  source_table varchar(64) not null,
  source_pk varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, channel_code, external_ref_kind, external_ref)
);
```

### 5.2 Catalog

```sql
create table if not exists catalog_product (
  product_key uuid primary key,
  slug varchar(191) not null unique,
  name varchar(255) not null,
  product_category varchar(128),
  short_description text,
  description text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  thumbnail_url text,
  color_code varchar(32),
  priority integer,
  country_code varchar(2) not null default 'ID',
  region varchar(128),
  base_meeting_point text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog_variant (
  variant_key uuid primary key,
  product_key uuid not null references catalog_product(product_key),
  code varchar(64) not null,
  name varchar(255) not null,
  service_type varchar(32) not null,
  duration_days integer not null,
  duration_nights integer,
  min_pax integer not null default 1,
  max_pax integer,
  currency_code varchar(3) not null default 'USD',
  is_default boolean not null default false,
  is_active boolean not null default true,
  booking_cutoff_hours integer not null default 24,
  cancellation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_key, code)
);

create table if not exists catalog_variant_rate (
  variant_rate_key uuid primary key,
  variant_key uuid not null references catalog_variant(variant_key),
  traveler_type varchar(16) not null,
  currency_code varchar(3) not null default 'USD',
  price numeric(12,2) not null,
  min_quantity integer,
  max_quantity integer,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.3 Booking Core

```sql
create table if not exists booking_core (
  booking_key uuid primary key,
  channel_code varchar(32) not null references channel_registry(channel_code),
  source_enum_compat varchar(32),
  external_booking_ref varchar(128) not null,
  booking_created_at timestamptz not null,
  booking_date date,
  tour_date date not null,
  tour_time time,
  currency_code varchar(3) not null default 'USD',
  total_price numeric(12,2) not null default 0,
  number_of_adult integer not null default 0,
  number_of_child integer not null default 0,
  customer_payment_status varchar(32) not null,
  ops_fulfillment_status varchar(32) not null,
  package_ref_type varchar(32) not null,
  package_ref_key uuid,
  legacy_package_id bigint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_code, external_booking_ref)
);

create table if not exists booking_contact (
  booking_key uuid primary key references booking_core(booking_key),
  main_name varchar(191),
  main_email varchar(191),
  phone varchar(64),
  pickup_location text,
  meeting_point text,
  is_placeholder_name boolean not null default false,
  is_placeholder_email boolean not null default false,
  updated_from_source varchar(32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists booking_party (
  booking_key uuid primary key references booking_core(booking_key),
  adult_qty integer not null default 0,
  child_qty integer not null default 0,
  infant_qty integer not null default 0,
  traveler_rows jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists booking_item_snapshot (
  booking_item_key uuid primary key,
  booking_key uuid not null references booking_core(booking_key),
  variant_key uuid references catalog_variant(variant_key),
  variant_external_id varchar(128),
  departure_external_id varchar(128),
  currency_code varchar(3) not null default 'USD',
  adult_qty integer not null default 0,
  child_qty integer not null default 0,
  infant_qty integer not null default 0,
  adult_unit_price numeric(12,2) not null default 0,
  child_unit_price numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  snapshot_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.4 Payment + Ops Bridge

```sql
create table if not exists payment_event (
  payment_key uuid primary key,
  booking_key uuid not null references booking_core(booking_key),
  payment_time timestamptz not null,
  amount numeric(12,2) not null,
  currency_code varchar(3) not null default 'USD',
  method varchar(32),
  gateway varchar(64),
  gateway_order_id varchar(128),
  gateway_capture_id varchar(128),
  payment_ref varchar(128),
  status_raw varchar(64),
  payment_status_v2 varchar(64),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_ref)
);

create table if not exists ops_booking_state (
  booking_key uuid primary key references booking_core(booking_key),
  ops_fulfillment_status varchar(32) not null,
  assigned_driver_id integer,
  assigned_partner_id integer,
  assigned_at timestamptz,
  is_paid_flag boolean not null default false,
  paid_at timestamptz,
  state_version integer not null default 1,
  updated_from_source varchar(32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops_assignment (
  assignment_key uuid primary key,
  booking_key uuid not null references booking_core(booking_key),
  driver_id integer,
  partner_id integer,
  assignment_source varchar(32) not null,
  assigned_at timestamptz not null,
  unassigned_at timestamptz,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops_finance_bridge (
  finance_bridge_key uuid primary key,
  booking_key uuid not null references booking_core(booking_key),
  booking_finance_id bigint,
  pattern_id bigint,
  validated_at timestamptz,
  is_locked boolean not null default false,
  settlement_status varchar(32),
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_key)
);
```

### 5.5 Ingestion, Queue, and Migration Log

```sql
create table if not exists ingest_event_log (
  event_key uuid primary key,
  idempotency_key varchar(128) not null,
  nonce varchar(128) not null,
  source_enum varchar(32) not null,
  channel_code varchar(32) not null references channel_registry(channel_code),
  external_booking_ref varchar(128) not null,
  event_type varchar(32) not null,
  event_time timestamptz not null,
  event_time_normalized timestamptz not null,
  payload_hash varchar(64) not null,
  signature_verified boolean not null default false,
  process_status varchar(32) not null,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  request_received_at timestamptz not null default now(),
  processed_at timestamptz,
  raw_payload jsonb not null,
  error_message text,
  created_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (source_enum, external_booking_ref, event_type, event_time_normalized)
);

create table if not exists ingest_dead_letter (
  dead_letter_key uuid primary key,
  event_key uuid not null references ingest_event_log(event_key),
  reason_code varchar(64) not null,
  reason_detail text,
  poison_message boolean not null default false,
  replay_count integer not null default 0,
  status varchar(32) not null default 'OPEN',
  first_failed_at timestamptz not null,
  last_failed_at timestamptz not null,
  next_replay_at timestamptz,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists unmapped_queue (
  queue_key uuid primary key,
  queue_type varchar(64) not null,
  channel_code varchar(32) references channel_registry(channel_code),
  source_system varchar(32) not null,
  source_table varchar(64) not null,
  source_pk varchar(128) not null,
  reason_code varchar(64) not null,
  reason_detail text,
  status varchar(32) not null default 'OPEN',
  payload jsonb,
  resolved_by varchar(128),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists migration_run_log (
  run_key uuid primary key,
  batch_code varchar(16) not null,
  script_name varchar(191) not null,
  script_checksum varchar(64) not null,
  run_status varchar(32) not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  rows_affected bigint,
  report_path text,
  error_message text,
  created_at timestamptz not null default now()
);
```

## 6. Index Contract (Minimum)

1. `channel_external_refs(entity_type, channel_code, external_ref_kind, external_ref)` unique.
2. `booking_core(channel_code, external_booking_ref)` unique.
3. `booking_core(tour_date)`.
4. `booking_core(customer_payment_status, ops_fulfillment_status)`.
5. `payment_event(booking_key, payment_time desc)`.
6. `ops_assignment(booking_key, is_active)`.
7. `ingest_event_log(process_status, next_retry_at)`.
8. `ingest_event_log(nonce, request_received_at desc)`.
9. `ingest_dead_letter(status, last_failed_at)`.
10. `unmapped_queue(status, queue_type, created_at)`.

## 7. Compatibility Rules (package_id Polymorphic)

1. Field legacy `package_id` boleh tetap dikirim di API compatibility.
2. Canonical wajib selalu kirim:
   1. `packageRefType` (`LEGACY_PACKAGE` | `CATALOG_PRODUCT` | `CATALOG_VARIANT`),
   2. `packageRefKey` (UUID canonical, nullable hanya jika `LEGACY_PACKAGE` belum ter-map),
   3. `legacyPackageId` (raw integer legacy bila ada).
3. `packageRefType` wajib non-null di `booking_core`.

Sunset:

1. `LEGACY_PACKAGE` tanpa `packageRefKey` ditargetkan 0 pada 2026-09-30.
2. Setelah target tercapai, `package_id` dikeluarkan dari contract `v2`.

## 8. Relasi ke Dokumen Lain

1. `prep-phase2-migration-blueprint` Batch A wajib mengikuti daftar tabel di dokumen ini.
2. `prep-migration-matrix` mapping field wajib memakai nama tabel ini (`ops_booking_state`, `ops_finance_bridge`).
3. `prep-api-contract-v1` wajib merujuk policy discriminator `packageRefType`.

## 9. Queue Status Dictionary and Transitions (Locked)

1. `ingest_dead_letter.status` canonical:
   1. `OPEN`,
   2. `READY`,
   3. `REPLAYING`,
   4. `SUCCEEDED`,
   5. `FAILED`,
   6. `RESOLVED`,
   7. `CLOSED`.
2. Transisi `ingest_dead_letter.status` yang diizinkan:
   1. `OPEN` -> `READY` | `RESOLVED` | `CLOSED`,
   2. `READY` -> `REPLAYING`,
   3. `REPLAYING` -> `SUCCEEDED` | `FAILED` | `READY`,
   4. `FAILED` -> `READY` | `RESOLVED` | `CLOSED`,
   5. `SUCCEEDED` -> `CLOSED`,
   6. `RESOLVED` -> `CLOSED`,
   7. `CLOSED` terminal.
3. `unmapped_queue.status` canonical:
   1. `OPEN`,
   2. `IN_REVIEW`,
   3. `RESOLVED`,
   4. `CLOSED`.
4. Transisi `unmapped_queue.status` yang diizinkan:
   1. `OPEN` -> `IN_REVIEW` | `RESOLVED` | `CLOSED`,
   2. `IN_REVIEW` -> `OPEN` | `RESOLVED` | `CLOSED`,
   3. `RESOLVED` -> `CLOSED`,
   4. `CLOSED` terminal.
5. Retention cleanup wajib mengacu pada state dictionary ini.
6. Enforcement runtime:
   1. status `ingest_dead_letter` dan `unmapped_queue` wajib dijaga dengan check constraints di migration template.
