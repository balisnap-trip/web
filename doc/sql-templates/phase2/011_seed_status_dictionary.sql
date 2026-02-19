-- Phase-2 Batch B
-- Template: status dictionary seed

begin;

insert into ref_mapping_status (status_code, status_label)
values
  ('UNMAPPED', 'Waiting Mapping'),
  ('MAPPED', 'Mapped'),
  ('REVIEW_REQUIRED', 'Needs Manual Review')
on conflict (status_code) do update
set
  status_label = excluded.status_label,
  updated_at = now();

insert into ref_ingest_status (status_code, status_label)
values
  ('RECEIVED', 'Received'),
  ('PROCESSING', 'Processing'),
  ('DONE', 'Done'),
  ('FAILED', 'Failed')
on conflict (status_code) do update
set
  status_label = excluded.status_label,
  updated_at = now();

insert into ref_replay_status (status_code, status_label)
values
  ('READY', 'Ready to Replay'),
  ('REPLAYING', 'Replay in Progress'),
  ('SUCCEEDED', 'Replay Succeeded'),
  ('FAILED', 'Replay Failed')
on conflict (status_code) do update
set
  status_label = excluded.status_label,
  updated_at = now();

insert into ref_dead_letter_status (status_code, status_label)
values
  ('OPEN', 'Open'),
  ('READY', 'Ready to Replay'),
  ('REPLAYING', 'Replay in Progress'),
  ('SUCCEEDED', 'Replay Succeeded'),
  ('FAILED', 'Replay Failed'),
  ('RESOLVED', 'Resolved Manually'),
  ('CLOSED', 'Closed')
on conflict (status_code) do update
set
  status_label = excluded.status_label,
  updated_at = now();

insert into ref_unmapped_queue_status (status_code, status_label)
values
  ('OPEN', 'Open'),
  ('IN_REVIEW', 'In Review'),
  ('RESOLVED', 'Resolved'),
  ('CLOSED', 'Closed')
on conflict (status_code) do update
set
  status_label = excluded.status_label,
  updated_at = now();

commit;
