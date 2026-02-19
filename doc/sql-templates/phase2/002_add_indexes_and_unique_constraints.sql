-- Phase-2 Batch A
-- Template: indexes and unique constraints

begin;

-- Channel mapping dedup
create unique index if not exists ux_channel_external_refs_entity_channel_kind_ref
  on channel_external_refs (entity_type, channel_code, external_ref_kind, external_ref);

-- Booking identity dedup
create unique index if not exists ux_booking_core_channel_external_ref
  on booking_core (channel_code, external_booking_ref);

create index if not exists ix_booking_core_tour_date
  on booking_core (tour_date);

create index if not exists ix_booking_core_status_pair
  on booking_core (customer_payment_status, ops_fulfillment_status);

-- Catalog lookup
create unique index if not exists ux_catalog_variant_product_code
  on catalog_variant (product_key, code);

create index if not exists ix_catalog_variant_rate_variant_active
  on catalog_variant_rate (variant_key, is_active);

-- Payment lookup
create unique index if not exists ux_payment_event_payment_ref_not_null
  on payment_event (payment_ref)
  where payment_ref is not null;

create index if not exists ix_payment_event_booking_time
  on payment_event (booking_key, payment_time desc);

-- Ops lookup
create index if not exists ix_ops_assignment_booking_active
  on ops_assignment (booking_key, is_active);

create unique index if not exists ux_ops_finance_bridge_booking_key
  on ops_finance_bridge (booking_key);

-- Ingestion dedup and queue processing
create unique index if not exists ux_ingest_event_idempotency_key
  on ingest_event_log (idempotency_key);

create unique index if not exists ux_ingest_event_secondary_dedup
  on ingest_event_log (source_enum, external_booking_ref, event_type, event_time_normalized);

create index if not exists ix_ingest_event_process_retry
  on ingest_event_log (process_status, next_retry_at);

create index if not exists ix_ingest_event_nonce_received_at
  on ingest_event_log (nonce, request_received_at desc);

create index if not exists ix_ingest_event_created_at
  on ingest_event_log (created_at);

create index if not exists ix_ingest_dead_letter_status_failed_at
  on ingest_dead_letter (status, last_failed_at);

create index if not exists ix_ingest_dead_letter_updated_at
  on ingest_dead_letter (updated_at);

create index if not exists ix_unmapped_queue_status_type_created
  on unmapped_queue (status, queue_type, created_at);

-- Optional guard rails
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_booking_core_package_ref_type'
  ) then
    alter table booking_core
      add constraint ck_booking_core_package_ref_type
      check (package_ref_type in ('LEGACY_PACKAGE', 'CATALOG_PRODUCT', 'CATALOG_VARIANT'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_ingest_event_process_status'
  ) then
    alter table ingest_event_log
      add constraint ck_ingest_event_process_status
      check (process_status in ('RECEIVED', 'PROCESSING', 'DONE', 'FAILED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_ingest_dead_letter_status'
  ) then
    alter table ingest_dead_letter
      add constraint ck_ingest_dead_letter_status
      check (status in ('OPEN', 'READY', 'REPLAYING', 'SUCCEEDED', 'FAILED', 'RESOLVED', 'CLOSED'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_unmapped_queue_status'
  ) then
    alter table unmapped_queue
      add constraint ck_unmapped_queue_status
      check (status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'));
  end if;
end $$;

commit;
