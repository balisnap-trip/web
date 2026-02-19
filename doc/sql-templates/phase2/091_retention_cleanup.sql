-- Phase-2 Retention Cleanup Template
-- Recommended schedule: run daily via cron/job runner.
-- Policy lock:
-- - Nonce replay window: 10 minutes (enforced by query window at runtime)
-- - Idempotency retention: 35 days
-- - DLQ retention: 30 days

begin;

with deleted_dead_letter as (
  delete from ingest_dead_letter d
  where d.updated_at < now() - interval '30 days'
    and d.status in ('RESOLVED', 'SUCCEEDED', 'CLOSED', 'FAILED')
  returning 1
),
deleted_ingest as (
  delete from ingest_event_log l
  where l.created_at < now() - interval '35 days'
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
    and u.updated_at < now() - interval '90 days'
  returning 1
)
select
  (select count(*) from deleted_ingest) as deleted_ingest_event_log_rows,
  (select count(*) from deleted_dead_letter) as deleted_dead_letter_rows,
  (select count(*) from deleted_unmapped) as deleted_unmapped_rows;

commit;
