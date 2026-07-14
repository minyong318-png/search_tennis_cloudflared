-- PREVIEW ONLY. Counts rows that would be affected by a snapshot retention policy.
-- No DELETE is included in this file.

select
  count(*) filter (where date_ymd < current_date) as past_snapshot_rows,
  count(*) filter (where date_ymd < current_date - interval '30 days') as older_than_30_days_rows,
  count(*) filter (where date_ymd >= current_date) as current_or_future_rows
from public.slots_snapshot;

select
  min(date_ymd) as oldest_snapshot_date,
  max(date_ymd) as newest_snapshot_date,
  count(*) as total_rows
from public.slots_snapshot;

-- If approved later, destructive cleanup should be created in a separate file and reviewed first.

