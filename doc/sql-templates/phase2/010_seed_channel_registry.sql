-- Phase-2 Batch B
-- Template: channel seed

begin;

insert into channel_registry (channel_code, channel_name, is_active)
values
  ('DIRECT', 'Direct Website', true),
  ('GYG', 'GetYourGuide', true),
  ('VIATOR', 'Viator', true),
  ('BOKUN', 'Bokun', true),
  ('TRIPDOTCOM', 'Trip.com', true),
  ('MANUAL', 'Manual Ops Input', true)
on conflict (channel_code) do update
set
  channel_name = excluded.channel_name,
  is_active = excluded.is_active,
  updated_at = now();

commit;

