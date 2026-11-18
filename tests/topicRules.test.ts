import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILTERS, effectiveFilters, evaluateVideo, filtersBySource, NO_TOPIC_RULES } from "../supabase/functions/_shared/filters.ts";
import { runSync } from "../supabase/functions/_shared/syncJob.ts";
import { channelSource, FakeStore, FakeYouTube, video } from "./fakes.ts";

const FORTUNE_RULES = { minDurationSeconds: 600, allowLiveRecordings: true, allowedKeywords: ["算命", "預言"], extraBlockedKeywords: ["開運商品"] };

test("effectiveFilters applies a topic's overrides on top of the global filters", () => {
  assert.deepEqual(effectiveFilters(DEFAULT_FILTERS), { ...DEFAULT_FILTERS, allowLiveRecordings: false });
  assert.deepEqual(effectiveFilters(DEFAULT_FILTERS, FORTUNE_RULES), {
    minDurationSeconds: 600,
    excludeLive: true,
    allowLiveRecordings: true,
    blockedKeywords: ["政論", "開運商品"],
  });
  // Allowed keywords match case-insensitively; a null minimum inherits the global one.
  const rules = { ...NO_TOPIC_RULES, allowedKeywords: ["NEWS"] };
  assert.deepEqual(effectiveFilters({ ...DEFAULT_FILTERS, blockedKeywords: ["news", "政論"] }, rules).blockedKeywords, ["政論"]);
  assert.equal(effectiveFilters(DEFAULT_FILTERS, rules).minDurationSeconds, 180);
});

test("live recordings pass only when allowed; live-now and upcoming never do", () => {
  const allow = effectiveFilters(DEFAULT_FILTERS, FORTUNE_RULES);
  const recording = video({ youtubeId: "rec", wasLive: true, durationSeconds: 3600 });
  assert.equal(evaluateVideo(recording, DEFAULT_FILTERS).kept, false);
  assert.equal(evaluateVideo(recording, allow).kept, true);
  assert.equal(evaluateVideo(video({ youtubeId: "now", liveStatus: "live", durationSeconds: 3600 }), allow).kept, false);
  assert.equal(evaluateVideo(video({ youtubeId: "soon", liveStatus: "upcoming", durationSeconds: 3600 }), allow).kept, false);
});

test("filtersBySource gives channels their topic's rules and series the global ones", () => {
  const topics = [{ slug: "fortune", name: "命理", sort: 1, rules: FORTUNE_RULES }];
  const sources = [
    channelSource("c1", "UC1", "fortune"),
    channelSource("c2", "UC2", "health"),
    { ...channelSource("p1", "PL1", "fortune"), kind: "playlist" as const },
  ];
  const filtersFor = filtersBySource(DEFAULT_FILTERS, sources, topics);
  assert.equal(filtersFor("c1").minDurationSeconds, 600);
  assert.equal(filtersFor("c2").minDurationSeconds, 180, "a topic without rules uses the global filters");
  assert.equal(filtersFor("p1").minDurationSeconds, 180, "series ignore topic rules");
  assert.equal(filtersFor("unknown").minDurationSeconds, 180);
});

test("the daily run fills a topic that only its own rules allow", async () => {
  const CHANNEL = "UCfortunefortunefortunef";
  const yt = new FakeYouTube();
  const store = new FakeStore();
  store.topics = [{ slug: "fortune", name: "命理", sort: 1, rules: { ...NO_TOPIC_RULES } }];
  store.sources = [channelSource("f", CHANNEL, "fortune")];
  yt.addVideo({ id: "live1", channelId: CHANNEL, publishedAt: "2026-11-01T00:00:00Z", wasLive: true, durationSeconds: 3600, title: "十二生肖運勢" });
  yt.addVideo({ id: "kw1", channelId: CHANNEL, publishedAt: "2026-10-31T00:00:00Z", title: "算命師怎麼看" });
  yt.setPlaylist(`UU${CHANNEL.slice(2)}`, ["live1", "kw1"]);
  const options = { yt, store, now: new Date("2026-11-03T21:00:00Z"), timeZone: "Asia/Taipei", quotaBudget: 8000 };

  await runSync(options);
  const listId = () => store.managed.find((playlist) => playlist.key === "topic:fortune")!.youtubePlaylistId;
  assert.deepEqual(yt.itemsOf(listId()), [], "global rules drop both videos");

  store.topics = [{ ...store.topics[0], rules: { ...NO_TOPIC_RULES, allowLiveRecordings: true, allowedKeywords: ["算命"] } }];
  await runSync(options);
  assert.deepEqual(yt.itemsOf(listId()), ["live1", "kw1"]);
});
