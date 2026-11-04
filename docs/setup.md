# Setup guide

Steps only the admin can do (accounts, secrets, DNS). Do them in order; each step
says how to check it worked. Commands run from `energy-protector/`.

## 1. Supabase project

1. Sign up for a **new free Supabase org** (Quintice Org is at its 2-project limit) and
   create a project, region `ap-southeast-1` (Singapore, closest to Taiwan).
2. Link and apply the schema:
   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. Copy `.env.example` to `.env.local`; fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   (Project Settings → API).
4. Allow yourself into the admin UI: `npm run ep add-admin <your-email>`.

Check: Table Editor shows `filter_settings` with one row and `topics` with 4 rows.

## 2. Google Cloud (YouTube access)

1. Create a Google Cloud project; enable **YouTube Data API v3**.
2. OAuth consent screen: External, add scope `.../auth/youtube`, then **Publish app**
   ("In production"). Skip verification; you will see an "unverified app" warning once.
   This stops refresh tokens expiring after 7 days.
3. Credentials → OAuth client ID → **Desktop app**. Put its ID and secret in `.env.local`
   as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Link your parents' account: `npm run ep link`, open the printed link, sign in as the
   account their TV uses (choose the right channel if it asks), continue past the warning.
   Copy the printed `YOUTUBE_REFRESH_TOKEN` into `.env.local`.
5. Import their subscriptions: `npm run ep import-subs`.

Check: `link` prints the parents' channel name; `sources` now has rows with `enabled = false`.

## 3. Resend (failure email)

Create a Resend account and API key. Until you verify a domain, the sender
`onboarding@resend.dev` can only email the address you signed up with, which is enough
for alerts to yourself.

## 4. Edge Functions

```sh
supabase secrets set \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... YOUTUBE_REFRESH_TOKEN=... \
  CRON_SECRET=$(openssl rand -hex 32) \
  RESEND_API_KEY=... ALERT_EMAIL=<your-email> \
  ALLOWED_ORIGIN=https://<your-domain>
supabase functions deploy daily-sync --no-verify-jwt
supabase functions deploy add-source
```

Then open `supabase/setup/schedule-daily-sync.sql`, fill the function URL and the same
`CRON_SECRET`, and run it in the SQL Editor (runs daily at 05:00 Taipei time).

Check: `select * from cron.job;` lists `energy-protector-daily-sync`.

## 5. Admin sign-in and Vercel

1. Google Cloud → Credentials → OAuth client ID → **Web application**. Authorized redirect
   URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the web client ID and secret.
3. Supabase → Authentication → URL Configuration: Site URL `https://<your-domain>`; add
   `http://localhost:8080` to redirect URLs for local development.
4. Vercel: import the repo, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then
   Settings → Domains → add your domain and create the DNS record Vercel shows.

## 6. On the parents' TV (once)

1. YouTube → Settings → pause **watch history** (tell them first).
2. On AI-drama channels still on the home screen: ⋮ → **不要推薦這個頻道**.
3. Check that the playlists appear under 媒體庫 → 播放清單.
