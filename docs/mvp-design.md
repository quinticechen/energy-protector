# Energy Protector — MVP Design

Status: agreed 2026-11-03 (grilling session, decisions Q1–Q20).
Step-by-step setup: [setup.md](setup.md).
Product context: [PRD｜長輩選片白名單 App](../PRD｜長輩選片白名單%20App.md).

## Goal

Your parents keep using the official YouTube app on their TV. Every day a job picks
videos from a whitelist of trusted channels and writes them into private playlists
in their account. You (the admin) manage the whitelist and filters in a web UI.

Scope: one family, one shared YouTube account, one whitelist. Rule-based selection;
no AI in the MVP (AI classification and scoring are planned for v2).

## Architecture

```
Admin UI (React, Vercel)  ──►  Supabase (Postgres + Auth + RLS)
        │                          ▲
        │  立即更新 / 新增來源       │ service role
        ▼                          │
Edge Functions: daily-sync, add-source  ──►  YouTube Data API v3 (OAuth, parents' account)
        ▲                          │
   pg_cron (daily)                 └──►  Resend (failure email)

CLI (Node): one-time OAuth link, import subscriptions
```

| Concern | Decision |
| --- | --- |
| Database | New Supabase project in a separate free org (Quintice Org is at its 2-project limit) |
| Daily job | Edge Function `daily-sync`, triggered by `pg_cron` + `pg_net` |
| YouTube auth | One Google Cloud project, consent screen "In production" (unverified) so refresh tokens do not expire after 7 days. Refresh token stored as an Edge Function secret |
| Admin auth | Supabase Auth, Google sign-in, only emails in the `admins` table pass RLS |
| Frontend | React + Vite + Tailwind + shadcn/ui, deployed on Vercel with a personal domain |
| i18n | `react-i18next`; Traditional Chinese default, English second. YouTube playlist names stay Chinese |
| Alerts | Email via Resend when a run fails or OAuth breaks |
| Shared logic | Plain TypeScript in `supabase/functions/_shared/`, imported by the Edge Functions, the CLI, the UI (preview) and the tests |
| Tests | `node --test` unit tests; YouTube and the database are faked, so tests cost no quota |

## Whitelist

- An entry (`sources` row) is either a **channel** or a **YouTube playlist**.
- A channel has exactly one topic; its videos inherit it. Topics: 健康, 旅遊, 歷史, 料理.
- A playlist entry is a drama series (好劇). Its episodes keep playlist order.
- Imported subscriptions arrive disabled with no topic; the admin enables and assigns
  a topic in the UI.

## Filters (editable in the UI)

A video is dropped if any rule matches:

1. Duration ≤ minimum (default 180 s, so "3 分鐘以下" includes exactly 3:00 Shorts).
2. Live, upcoming, or was a live stream / premiere (when "exclude live" is on).
3. Title contains a blocked keyword, case-insensitive (default 政論, 算命, 預言).

No maximum length. Filters are evaluated at selection time, so changing a filter also
removes already-listed videos on the next run.

## Playlists

All private. The job only touches playlists it created (tracked in `managed_playlists`).
Each run reads the playlist's current items from YouTube and applies the minimum diff.

| Playlist | Content | Update |
| --- | --- | --- |
| 今日精選 | 10 videos: uploads from the last 7 days, one per channel in turn (round-robin), newest first; backfill from older videos; skip anything picked in the previous 14 days | Replaced daily |
| 健康 / 旅遊 / 歷史 / 料理 | The 10 newest kept videos of that topic | Rolls: new videos in, oldest out |
| 好劇｜<show> | Every kept episode of the series playlist, in order | Changes only when episodes appear |

A topic playlist is created only once the topic has an enabled channel. Disabling a
source does not delete its playlist on YouTube.

## Quota

Default 10,000 units/day. Reads cost 1 unit per 50 items; each insert or delete costs 50.
A run stops writing once it reaches its budget (default 8,000) and continues the next day.
Write priority: 今日精選 → topic lists → series. The first run of a long series can take
several days to fill.

## Admin UI

- Sign in with Google (allowed emails only).
- **篩選規則**: minimum length, exclude live, keyword blocklist.
- **來源**: list, enable/disable, change topic, remove, add by pasting a channel, video or
  playlist link.
- **預覽**: recently fetched videos marked kept/dropped with the reason, using the
  unsaved filter draft.
- **立即更新**: runs `daily-sync` now and shows the result.
- **執行紀錄**: recent runs with status, quota used and errors.

## Manual setup (only the admin can do these)

1. Create the new Supabase org and project; apply the migration; add your email to `admins`.
2. Google Cloud: enable YouTube Data API v3, create OAuth clients (desktop for the CLI and
   the Edge Functions' YouTube access, web for Supabase sign-in), publish the consent
   screen to production.
3. Resend account and API key.
4. Vercel project and personal-domain DNS; add the domain to Supabase Auth redirect URLs.
5. Run `ep link` and sign in as your parents' account; set the refresh token secret.
6. On the TV: pause watch history; mark AI-drama channels "不要推薦這個頻道".

## Deferred

AI scoring (v2), large-text viewing page, recommended channel bundles, weekly review,
LINE notifications, multi-family version.
