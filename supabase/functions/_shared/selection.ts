import type { PlaylistItem, VideoRecord } from "./types.ts";

export const PLAYLIST_SIZE = 10;
export const DAILY_WINDOW_DAYS = 7;
export const DAILY_NO_REPEAT_DAYS = 14;

const DAY_MS = 86_400_000;

function newestFirst(a: VideoRecord, b: VideoRecord): number {
  return b.publishedAt.localeCompare(a.publishedAt) || a.youtubeId.localeCompare(b.youtubeId);
}

/** Takes one video per source in turn (sources ordered by their newest video). */
function roundRobin(videos: VideoRecord[], limit: number): VideoRecord[] {
  const queues = new Map<string, VideoRecord[]>();
  for (const video of [...videos].sort(newestFirst)) {
    const queue = queues.get(video.sourceId) ?? [];
    queue.push(video);
    queues.set(video.sourceId, queue);
  }
  const ordered = [...queues.values()];
  const picked: VideoRecord[] = [];
  while (picked.length < limit && ordered.some((queue) => queue.length > 0)) {
    for (const queue of ordered) {
      const next = queue.shift();
      if (next) picked.push(next);
      if (picked.length === limit) break;
    }
  }
  return picked;
}

function uniqueByVideo(videos: VideoRecord[]): VideoRecord[] {
  const seen = new Set<string>();
  return videos.filter((video) => !seen.has(video.youtubeId) && seen.add(video.youtubeId));
}

export interface DailySelectionInput {
  /** Kept channel videos (already filtered). */
  candidates: VideoRecord[];
  /** Video IDs picked for 今日精選 in the previous DAILY_NO_REPEAT_DAYS days. */
  recentlyPicked: Set<string>;
  now: Date;
  size?: number;
}

/**
 * 今日精選: uploads from the last 7 days, one per channel in turn, newest first.
 * Quiet weeks are backfilled from older videos the same way.
 */
export function selectDaily({ candidates, recentlyPicked, now, size = PLAYLIST_SIZE }: DailySelectionInput): string[] {
  const windowStart = new Date(now.getTime() - DAILY_WINDOW_DAYS * DAY_MS).toISOString();
  const fresh = uniqueByVideo([...candidates].sort(newestFirst)).filter((video) => !recentlyPicked.has(video.youtubeId));
  const recent = fresh.filter((video) => video.publishedAt >= windowStart);
  const older = fresh.filter((video) => video.publishedAt < windowStart);

  const picked = roundRobin(recent, size);
  if (picked.length < size) picked.push(...roundRobin(older, size - picked.length));
  return picked.map((video) => video.youtubeId);
}

/** Topic lists: the newest kept videos of that topic. */
export function selectTopic(candidates: VideoRecord[], size = PLAYLIST_SIZE): string[] {
  return uniqueByVideo([...candidates].sort(newestFirst))
    .slice(0, size)
    .map((video) => video.youtubeId);
}

/** 好劇｜<show>: every kept episode in series order. */
export function selectSeries(candidates: VideoRecord[]): string[] {
  return uniqueByVideo(
    [...candidates].sort((a, b) => (a.seriesPosition ?? Infinity) - (b.seriesPosition ?? Infinity)),
  ).map((video) => video.youtubeId);
}

export interface PlaylistDiff {
  deletes: PlaylistItem[];
  /** Applied in order after the deletes; `position` is the 0-based target index. */
  inserts: { videoId: string; position: number }[];
}

/**
 * Minimal set of API writes that turns `current` into `target`.
 * Kept items are not reordered (a reorder costs quota); inserting each missing video at
 * its target index, in ascending order, yields the target order whenever the kept items
 * already appear in target order — which holds for every selection above.
 */
export function diffPlaylist(current: PlaylistItem[], target: string[]): PlaylistDiff {
  const targetSet = new Set(target);
  const seen = new Set<string>();
  const deletes: PlaylistItem[] = [];
  for (const item of current) {
    // Duplicates are removed too.
    if (!targetSet.has(item.videoId) || seen.has(item.videoId)) deletes.push(item);
    seen.add(item.videoId);
  }
  const kept = new Set(current.filter((item) => !deletes.includes(item)).map((item) => item.videoId));
  const inserts = target
    .map((videoId, position) => ({ videoId, position }))
    .filter(({ videoId }) => !kept.has(videoId));
  return { deletes, inserts };
}

/** Calendar date (YYYY-MM-DD) in a given IANA time zone. */
export function dateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
