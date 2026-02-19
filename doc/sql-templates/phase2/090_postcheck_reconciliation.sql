-- Phase-2 Postcheck Template
-- Run after each batch (adjust table names if module-specific)

-- 1) Critical null checks
select count(*) as booking_core_null_identity
from booking_core
where channel_code is null
   or external_booking_ref is null;

-- 2) Duplicate identity checks
select channel_code, external_booking_ref, count(*) as total_rows
from booking_core
group by channel_code, external_booking_ref
having count(*) > 1;

-- 3) Payment orphan check
select count(*) as payment_orphan_rows
from payment_event p
left join booking_core b on b.booking_key = p.booking_key
where b.booking_key is null;

-- 4) Ops vs payment drift check
select count(*) as ops_done_not_paid
from booking_core
where ops_fulfillment_status = 'DONE'
  and customer_payment_status <> 'PAID';

-- 5) Ingest duplicate dedup key check
select source_enum, external_booking_ref, event_type, event_time_normalized, count(*) as total_rows
from ingest_event_log
group by source_enum, external_booking_ref, event_type, event_time_normalized
having count(*) > 1;

-- 6) Unmapped queue ratio (automatic denominator)
with catalog_total as (
  select
    (
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
  u.unmapped_rows,
  c.total_catalog_entities,
  case
    when c.total_catalog_entities = 0 then null
    else round((u.unmapped_rows / c.total_catalog_entities) * 100, 2)
  end as unmapped_ratio_percent,
  case
    when c.total_catalog_entities = 0 then 'FAIL_DENOMINATOR_ZERO'
    when round((u.unmapped_rows / c.total_catalog_entities) * 100, 2) <= 5 then 'PASS'
    else 'FAIL_RATIO_EXCEEDS_5_PERCENT'
  end as c02_gate_status
from unmapped_total u
cross join catalog_total c;
