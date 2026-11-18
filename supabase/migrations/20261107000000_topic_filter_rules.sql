-- Per-topic filter rules. Each topic inherits the global filter_settings and can override:
--   min_duration_seconds   null = use the global minimum
--   allow_live_recordings  keep recordings of past live streams / premieres
--                          (live-now and upcoming streams stay excluded)
--   allowed_keywords       global blocked keywords that do not apply to this topic
--   extra_blocked_keywords keywords blocked only in this topic

alter table public.topics
  add column min_duration_seconds int check (min_duration_seconds between 0 and 7200),
  add column allow_live_recordings boolean not null default false,
  add column allowed_keywords text[] not null default '{}',
  add column extra_blocked_keywords text[] not null default '{}';

create policy "admins update topics" on public.topics for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
