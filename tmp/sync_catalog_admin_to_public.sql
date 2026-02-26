begin;

create extension if not exists dblink;

with src as (
  select *
  from dblink(
    'host=192.168.0.60 port=5432 dbname=balisnaptrip_admin user=bonk password=bst',
    $$
      select
        slug,
        name,
        short_description,
        description,
        product_category,
        country_code,
        region,
        base_meeting_point,
        is_featured,
        is_active,
        thumbnail_url,
        color_code,
        priority,
        created_at,
        updated_at
      from catalog_product
      where slug not like 'smoke-catalog-item-%'
    $$
  ) as s(
    slug text,
    name text,
    short_description text,
    description text,
    product_category text,
    country_code varchar(2),
    region text,
    base_meeting_point text,
    is_featured boolean,
    is_active boolean,
    thumbnail_url text,
    color_code text,
    priority integer,
    created_at timestamptz,
    updated_at timestamptz
  )
)
insert into "TourProduct" (
  slug,
  product_name,
  short_description,
  description,
  category,
  country_code,
  region,
  base_meeting_point,
  is_featured,
  is_active,
  thumbnail_url,
  color_code,
  priority,
  created_at,
  updated_at
)
select
  src.slug,
  src.name,
  src.short_description,
  src.description,
  src.product_category,
  src.country_code,
  src.region,
  src.base_meeting_point,
  coalesce(src.is_featured, false),
  coalesce(src.is_active, true),
  src.thumbnail_url,
  src.color_code,
  case
    when src.priority is null then null
    when src.priority > 32767 then 32767
    when src.priority < -32768 then -32768
    else src.priority
  end::smallint,
  src.created_at::timestamp,
  src.updated_at::timestamp
from src
on conflict (slug) do update
set
  product_name = excluded.product_name,
  short_description = excluded.short_description,
  description = excluded.description,
  category = excluded.category,
  country_code = excluded.country_code,
  region = excluded.region,
  base_meeting_point = excluded.base_meeting_point,
  is_featured = excluded.is_featured,
  is_active = excluded.is_active,
  thumbnail_url = excluded.thumbnail_url,
  color_code = excluded.color_code,
  priority = excluded.priority,
  updated_at = excluded.updated_at;

with src as (
  select *
  from dblink(
    'host=192.168.0.60 port=5432 dbname=balisnaptrip_admin user=bonk password=bst',
    $$
      select
        p.slug,
        v.code,
        v.name,
        v.service_type,
        v.duration_days,
        v.duration_nights,
        v.min_pax,
        v.max_pax,
        v.currency_code,
        v.is_default,
        v.is_active,
        v.booking_cutoff_hours,
        v.cancellation_policy,
        v.created_at,
        v.updated_at
      from catalog_variant v
      join catalog_product p
        on p.product_key = v.product_key
      where p.slug not like 'smoke-catalog-item-%'
    $$
  ) as s(
    slug text,
    code text,
    name text,
    service_type text,
    duration_days integer,
    duration_nights integer,
    min_pax integer,
    max_pax integer,
    currency_code varchar(3),
    is_default boolean,
    is_active boolean,
    booking_cutoff_hours integer,
    cancellation_policy text,
    created_at timestamptz,
    updated_at timestamptz
  )
), mapped as (
  select
    tp.product_id,
    src.code,
    src.name,
    case
      when upper(src.service_type) in ('PRIVATE', 'SHARED', 'CUSTOM') then upper(src.service_type)
      else 'PRIVATE'
    end as service_type_norm,
    src.duration_days,
    src.duration_nights,
    src.min_pax,
    src.max_pax,
    src.currency_code,
    src.is_default,
    src.is_active,
    src.booking_cutoff_hours,
    src.cancellation_policy,
    src.created_at,
    src.updated_at
  from src
  join "TourProduct" tp
    on tp.slug = src.slug
)
insert into "TourVariant" (
  product_id,
  variant_code,
  variant_name,
  service_type,
  duration_days,
  duration_nights,
  min_pax,
  max_pax,
  currency_code,
  is_default,
  is_active,
  booking_cutoff_hours,
  cancellation_policy,
  created_at,
  updated_at
)
select
  mapped.product_id,
  mapped.code,
  mapped.name,
  mapped.service_type_norm::"TourServiceType",
  greatest(1, coalesce(mapped.duration_days, 1)),
  mapped.duration_nights,
  greatest(1, coalesce(mapped.min_pax, 1)),
  mapped.max_pax,
  coalesce(mapped.currency_code, 'USD'),
  coalesce(mapped.is_default, false),
  coalesce(mapped.is_active, true),
  greatest(0, coalesce(mapped.booking_cutoff_hours, 24)),
  mapped.cancellation_policy,
  mapped.created_at::timestamp,
  mapped.updated_at::timestamp
from mapped
on conflict (product_id, variant_code) do update
set
  variant_name = excluded.variant_name,
  service_type = excluded.service_type,
  duration_days = excluded.duration_days,
  duration_nights = excluded.duration_nights,
  min_pax = excluded.min_pax,
  max_pax = excluded.max_pax,
  currency_code = excluded.currency_code,
  is_default = excluded.is_default,
  is_active = excluded.is_active,
  booking_cutoff_hours = excluded.booking_cutoff_hours,
  cancellation_policy = excluded.cancellation_policy,
  updated_at = excluded.updated_at;

create temp table tmp_rate_sync as
with src as (
  select *
  from dblink(
    'host=192.168.0.60 port=5432 dbname=balisnaptrip_admin user=bonk password=bst',
    $$
      select
        p.slug,
        v.code,
        r.traveler_type,
        r.currency_code,
        r.price,
        r.is_active,
        r.created_at,
        r.updated_at
      from catalog_variant_rate r
      join catalog_variant v
        on v.variant_key = r.variant_key
      join catalog_product p
        on p.product_key = v.product_key
      where p.slug not like 'smoke-catalog-item-%'
    $$
  ) as s(
    slug text,
    code text,
    traveler_type text,
    currency_code varchar(3),
    price numeric,
    is_active boolean,
    created_at timestamptz,
    updated_at timestamptz
  )
)
select
  tv.variant_id,
  case
    when upper(src.traveler_type) in ('ADULT', 'CHILD', 'INFANT') then upper(src.traveler_type)
    else 'ADULT'
  end as traveler_type,
  coalesce(src.currency_code, 'USD') as currency_code,
  coalesce(src.price, 0)::numeric as price,
  coalesce(src.is_active, true) as is_active,
  src.created_at::timestamp as created_at,
  src.updated_at::timestamp as updated_at
from src
join "TourProduct" tp
  on tp.slug = src.slug
join "TourVariant" tv
  on tv.product_id = tp.product_id
 and tv.variant_code = src.code;

update "VariantRatePlan" vr
set
  price = s.price,
  currency_code = s.currency_code,
  is_active = s.is_active,
  updated_at = s.updated_at
from tmp_rate_sync s
where vr.variant_id = s.variant_id
  and vr.traveler_type = s.traveler_type::"TravelerType"
  and vr.valid_from is null
  and vr.valid_to is null
  and vr.season_start is null
  and vr.season_end is null;

insert into "VariantRatePlan" (
  variant_id,
  traveler_type,
  price,
  currency_code,
  is_active,
  created_at,
  updated_at
)
select
  s.variant_id,
  s.traveler_type::"TravelerType",
  s.price,
  s.currency_code,
  s.is_active,
  s.created_at,
  s.updated_at
from tmp_rate_sync s
where not exists (
  select 1
  from "VariantRatePlan" vr
  where vr.variant_id = s.variant_id
    and vr.traveler_type = s.traveler_type::"TravelerType"
    and vr.valid_from is null
    and vr.valid_to is null
    and vr.season_start is null
    and vr.season_end is null
);

commit;
