-- Phase-2 Batch A
-- Template: create core bridge tables
-- Locked reference:
-- - doc/prep-core-schema-target-v1-2026-02-19.md
-- Execution lock:
-- - run on ops_db during phase-2 transition

begin;

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
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
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

commit;
