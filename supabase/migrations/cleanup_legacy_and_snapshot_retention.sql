-- Final destructive cleanup after usage audit and RPC/RLS migration.
-- Safe scope:
-- - remove test/deprecated empty notification candidate tables
-- - remove slots_snapshot rows older than 30 days
-- - remove Codex RPC smoke-test push subscription if present
-- Does not delete facilities, availability_cache, live alarms, or tournament data.

begin;

delete from public.push_subscriptions
 where id = 'codex-test-subscription-20260714';

delete from public.slots_snapshot
 where date_ymd < current_date - interval '30 days';

drop table if exists public.push_endpoints;
drop table if exists public.subscriptions;
drop table if exists public.sent_log;

commit;

