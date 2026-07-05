create table if not exists raw_tournaments (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_type text not null,
  source_url text not null,
  source_id text,
  title_raw text not null,
  raw_text text,
  html text,
  payload jsonb not null default '{}'::jsonb,
  content_hash text not null,
  review_status text not null default 'pending',
  crawled_at timestamptz not null default now(),
  unique (source_name, source_url)
);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_name text not null,
  source_url text not null,
  source_id text,
  title_raw text not null,
  title_normalized text not null,
  region_sido text,
  region_sigungu text,
  tournament_scope text not null default '미상',
  tournament_type text not null default '기타',
  organizer text,
  host text,
  sponsor text,
  start_date date,
  end_date date,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  refund_deadline_at timestamptz,
  status text not null default '미상',
  venue_name text,
  venue_address text,
  venue_lat double precision,
  venue_lng double precision,
  fee_text text,
  prize_text text,
  ball_text text,
  eligibility_text text,
  application_method_text text,
  contact_text text,
  detail_text text,
  attachments jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 0,
  content_hash text not null,
  duplicate_key text not null,
  visible boolean not null default false,
  created_at timestamptz not null default now(),
  crawled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_status_idx on tournaments(status);
create index if not exists tournaments_date_idx on tournaments(start_date, end_date);
create index if not exists tournaments_region_idx on tournaments(region_sido, region_sigungu);
create index if not exists tournaments_duplicate_key_idx on tournaments(duplicate_key);

create table if not exists tournament_divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_name text not null,
  gender text not null default '미상',
  level text not null default '미상',
  play_date date,
  start_time time,
  format text not null default '미상',
  capacity integer,
  fee integer,
  fee_text text,
  application_url text,
  bracket_url text,
  result_url text,
  status text not null default '미상'
);

create table if not exists tournament_sources (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  source_name text not null,
  source_type text not null,
  source_url text not null,
  source_id text,
  crawled_at timestamptz not null default now(),
  unique (tournament_id, source_url)
);

create table if not exists tournament_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  address text,
  region_sido text,
  region_sigungu text,
  lat double precision,
  lng double precision,
  courtissum_venue_id text
);

create table if not exists tournament_venue_matches (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  venue_id uuid not null references tournament_venues(id) on delete cascade,
  match_score integer not null,
  match_method text not null,
  verified boolean not null default false,
  primary key (tournament_id, venue_id)
);

create table if not exists tournament_crawl_logs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  list_count integer not null default 0,
  detail_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  error_message text
);

create table if not exists tournament_change_logs (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now(),
  source_name text not null
);
