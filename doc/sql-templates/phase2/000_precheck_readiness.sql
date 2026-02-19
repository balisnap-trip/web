-- Phase-2 Precheck Template
-- Run before batch A/B execution.

-- 0) Environment baseline
select
  current_database() as database_name,
  current_setting('server_version') as server_version,
  current_setting('TimeZone') as timezone;

-- 1) Long transaction guard (target: PASS, count = 0)
with long_txn as (
  select pid
  from pg_stat_activity
  where xact_start is not null
    and now() - xact_start > interval '15 minutes'
)
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as precheck_long_txn_status,
  count(*) as long_txn_count
from long_txn;

-- 2) Blocking lock guard (target: PASS, count = 0)
with blocking_pairs as (
  select
    blocked.pid as blocked_pid,
    blocker.pid as blocker_pid
  from pg_locks blocked
  join pg_locks blocker
    on blocked.locktype = blocker.locktype
   and blocked.database is not distinct from blocker.database
   and blocked.relation is not distinct from blocker.relation
   and blocked.page is not distinct from blocker.page
   and blocked.tuple is not distinct from blocker.tuple
   and blocked.virtualxid is not distinct from blocker.virtualxid
   and blocked.transactionid is not distinct from blocker.transactionid
   and blocked.classid is not distinct from blocker.classid
   and blocked.objid is not distinct from blocker.objid
   and blocked.objsubid is not distinct from blocker.objsubid
   and blocked.pid <> blocker.pid
  where not blocked.granted
    and blocker.granted
)
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as precheck_blocking_lock_status,
  count(*) as blocking_pair_count
from blocking_pairs;

-- 3) Existing target table visibility (informational)
with target_tables(table_name) as (
  values
    ('channel_registry'),
    ('channel_external_refs'),
    ('catalog_product'),
    ('catalog_variant'),
    ('catalog_variant_rate'),
    ('booking_core'),
    ('booking_contact'),
    ('booking_party'),
    ('booking_item_snapshot'),
    ('payment_event'),
    ('ops_booking_state'),
    ('ops_assignment'),
    ('ops_finance_bridge'),
    ('ingest_event_log'),
    ('ingest_dead_letter'),
    ('unmapped_queue'),
    ('migration_run_log')
)
select
  t.table_name,
  case
    when i.table_name is null then 'MISSING_OK'
    else 'ALREADY_EXISTS_OK'
  end as table_state
from target_tables t
left join information_schema.tables i
  on i.table_schema = 'public'
 and i.table_name = t.table_name
order by t.table_name;

-- 4) Capacity guard (target: PASS, free storage >= 30%)
-- Input required:
-- - ganti nilai null di bawah dengan angka aktual (bytes) dari monitoring host/volume DB.
with storage_input as (
  select
    null::numeric as disk_total_bytes,
    null::numeric as disk_used_bytes
),
storage_calc as (
  select
    disk_total_bytes,
    disk_used_bytes,
    case
      when disk_total_bytes is null or disk_used_bytes is null then null
      else greatest(disk_total_bytes - disk_used_bytes, 0)
    end as disk_free_bytes
  from storage_input
)
select
  pg_database_size(current_database()) as current_database_bytes,
  disk_total_bytes,
  disk_used_bytes,
  disk_free_bytes,
  case
    when disk_total_bytes is null or disk_used_bytes is null then null
    when disk_total_bytes <= 0 then null
    else round((disk_free_bytes / disk_total_bytes) * 100, 2)
  end as free_percent,
  case
    when disk_total_bytes is null or disk_used_bytes is null then 'FAIL_INPUT_REQUIRED'
    when disk_total_bytes <= 0 then 'FAIL_INVALID_TOTAL_BYTES'
    when round((disk_free_bytes / disk_total_bytes) * 100, 2) >= 30 then 'PASS'
    else 'FAIL_FREE_LT_30_PERCENT'
  end as precheck_storage_status
from storage_calc;
