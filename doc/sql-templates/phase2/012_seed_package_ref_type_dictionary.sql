-- Phase-2 Batch B
-- Template: package polymorphic discriminator seed

begin;

insert into ref_package_ref_type (type_code, type_label)
values
  ('LEGACY_PACKAGE', 'Legacy package_id reference'),
  ('CATALOG_PRODUCT', 'Canonical product reference'),
  ('CATALOG_VARIANT', 'Canonical variant reference')
on conflict (type_code) do update
set
  type_label = excluded.type_label,
  updated_at = now();

commit;
