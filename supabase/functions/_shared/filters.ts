import type { DropReason, FilterSettings, FilterVerdict, VideoRecord } from "./types.ts";

export const DEFAULT_FILTERS: FilterSettings = {
  minDurationSeconds: 180,
  excludeLive: true,
  blockedKeywords: ["政論", "算命", "預言"],
};

/** Applies the admin's filter rules to one video and explains every rule it breaks. */
export function evaluateVideo(video: VideoRecord, filters: FilterSettings): FilterVerdict {
  const reasons: DropReason[] = [];

  // Unknown duration counts as too short: we cannot prove it is not a Short.
  if (video.durationSeconds === null || video.durationSeconds <= filters.minDurationSeconds) {
    reasons.push({ code: "too_short", durationSeconds: video.durationSeconds });
  }
  if (filters.excludeLive && (video.liveStatus !== "none" || video.wasLive)) {
    reasons.push({ code: "live" });
  }
  const title = video.title.toLocaleLowerCase();
  for (const keyword of filters.blockedKeywords) {
    const needle = keyword.trim().toLocaleLowerCase();
    if (needle && title.includes(needle)) reasons.push({ code: "blocked_keyword", keyword: keyword.trim() });
  }

  return { kept: reasons.length === 0, reasons };
}

/** Normalizes free-text keyword input: trims, drops blanks and duplicates. */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    const key = keyword.toLocaleLowerCase();
    if (keyword && !seen.has(key)) {
      seen.add(key);
      result.push(keyword);
    }
  }
  return result;
}
