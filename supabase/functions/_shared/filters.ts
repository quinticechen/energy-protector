import type { DropReason, FilterSettings, FilterVerdict, Source, Topic, TopicFilterRules, VideoRecord } from "./types.ts";

export const DEFAULT_FILTERS: FilterSettings = {
  minDurationSeconds: 180,
  excludeLive: true,
  blockedKeywords: ["政論", "算命", "預言"],
};

export const NO_TOPIC_RULES: TopicFilterRules = {
  minDurationSeconds: null,
  allowLiveRecordings: false,
  allowedKeywords: [],
  extraBlockedKeywords: [],
};

/** Global filters with one topic's overrides applied. */
export function effectiveFilters(global: FilterSettings, rules: TopicFilterRules = NO_TOPIC_RULES): FilterSettings {
  const allowed = new Set(rules.allowedKeywords.map((keyword) => keyword.trim().toLocaleLowerCase()));
  return {
    minDurationSeconds: rules.minDurationSeconds ?? global.minDurationSeconds,
    excludeLive: global.excludeLive,
    allowLiveRecordings: rules.allowLiveRecordings,
    blockedKeywords: normalizeKeywords([
      ...global.blockedKeywords.filter((keyword) => !allowed.has(keyword.trim().toLocaleLowerCase())),
      ...rules.extraBlockedKeywords,
    ]),
  };
}

/** Returns a function giving the effective filters for a video's source (by its topic). */
export function filtersBySource(global: FilterSettings, sources: Source[], topics: Topic[]): (sourceId: string) => FilterSettings {
  const rulesBySlug = new Map(topics.map((topic) => [topic.slug, topic.rules]));
  const cache = new Map<string, FilterSettings>();
  const topicOf = new Map(sources.map((source) => [source.id, source.kind === "channel" ? source.topicSlug : null]));
  return (sourceId) => {
    const slug = topicOf.get(sourceId) ?? null;
    const key = slug ?? "";
    let filters = cache.get(key);
    if (!filters) {
      filters = effectiveFilters(global, slug ? rulesBySlug.get(slug) : undefined);
      cache.set(key, filters);
    }
    return filters;
  };
}

/** Applies the admin's filter rules to one video and explains every rule it breaks. */
export function evaluateVideo(video: VideoRecord, filters: FilterSettings): FilterVerdict {
  const reasons: DropReason[] = [];

  // Unknown duration counts as too short: we cannot prove it is not a Short.
  if (video.durationSeconds === null || video.durationSeconds <= filters.minDurationSeconds) {
    reasons.push({ code: "too_short", durationSeconds: video.durationSeconds });
  }
  // Live-now and upcoming are always dropped; recordings only unless the topic allows them.
  if (filters.excludeLive && (video.liveStatus !== "none" || (video.wasLive && !filters.allowLiveRecordings))) {
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
