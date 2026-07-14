-- Schema snapshot before Supabase cleanup planning.
-- Generated from live project fqrvdwfyemdpalvtvccl on 2026-07-14.
-- Data rows, secrets, push endpoint values, and connection strings are intentionally excluded.

create table if not exists public.facilities (
  facility_id text primary key,
  title text not null,
  location text,
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_cache (
  facility_id text not null references public.facilities(facility_id) on delete cascade,
  date_ymd date not null,
  slots_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (facility_id, date_ymd)
);
create index if not exists idx_avcache_date on public.availability_cache(date_ymd);

create table if not exists public.slots_snapshot (
  facility_id text not null,
  date_ymd date not null,
  slot_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (facility_id, date_ymd, slot_key)
);
create index if not exists idx_slots_snapshot_fac_date on public.slots_snapshot(facility_id, date_ymd);

create table if not exists public.push_subscriptions (
  id text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp default now()
);

create table if not exists public.alarms (
  id integer primary key,
  subscription_id text not null,
  court_group text not null,
  date text not null,
  created_at timestamp default now(),
  time_mode text not null default 'any'::text,
  time_hour integer
);
create unique index if not exists uniq_alarms_subscription_court_date_time
  on public.alarms(subscription_id, court_group, date, time_mode, coalesce(time_hour, -1));

create table if not exists public.baseline_slots (
  id integer primary key,
  subscription_id text not null,
  court_group text not null,
  date char not null,
  time_content text not null,
  created_at timestamp default now()
);
create unique index if not exists baseline_slots_subscription_id_court_group_date_time_conten_key
  on public.baseline_slots(subscription_id, court_group, date, time_content);

create table if not exists public.sent_slots (
  subscription_id text not null,
  slot_key text not null,
  sent_at timestamp default now(),
  primary key (subscription_id, slot_key)
);

create table if not exists public.push_endpoints (
  user_id text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id bigint primary key,
  user_id text not null,
  facility_id text not null,
  facility_name text,
  date_ymd date not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_subscriptions_fac_date
  on public.subscriptions(facility_id, date_ymd) where enabled = true;

create table if not exists public.sent_log (
  user_id text not null,
  facility_id text not null,
  date_ymd date not null,
  slot_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, facility_id, date_ymd, slot_key)
);

create table if not exists public.daehoe_tournaments (
  id text primary key,
  source_type text not null,
  source_id text,
  start_date date,
  end_date date,
  active boolean not null default true,
  sync_status text not null default 'seen'::text,
  payload jsonb not null,
  crawled_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists daehoe_tournaments_active_date_idx
  on public.daehoe_tournaments(active, start_date, end_date);
create index if not exists daehoe_tournaments_source_idx
  on public.daehoe_tournaments(source_type, source_id);

create table if not exists public.daehoe_sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.get_public_data(p_days_ahead integer default 45)
returns jsonb
language sql
stable
as $function$
with
rng as (
  select
    (now() at time zone 'Asia/Seoul')::date as d0,
    ((now() at time zone 'Asia/Seoul')::date + (p_days_ahead || ' days')::interval)::date as d1
),
fac_json as (
  select coalesce(
    jsonb_object_agg(f.facility_id, jsonb_build_object('title', f.title, 'location', coalesce(f.location,''))),
    '{}'::jsonb
  ) as j
  from public.facilities f
),
av as (
  select
    a.facility_id,
    to_char(a.date_ymd, 'YYYYMMDD') as ymd,
    a.slots_json,
    a.updated_at
  from public.availability_cache a, rng
  where a.date_ymd between rng.d0 and rng.d1
),
av_json as (
  select coalesce(
    jsonb_object_agg(facility_id, by_fac),
    '{}'::jsonb
  ) as j
  from (
    select
      facility_id,
      jsonb_object_agg(ymd, coalesce(slots_json, '[]'::jsonb)) as by_fac
    from av
    group by facility_id
  ) t
),
mx as (select max(updated_at) as m from av)
select jsonb_build_object(
  'updated_at', (select m from mx),
  'facilities', (select j from fac_json),
  'availability', (select j from av_json)
);
$function$;

