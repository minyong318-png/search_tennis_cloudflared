create table if not exists public.daehoe_tournaments (
  id text primary key,
  source_type text not null,
  source_id text,
  start_date date,
  end_date date,
  active boolean not null default true,
  sync_status text not null default 'seen',
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

alter table public.daehoe_tournaments enable row level security;
alter table public.daehoe_sync_state enable row level security;
revoke all on table public.daehoe_tournaments from anon, authenticated;
revoke all on table public.daehoe_sync_state from anon, authenticated;
grant select, insert, update, delete on table public.daehoe_tournaments to service_role;
grant select, insert, update, delete on table public.daehoe_sync_state to service_role;
