-- Preserve reservation-product metadata and per-date freshness at the public read boundary.
-- Apply after notification_rpc_and_rls.sql. The crawler also adds these columns
-- through ensure_extra_schema so a migration and a crawler run can be deployed separately.

begin;

alter table if exists public.facilities add column if not exists reservation_type text not null default 'unknown';
alter table if exists public.facilities add column if not exists reservation_type_label text not null default '유형 확인 필요';
alter table if exists public.facilities add column if not exists application_status text not null default 'unknown';
alter table if exists public.facilities add column if not exists application_status_label text not null default '상태 확인 필요';
alter table if exists public.facilities add column if not exists application_start_date date;
alter table if exists public.facilities add column if not exists application_end_date date;
alter table if exists public.facilities add column if not exists use_start_date date;
alter table if exists public.facilities add column if not exists use_end_date date;
alter table if exists public.facilities add column if not exists source_url text;
alter table if exists public.facilities add column if not exists metadata_checked_at timestamptz;

alter table if exists public.availability_cache add column if not exists query_status text not null default 'success';
alter table if exists public.availability_cache add column if not exists availability_status text not null default 'unknown';
alter table if exists public.availability_cache add column if not exists checked_at timestamptz;

update public.availability_cache
   set checked_at = coalesce(checked_at, updated_at),
       availability_status = case
         when jsonb_typeof(slots_json) <> 'array' then 'confirmed_empty'
         when jsonb_array_length(slots_json) > 0 then 'available'
         else 'confirmed_empty'
       end
 where checked_at is null or availability_status = 'unknown';

create or replace function public.get_public_data(p_days_ahead integer default 45)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with
rng as (
  select
    (now() at time zone 'Asia/Seoul')::date as d0,
    ((now() at time zone 'Asia/Seoul')::date + (greatest(0, p_days_ahead) || ' days')::interval)::date as d1
),
fac_json as (
  select coalesce(
    jsonb_object_agg(
      f.facility_id,
      jsonb_build_object(
        'title', f.title,
        'location', coalesce(f.location, ''),
        'reservation_type', coalesce(f.reservation_type, 'unknown'),
        'reservation_type_label', coalesce(f.reservation_type_label, '유형 확인 필요'),
        'application_status', coalesce(f.application_status, 'unknown'),
        'application_status_label', coalesce(f.application_status_label, '상태 확인 필요'),
        'application_start_date', f.application_start_date,
        'application_end_date', f.application_end_date,
        'use_start_date', f.use_start_date,
        'use_end_date', f.use_end_date,
        'source_url', f.source_url,
        'metadata_checked_at', f.metadata_checked_at,
        'updated_at', f.updated_at
      )
    ),
    '{}'::jsonb
  ) as j
  from public.facilities f
),
av as (
  select
    a.facility_id,
    to_char(a.date_ymd, 'YYYYMMDD') as ymd,
    a.slots_json,
    a.updated_at,
    a.query_status,
    a.availability_status,
    coalesce(a.checked_at, a.updated_at) as checked_at
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
meta_json as (
  select coalesce(
    jsonb_object_agg(facility_id, by_fac),
    '{}'::jsonb
  ) as j
  from (
    select
      facility_id,
      jsonb_object_agg(
        ymd,
        jsonb_build_object(
          'query_status', coalesce(query_status, 'unknown'),
          'availability_status', coalesce(availability_status, 'unknown'),
          'checked_at', checked_at,
          'updated_at', updated_at
        )
      ) as by_fac
    from av
    group by facility_id
  ) t
),
mx as (select max(checked_at) as m from av)
select jsonb_build_object(
  'updated_at', (select m from mx),
  'facilities', (select j from fac_json),
  'availability', (select j from av_json),
  'availability_meta', (select j from meta_json)
);
$function$;

grant execute on function public.get_public_data(integer) to anon, authenticated, service_role;

commit;
