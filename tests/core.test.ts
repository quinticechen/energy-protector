import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIsoDuration } from "../supabase/functions/_shared/duration.ts";
import { parseYouTubeUrl } from "../supabase/functions/_shared/youtubeUrl.ts";
import { DEFAULT_FILTERS, evaluateVideo, normalizeKeywords } from "../supabase/functions/_shared/filters.ts";
import {
  addDays,
  dateInTimeZone,
  diffPlaylist,
  selectDaily,
  selectSeries,
  selectTopic,
} from "../supabase/functions/_shared/selection.ts";
import { uploadsPlaylistId } from "../supabase/functions/_shared/youtubeClient.ts";
import { video } from "./fakes.ts";

const CHANNEL = "UCabcdefghijklmnopqrstuv";

test("parseIsoDuration handles YouTube durations", () => {
  assert.equal(parseIsoDuration("PT3M"), 180);
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(parseIsoDuration("P1DT1S"), 86401);
  assert.equal(parseIsoDuration("PT0S"), 0);
  assert.equal(parseIsoDuration("P"), null);
  assert.equal(parseIsoDuration("PT"), null);
  assert.equal(parseIsoDuration("3:00"), null);
  assert.equal(parseIsoDuration(undefined), null);
});

test("parseYouTubeUrl recognises channels, handles, videos and playlists", () => {
  assert.deepEqual(parseYouTubeUrl(`https://www.youtube.com/channel/${CHANNEL}`), { type: "channel", channelId: CHANNEL });
  assert.deepEqual(parseYouTubeUrl(CHANNEL), { type: "channel", channelId: CHANNEL });
  assert.deepEqual(parseYouTubeUrl("https://youtube.com/@公視"), { type: "handle", handle: "@公視" });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/%40ptslivestream/videos"), { type: "handle", handle: "@ptslivestream" });
  assert.deepEqual(parseYouTubeUrl("@ptslivestream"), { type: "handle", handle: "@ptslivestream" });
  assert.deepEqual(parseYouTubeUrl("m.youtube.com/watch?v=dQw4w9WgXcQ"), { type: "video", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc"), { type: "video", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), { type: "video", videoId: "dQw4w9WgXcQ" });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"), {
    type: "playlist",
    playlistId: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
  });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG"), {
    type: "playlist",
    playlistId: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
  });
  assert.equal(parseYouTubeUrl("https://vimeo.com/123"), null);
  assert.equal(parseYouTubeUrl("not a link"), null);
  assert.equal(parseYouTubeUrl(""), null);
});

test("uploadsPlaylistId maps UC to UU", () => {
  assert.equal(uploadsPlaylistId(CHANNEL), "UUabcdefghijklmnopqrstuv");
});

test("evaluateVideo keeps normal videos and explains every drop", () => {
  assert.deepEqual(evaluateVideo(video({ youtubeId: "a" }), DEFAULT_FILTERS), { kept: true, reasons: [] });

  const short = evaluateVideo(video({ youtubeId: "b", durationSeconds: 180 }), DEFAULT_FILTERS);
  assert.deepEqual(short.reasons, [{ code: "too_short", durationSeconds: 180 }]);
  assert.equal(evaluateVideo(video({ youtubeId: "c", durationSeconds: 181 }), DEFAULT_FILTERS).kept, true);
  assert.equal(evaluateVideo(video({ youtubeId: "d", durationSeconds: null }), DEFAULT_FILTERS).kept, false);

  assert.deepEqual(evaluateVideo(video({ youtubeId: "e", liveStatus: "upcoming" }), DEFAULT_FILTERS).reasons, [{ code: "live" }]);
  assert.deepEqual(evaluateVideo(video({ youtubeId: "f", wasLive: true }), DEFAULT_FILTERS).reasons, [{ code: "live" }]);
  assert.equal(evaluateVideo(video({ youtubeId: "g", wasLive: true }), { ...DEFAULT_FILTERS, excludeLive: false }).kept, true);

  const mixed = evaluateVideo(video({ youtubeId: "h", title: "今日政論｜AI 預言", durationSeconds: 30 }), DEFAULT_FILTERS);
  assert.deepEqual(mixed.reasons, [
    { code: "too_short", durationSeconds: 30 },
    { code: "blocked_keyword", keyword: "政論" },
    { code: "blocked_keyword", keyword: "預言" },
  ]);
  const caseless = evaluateVideo(video({ youtubeId: "i", title: "Big NEWS" }), { ...DEFAULT_FILTERS, blockedKeywords: ["news"] });
  assert.equal(caseless.kept, false);
});

test("normalizeKeywords trims and removes blanks and duplicates", () => {
  assert.deepEqual(normalizeKeywords([" 政論 ", "", "News", "news", "算命"]), ["政論", "News", "算命"]);
});

const NOW = new Date("2026-11-03T12:00:00Z");

test("selectDaily takes one video per channel in turn, newest first", () => {
  const candidates = [
    video({ youtubeId: "a1", sourceId: "A", publishedAt: "2026-11-03T08:00:00Z" }),
    video({ youtubeId: "a2", sourceId: "A", publishedAt: "2026-11-02T08:00:00Z" }),
    video({ youtubeId: "a3", sourceId: "A", publishedAt: "2026-11-01T08:00:00Z" }),
    video({ youtubeId: "b1", sourceId: "B", publishedAt: "2026-11-02T09:00:00Z" }),
    video({ youtubeId: "c1", sourceId: "C", publishedAt: "2026-10-30T09:00:00Z" }),
  ];
  assert.deepEqual(selectDaily({ candidates, recentlyPicked: new Set(), now: NOW, size: 4 }), ["a1", "b1", "c1", "a2"]);
});

test("selectDaily skips recent picks and backfills from older videos", () => {
  const candidates = [
    video({ youtubeId: "new1", sourceId: "A", publishedAt: "2026-11-02T00:00:00Z" }),
    video({ youtubeId: "new2", sourceId: "B", publishedAt: "2026-11-01T00:00:00Z" }),
    video({ youtubeId: "old1", sourceId: "A", publishedAt: "2026-10-01T00:00:00Z" }),
    video({ youtubeId: "old2", sourceId: "B", publishedAt: "2026-09-01T00:00:00Z" }),
  ];
  const picked = selectDaily({ candidates, recentlyPicked: new Set(["new2"]), now: NOW, size: 3 });
  assert.deepEqual(picked, ["new1", "old1", "old2"]);
});

test("selectTopic and selectSeries order and deduplicate", () => {
  const topic = selectTopic(
    [
      video({ youtubeId: "x", publishedAt: "2026-10-01T00:00:00Z" }),
      video({ youtubeId: "y", publishedAt: "2026-11-01T00:00:00Z" }),
      video({ youtubeId: "y", sourceId: "s2", publishedAt: "2026-11-01T00:00:00Z" }),
      video({ youtubeId: "z", publishedAt: "2026-10-15T00:00:00Z" }),
    ],
    2,
  );
  assert.deepEqual(topic, ["y", "z"]);
  const series = selectSeries([
    video({ youtubeId: "ep2", seriesPosition: 1 }),
    video({ youtubeId: "ep1", seriesPosition: 0 }),
    video({ youtubeId: "ep3", seriesPosition: 2 }),
  ]);
  assert.deepEqual(series, ["ep1", "ep2", "ep3"]);
});

/** Applies a diff the way the YouTube API would and returns the resulting order. */
function applyDiff(current: { itemId: string; videoId: string }[], target: string[]): string[] {
  const { deletes, inserts } = diffPlaylist(current, target);
  const list = current.filter((item) => !deletes.includes(item)).map((item) => item.videoId);
  for (const insert of inserts) {
    assert.ok(insert.position <= list.length, "insert position must exist");
    list.splice(insert.position, 0, insert.videoId);
  }
  return list;
}

const items = (ids: string[]) => ids.map((videoId, index) => ({ itemId: `i${index}`, videoId }));

test("diffPlaylist produces the target with minimal writes", () => {
  assert.deepEqual(diffPlaylist(items(["a", "b"]), ["a", "b"]), { deletes: [], inserts: [] });
  // Rolling topic: two new on top, oldest two trimmed.
  assert.deepEqual(applyDiff(items(["c", "d", "e", "f"]), ["a", "b", "c", "d"]), ["a", "b", "c", "d"]);
  // Series: new episodes appended.
  assert.deepEqual(applyDiff(items(["ep1", "ep2"]), ["ep1", "ep2", "ep3"]), ["ep1", "ep2", "ep3"]);
  // Daily: mostly replaced, one survivor.
  assert.deepEqual(applyDiff(items(["p", "q", "r"]), ["x", "q", "y"]), ["x", "q", "y"]);
  // Duplicates removed.
  const dup = diffPlaylist(items(["a", "a", "b"]), ["a", "b"]);
  assert.deepEqual(dup.deletes.map((item) => item.itemId), ["i1"]);
  assert.deepEqual(applyDiff([], ["a", "b"]), ["a", "b"]);
});

test("date helpers use the family's time zone", () => {
  assert.equal(dateInTimeZone(new Date("2026-11-03T17:00:00Z"), "Asia/Taipei"), "2026-11-04");
  assert.equal(dateInTimeZone(new Date("2026-11-03T15:00:00Z"), "Asia/Taipei"), "2026-11-03");
  assert.equal(addDays("2026-11-01", -14), "2026-10-18");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
