-- Track where a source came from and whether the parents' account is still subscribed.
-- Subscription-origin channels are disabled automatically when the account unsubscribes;
-- manually added sources are never changed by the subscription sync.

alter table public.sources
  add column origin text not null default 'manual' check (origin in ('subscription', 'manual')),
  add column subscribed boolean not null default false;

-- Every row so far came from `ep import-subs`.
update public.sources set origin = 'subscription', subscribed = true where kind = 'channel';
