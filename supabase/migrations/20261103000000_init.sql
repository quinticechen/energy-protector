-- Energy Protector: initial schema.
-- The admin UI reads/writes through RLS (admins only); Edge Functions use the service role.

create table public.admins (
  email text primary key
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

create table public.topics (
  slug text primary key,
  name text not null,
  sort int not null default 0
);

insert into public.topics (slug, name, sort) values
  ('health', '健康', 1),
  ('travel', '旅遊', 2),
  ('history', '歷史', 3),
  ('cooking', '料理', 4);

create table public.filter_settings (
  id int primary key default 1 check (id = 1),
  min_duration_seconds int not null default 180 check (min_duration_seconds between 0 and 7200),
  exclude_live boolean not null default true,
  blocked_keywords text[] not null default array['政論', '算命', '預言'],
  updated_at timestamptz not null default now()
);

insert into public.filter_settings default values;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('channel', 'playlist')),
  youtube_id text not null unique,
  title text not null,
  thumbnail_url text,
  topic_slug text references public.topics (slug) on update cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  -- An enabled channel needs a topic; a playlist (drama series) never has one.
  constraint sources_topic_rule check (
    (kind = 'playlist' and topic_slug is null)
    or (kind = 'channel' and (topic_slug is not null or not enabled))
  )
);

create table public.videos (
  source_id uuid not null references public.sources (id) on delete cascade,
  youtube_id text not null,
  title text not null,
  thumbnail_url text,
  published_at timestamptz not null,
  duration_seconds int,
  live_status text not null default 'none' check (live_status in ('none', 'live', 'upcoming')),
  was_live boolean not null default false,
  series_position int,
  fetched_at timestamptz not null default now(),
  primary key (source_id, youtube_id)
);

create index videos_published_at_idx on public.videos (published_at desc);

create table public.managed_playlists (
  key text primary key, -- 'daily' | 'topic:<slug>' | 'series:<source id>'
  youtube_playlist_id text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.daily_picks (
  picked_on date not null,
  video_id text not null,
  primary key (picked_on, video_id)
);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  trigger text not null check (trigger in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  quota_used int,
  summary jsonb,
  error text
);

create index sync_runs_started_at_idx on public.sync_runs (started_at desc);

-- Keep filter_settings.updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger filter_settings_touch
before update on public.filter_settings
for each row execute function public.touch_updated_at();

-- Row level security: only admins, and only what the UI needs.
alter table public.admins enable row level security;
alter table public.topics enable row level security;
alter table public.filter_settings enable row level security;
alter table public.sources enable row level security;
alter table public.videos enable row level security;
alter table public.managed_playlists enable row level security;
alter table public.daily_picks enable row level security;
alter table public.sync_runs enable row level security;

create policy "admins read topics" on public.topics for select to authenticated using (public.is_admin());
create policy "admins read filters" on public.filter_settings for select to authenticated using (public.is_admin());
create policy "admins update filters" on public.filter_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins read sources" on public.sources for select to authenticated using (public.is_admin());
create policy "admins update sources" on public.sources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete sources" on public.sources for delete to authenticated using (public.is_admin());
create policy "admins read videos" on public.videos for select to authenticated using (public.is_admin());
create policy "admins read playlists" on public.managed_playlists for select to authenticated using (public.is_admin());
create policy "admins read runs" on public.sync_runs for select to authenticated using (public.is_admin());
-- Inserting sources goes through the add-source Edge Function (it resolves the link first).
-- admins and daily_picks have no policies: service role only.

revoke execute on function public.is_admin() from anon;
