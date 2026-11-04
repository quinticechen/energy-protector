import { test } from "node:test";
import assert from "node:assert/strict";
import { createRestStore } from "../supabase/functions/_shared/restStore.ts";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(responses: unknown[]) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url,
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const next = responses.shift();
    return new Response(next === undefined ? "" : JSON.stringify(next), { status: 200 });
  };
  return { calls, fetchFn };
}

test("rest store sends service-role requests with the right filters", async () => {
  const { calls, fetchFn } = fakeFetch([
    [{ min_duration_seconds: 180, exclude_live: true, blocked_keywords: ["政論"] }],
    [{ video_id: "a" }, { video_id: "b" }],
    undefined,
    undefined,
  ]);
  const store = createRestStore({ url: "https://x.supabase.co/", serviceKey: "service", fetchFn });

  assert.deepEqual(await store.getFilters(), { minDurationSeconds: 180, excludeLive: true, blockedKeywords: ["政論"] });
  assert.deepEqual(await store.getDailyPicks("2026-10-20", "2026-11-02"), ["a", "b"]);
  await store.replaceDailyPicks("2026-11-03", ["c"]);

  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/filter_settings?id=eq.1&select=min_duration_seconds,exclude_live,blocked_keywords");
  assert.equal(calls[0].headers.authorization, "Bearer service");
  assert.equal(calls[1].url, "https://x.supabase.co/rest/v1/daily_picks?picked_on=gte.2026-10-20&picked_on=lte.2026-11-02&select=video_id");
  assert.equal(calls[2].method, "DELETE");
  assert.equal(calls[2].url, "https://x.supabase.co/rest/v1/daily_picks?picked_on=eq.2026-11-03");
  assert.deepEqual(calls[3].body, [{ picked_on: "2026-11-03", video_id: "c" }]);
});

test("upsertSources ignores or merges duplicates by YouTube ID", async () => {
  const row = { id: "1", kind: "channel", youtube_id: "UC1", title: "頻道", thumbnail_url: null, topic_slug: null, enabled: false, origin: "subscription", subscribed: true };
  const { calls, fetchFn } = fakeFetch([[row], [row]]);
  const store = createRestStore({ url: "https://x.supabase.co", serviceKey: "k", fetchFn });
  const source = { kind: "channel" as const, youtubeId: "UC1", title: "頻道", thumbnailUrl: null, topicSlug: null, enabled: false, origin: "subscription" as const, subscribed: true };

  const [created] = await store.upsertSources([source], { ignoreExisting: true });
  await store.upsertSources([source]);
  assert.equal(created.youtubeId, "UC1");
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/sources?on_conflict=youtube_id");
  assert.equal(calls[0].headers.prefer, "resolution=ignore-duplicates,return=representation");
  assert.equal(calls[1].headers.prefer, "resolution=merge-duplicates,return=representation");
});

test("finishRun marks runs with errors as partial", async () => {
  const { calls, fetchFn } = fakeFetch([undefined, undefined]);
  const store = createRestStore({ url: "https://x.supabase.co", serviceKey: "k", fetchFn });
  const summary = { fetchedVideos: 1, playlists: [], errors: ["x"], notices: [], quotaUsed: 3, budgetExhausted: false, timeExhausted: false };
  await store.finishRun(7, { summary });
  await store.finishRun(8, { error: "boom" });
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/sync_runs?id=eq.7");
  assert.equal((calls[0].body as { status: string }).status, "partial");
  assert.equal((calls[1].body as { status: string }).status, "failed");
});
