import { NO_TOPIC_RULES } from "@shared/filters.ts";
import type { TopicFilterRules } from "@shared/types.ts";

const key = (words: string[]) => [...words].map((word) => word.toLocaleLowerCase()).sort().join("\u0000");

export function sameRules(a: TopicFilterRules, b: TopicFilterRules): boolean {
  return (
    a.minDurationSeconds === b.minDurationSeconds &&
    a.allowLiveRecordings === b.allowLiveRecordings &&
    key(a.allowedKeywords) === key(b.allowedKeywords) &&
    key(a.extraBlockedKeywords) === key(b.extraBlockedKeywords)
  );
}

/** Whether a topic overrides anything (allowed keywords count only if they are still globally blocked). */
export function isCustomized(rules: TopicFilterRules, globalKeywords: string[]): boolean {
  const global = new Set(globalKeywords.map((word) => word.toLocaleLowerCase()));
  return (
    rules.minDurationSeconds !== null ||
    rules.allowLiveRecordings ||
    rules.extraBlockedKeywords.length > 0 ||
    rules.allowedKeywords.some((word) => global.has(word.toLocaleLowerCase()))
  );
}

export function resetRules(): TopicFilterRules {
  return { ...NO_TOPIC_RULES, allowedKeywords: [], extraBlockedKeywords: [] };
}
