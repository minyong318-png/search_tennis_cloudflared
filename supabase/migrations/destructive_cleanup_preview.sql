-- PREVIEW ONLY. This file intentionally contains no DROP, DELETE, or TRUNCATE.
-- Current deletion candidates are listed with row counts so they can be approved explicitly.

select 'push_endpoints' as table_name, count(*) as rows from public.push_endpoints
union all
select 'subscriptions', count(*) from public.subscriptions
union all
select 'sent_log', count(*) from public.sent_log
union all
select 'alarms', count(*) from public.alarms
union all
select 'availability_cache_empty_slots', count(*) from public.availability_cache where slots_json = '[]'::jsonb
union all
select 'slots_snapshot_older_than_30_days', count(*) from public.slots_snapshot where date_ymd < current_date - interval '30 days';

