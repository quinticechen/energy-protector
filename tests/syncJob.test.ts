import { test } from "node:test";
import assert from "node:assert/strict";
import { runSync } from "../supabase/functions/_shared/syncJob.ts";
import { resolveSource } from "../supabase/functions/_shared/resolveSource.ts";
import { channelSource, FakeStore, FakeYouTube, seriesSource } from "./fakes.ts";

const HEALTH = "UChealthhealthhealthheal";
const TRAVEL = "UCtraveltraveltraveltrav";
const NOW = new Date("2026-11-03T21:00:00Z"); // 05:00 on 2026-11-04 in Taipei

function setup() {
  const yt = new FakeYouTube();
  const store = new FakeStore();
  store.sources = [channelSource("h", HEALTH, "health"), channelSource("t", TRAVEL, "travel"), seriesSource("show", "PLshowshowshow1", "大愛劇")];

  for (let i = 1; i <= 12; i++) {
    yt.addVideo({ id: `h${i}`, channelId: HEALTH, publishedAt: `2026-11-${String(4 - Math.min(i, 3)).padStart(2, "0")}T0${i % 10}:00:00Z` });
  }
  yt.addVideo({ id: "hShort", channelId: HEALTH, publishedAt: "2026-11-03T10:00:00Z", durationSeconds: 59 });
  yt.addVideo({ id: "t1", channelId: TRAVEL, publishedAt: "2026-11-02T00:00:00Z" });
  yt.addVideo({ id: "t2", channelId: TRAVEL, publishedAt: "2026-11-01T00:00:00Z", title: "命理算命大師" });
  yt.setPlaylist(`UU${HEALTH.slice(2)}`, ["hShort", ...Array.from({ length: 12 }, (_, i) => `h${i + 1}`)]);
  yt.setPlaylist(`UU${TRAVEL.slice(2)}`, ["t1", "t2"]);

  for (const ep of ["ep1", "ep2"]) yt.addVideo({ id: ep, channelId: "UCdramadramadramadramadr", publishedAt: "2026-10-01T00:00:00Z", durationSeconds: 2700 });
  yt.setPlaylist("PLshowshowshow1", ["ep1", "ep2"], "大愛劇");
  return { yt, store };
}

const options = (yt: FakeYouTube, store: FakeStore, now = NOW) => ({ yt, store, now, timeZone: "Asia/Taipei", quotaBudget: 8000 });

function playlistByTitle(yt: FakeYouTube, store: FakeStore, title: string): string[] {
  const managed = store.managed.find((playlist) => playlist.title === title);
  assert.ok(managed, `playlist ${title} should exist`);
  return yt.itemsOf(managed.youtubePlaylistId);
}

test("first run creates every playlist with filtered, ordered content", async () => {
  const { yt, store } = setup();
  const summary = await runSync(options(yt, store));

  assert.deepEqual(summary.errors, []);
  assert.deepEqual(store.managed.map((playlist) => playlist.title), ["今日精選", "健康", "旅遊", "好劇｜大愛劇"]);

  const daily = playlistByTitle(yt, store, "今日精選");
  assert.equal(daily.length, 10);
  assert.equal(daily[1], "t1", "round-robin puts the travel channel second");
  assert.ok(!daily.includes("hShort") && !daily.includes("t2"), "short and blocked videos are filtered");

  assert.equal(playlistByTitle(yt, store, "健康").length, 10);
  assert.deepEqual(playlistByTitle(yt, store, "旅遊"), ["t1"]);
  assert.deepEqual(playlistByTitle(yt, store, "好劇｜大愛劇"), ["ep1", "ep2"]);
  assert.deepEqual(store.dailyPicks.get("2026-11-04"), daily);
});

test("a second run on the same day makes no writes", async () => {
  const { yt, store } = setup();
  await runSync(options(yt, store));
  yt.resetQuota();
  const summary = await runSync(options(yt, store));
  assert.deepEqual(yt.writes, []);
  assert.ok(summary.quotaUsed < 50, `only reads expected, used ${summary.quotaUsed}`);
});

test("the next day replaces 今日精選 without repeats and appends new episodes", async () => {
  const { yt, store } = setup();
  await runSync(options(yt, store));
  const firstDaily = playlistByTitle(yt, store, "今日精選");

  yt.addVideo({ id: "ep3", channelId: "UCdramadramadramadramadr", publishedAt: "2026-11-04T00:00:00Z", durationSeconds: 2700 });
  yt.setPlaylist("PLshowshowshow1", ["ep1", "ep2", "ep3"], "大愛劇");
  await runSync(options(yt, store, new Date("2026-11-04T21:00:00Z")));

  const secondDaily = playlistByTitle(yt, store, "今日精選");
  assert.ok(secondDaily.every((id) => !firstDaily.includes(id)), "no video repeats within 14 days");
  assert.deepEqual(playlistByTitle(yt, store, "好劇｜大愛劇"), ["ep1", "ep2", "ep3"]);
});

test("tightening a filter removes listed videos on the next run", async () => {
  const { yt, store } = setup();
  await runSync(options(yt, store));
  store.filters = { ...store.filters, blockedKeywords: [...store.filters.blockedKeywords, "影片 h1"] };
  await runSync(options(yt, store));
  const health = playlistByTitle(yt, store, "健康");
  assert.ok(!health.some((id) => id.startsWith("h1")), "h1, h10, h11, h12 match the new keyword");
  assert.equal(health.length, 8);
});

test("a playlist deleted on YouTube is recreated", async () => {
  const { yt, store } = setup();
  await runSync(options(yt, store));
  const oldId = store.managed.find((playlist) => playlist.key === "topic:travel")!.youtubePlaylistId;
  yt.playlists.delete(oldId);
  const summary = await runSync(options(yt, store));
  const recreated = store.managed.find((playlist) => playlist.key === "topic:travel")!;
  assert.notEqual(recreated.youtubePlaylistId, oldId);
  assert.ok(summary.playlists.find((result) => result.key === "topic:travel")!.created);
  assert.deepEqual(yt.itemsOf(recreated.youtubePlaylistId), ["t1"]);
});

test("the quota budget stops writes and the next run continues", async () => {
  const { yt, store } = setup();
  const summary = await runSync({ ...options(yt, store), quotaBudget: 600 });
  assert.ok(summary.budgetExhausted);
  assert.ok(summary.quotaUsed <= 600);
  assert.ok(summary.playlists.some((result) => result.pending > 0));

  yt.resetQuota();
  const next = await runSync(options(yt, store));
  assert.equal(next.budgetExhausted, false);
  assert.equal(playlistByTitle(yt, store, "健康").length, 10);
});

test("the time budget stops writes cleanly and the next run continues", async () => {
  const { yt, store } = setup();
  let ms = 0;
  const clock = () => (ms += 1000); // every check advances one second
  const summary = await runSync({ ...options(yt, store), timeBudgetMs: 12_000, clock });
  assert.ok(summary.timeExhausted);
  assert.equal(summary.budgetExhausted, false);
  assert.ok(summary.playlists.some((result) => result.pending > 0));

  const next = await runSync(options(yt, store));
  assert.equal(next.timeExhausted, false);
  assert.equal(playlistByTitle(yt, store, "健康").length, 10);
  assert.deepEqual(playlistByTitle(yt, store, "好劇｜大愛劇"), ["ep1", "ep2"]);
});

test("a failing source is reported and its stored videos are still used", async () => {
  const { yt, store } = setup();
  await runSync(options(yt, store));
  yt.failingPlaylists.add(`UU${TRAVEL.slice(2)}`);
  const summary = await runSync(options(yt, store));
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0], /頻道 t/);
  assert.deepEqual(playlistByTitle(yt, store, "旅遊"), ["t1"]);
});

test("a channel without an uploads playlist is a notice, not an error", async () => {
  const { yt, store } = setup();
  store.sources.push(channelSource("topic", "UCtopictopictopictopicto", "travel"));
  const summary = await runSync(options(yt, store));
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.notices.length, 1);
  assert.match(summary.notices[0], /頻道 topic/);
});

test("a video that cannot be added is skipped without breaking the order", async () => {
  const { yt, store } = setup();
  yt.addVideo({ id: "ep3", channelId: "UCdramadramadramadramadr", publishedAt: "2026-10-02T00:00:00Z", durationSeconds: 2700 });
  yt.setPlaylist("PLshowshowshow1", ["ep1", "ep2", "ep3"], "大愛劇");
  yt.rejectInserts.add("ep1");
  const summary = await runSync(options(yt, store));
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0], /ep1/);
  assert.deepEqual(playlistByTitle(yt, store, "好劇｜大愛劇"), ["ep2", "ep3"]);
});

test("resolveSource turns links into channel or playlist sources", async () => {
  const yt = new FakeYouTube();
  yt.channels.set(HEALTH, { id: HEALTH, title: "健康2.0", thumbnailUrl: null, handle: "@health20" });
  yt.addVideo({ id: "dQw4w9WgXcQ", channelId: HEALTH, publishedAt: "2026-11-01T00:00:00Z" });
  yt.setPlaylist("PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", [], "某某劇 全集");

  const byHandle = await resolveSource(yt, "https://www.youtube.com/@health20");
  assert.deepEqual(byHandle, { ok: true, source: { kind: "channel", youtubeId: HEALTH, title: "健康2.0", thumbnailUrl: null } });
  const byVideo = await resolveSource(yt, "https://youtu.be/dQw4w9WgXcQ");
  assert.equal(byVideo.ok && byVideo.source.youtubeId, HEALTH);
  const byPlaylist = await resolveSource(yt, "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG");
  assert.deepEqual(byPlaylist.ok && byPlaylist.source.kind, "playlist");
  assert.deepEqual(await resolveSource(yt, "https://example.com"), { ok: false, error: "invalid_url" });
  assert.deepEqual(await resolveSource(yt, "@nobody"), { ok: false, error: "not_found" });
});
