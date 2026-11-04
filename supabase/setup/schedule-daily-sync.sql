-- Run once in the SQL Editor after deploying daily-sync. Replace the two placeholders.
-- Schedules the sync at 21:00 UTC = 05:00 Asia/Taipei, before the family's day starts.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/daily-sync', 'daily_sync_url');
select vault.create_secret('<same value as the CRON_SECRET function secret>', 'daily_sync_cron_secret');

select cron.schedule(
  'energy-protector-daily-sync',
  '0 21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_sync_url'),
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_sync_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
