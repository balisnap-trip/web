-- Phase-2 Batch A
-- Template: required dictionaries/check tables used by migration and runtime

begin;

create table if not exists ref_mapping_status (
  status_code varchar(32) primary key,
  status_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ref_ingest_status (
  status_code varchar(32) primary key,
  status_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ref_replay_status (
  status_code varchar(32) primary key,
  status_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ref_package_ref_type (
  type_code varchar(32) primary key,
  type_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ref_dead_letter_status (
  status_code varchar(32) primary key,
  status_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ref_unmapped_queue_status (
  status_code varchar(32) primary key,
  status_label varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

commit;
