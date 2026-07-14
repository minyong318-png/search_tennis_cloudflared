-- PREVIEW ONLY. Do not apply until frontend notification writes are moved behind a trusted server/RPC path.
-- Goal: stop exposing raw public tables to anon/authenticated while preserving public read via get_public_data.

begin;

-- Public read tables: intended future shape.
-- get_public_data must be the public read boundary before raw table grants are revoked.
alter function public.get_public_data(integer)
  security definer
  set search_path = public, pg_temp;
grant execute on function public.get_public_data(integer) to anon, authenticated;

alter table public.facilities enable row level security;
alter table public.availability_cache enable row level security;
alter table public.slots_snapshot enable row level security;

revoke all on table public.facilities from anon, authenticated;
revoke all on table public.availability_cache from anon, authenticated;
revoke all on table public.slots_snapshot from anon, authenticated;
grant select, insert, update, delete on table public.facilities to service_role;
grant select, insert, update, delete on table public.availability_cache to service_role;
grant select, insert, update, delete on table public.slots_snapshot to service_role;

-- Tournament tables are already RLS-enabled and service-role only; keep that boundary.
alter table public.daehoe_tournaments enable row level security;
alter table public.daehoe_sync_state enable row level security;
revoke all on table public.daehoe_tournaments from anon, authenticated;
revoke all on table public.daehoe_sync_state from anon, authenticated;
grant select, insert, update, delete on table public.daehoe_tournaments to service_role;
grant select, insert, update, delete on table public.daehoe_sync_state to service_role;

-- Notification tables currently have browser direct-write dependencies.
-- Do NOT apply restrictive RLS to these until Pages/index.html no longer writes them directly.
-- Tables: push_subscriptions, alarms, baseline_slots, sent_slots.

rollback;

