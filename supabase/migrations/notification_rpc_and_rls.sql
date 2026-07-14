-- Final Supabase cleanup migration for court availability public access.
-- Applies RPC boundaries for public reads and browser notification actions,
-- then removes raw-table access from anon/authenticated roles.

begin;

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

create or replace function public.register_push_subscription(
  p_subscription_id text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(length(trim(p_subscription_id)), 0) < 16 then
    raise exception 'invalid subscription id';
  end if;
  if coalesce(length(trim(p_endpoint)), 0) < 20
     or coalesce(length(trim(p_p256dh)), 0) < 10
     or coalesce(length(trim(p_auth)), 0) < 6 then
    raise exception 'invalid push subscription';
  end if;

  insert into public.push_subscriptions (id, endpoint, p256dh, auth)
  values (p_subscription_id, p_endpoint, p_p256dh, p_auth)
  on conflict (id) do update set
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth = excluded.auth;

  return p_subscription_id;
end;
$function$;

create or replace function public.add_alarm_rpc(
  p_subscription_id text,
  p_court_group text,
  p_date text,
  p_time_mode text default 'any',
  p_time_hour integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_time_mode text := coalesce(nullif(p_time_mode, ''), 'any');
begin
  if coalesce(length(trim(p_subscription_id)), 0) < 16 then
    raise exception 'invalid subscription id';
  end if;
  if coalesce(length(trim(p_court_group)), 0) = 0 then
    raise exception 'court group is required';
  end if;
  if p_date !~ '^\d{8}$' and p_date !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid date';
  end if;
  if v_time_mode not in ('any', 'before', 'after', 'contains') then
    v_time_mode := 'any';
  end if;

  insert into public.alarms (subscription_id, court_group, date, time_mode, time_hour)
  values (p_subscription_id, p_court_group, p_date, v_time_mode, p_time_hour);

  return jsonb_build_object('status', 'added');
exception
  when unique_violation then
    return jsonb_build_object('status', 'duplicate');
end;
$function$;

create or replace function public.list_alarms_rpc(p_subscription_id text)
returns table (
  id integer,
  date text,
  court_group text,
  time_mode text,
  time_hour integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select a.id, a.date, a.court_group, a.time_mode, a.time_hour
    from public.alarms a
   where a.subscription_id = p_subscription_id
   order by a.date asc, a.id asc;
$function$;

create or replace function public.delete_alarm_rpc(
  p_subscription_id text,
  p_alarm_id integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  delete from public.alarms
   where id = p_alarm_id
     and subscription_id = p_subscription_id;
  return found;
end;
$function$;

revoke all on function public.get_public_data(integer) from public;
revoke all on function public.register_push_subscription(text, text, text, text) from public;
revoke all on function public.add_alarm_rpc(text, text, text, text, integer) from public;
revoke all on function public.list_alarms_rpc(text) from public;
revoke all on function public.delete_alarm_rpc(text, integer) from public;

grant execute on function public.get_public_data(integer) to anon, authenticated, service_role;
grant execute on function public.register_push_subscription(text, text, text, text) to anon, authenticated;
grant execute on function public.add_alarm_rpc(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.list_alarms_rpc(text) to anon, authenticated;
grant execute on function public.delete_alarm_rpc(text, integer) to anon, authenticated;

alter table public.facilities enable row level security;
alter table public.availability_cache enable row level security;
alter table public.slots_snapshot enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.alarms enable row level security;
alter table public.baseline_slots enable row level security;
alter table public.sent_slots enable row level security;
alter table public.daehoe_tournaments enable row level security;
alter table public.daehoe_sync_state enable row level security;

revoke all on table public.facilities from anon, authenticated;
revoke all on table public.availability_cache from anon, authenticated;
revoke all on table public.slots_snapshot from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.alarms from anon, authenticated;
revoke all on table public.baseline_slots from anon, authenticated;
revoke all on table public.sent_slots from anon, authenticated;
revoke all on table public.daehoe_tournaments from anon, authenticated;
revoke all on table public.daehoe_sync_state from anon, authenticated;

grant select, insert, update, delete on table public.facilities to service_role;
grant select, insert, update, delete on table public.availability_cache to service_role;
grant select, insert, update, delete on table public.slots_snapshot to service_role;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.alarms to service_role;
grant select, insert, update, delete on table public.baseline_slots to service_role;
grant select, insert, update, delete on table public.sent_slots to service_role;
grant select, insert, update, delete on table public.daehoe_tournaments to service_role;
grant select, insert, update, delete on table public.daehoe_sync_state to service_role;

commit;

