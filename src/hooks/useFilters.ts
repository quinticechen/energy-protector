import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeKeywords } from "@shared/filters.ts";
import type { FilterSettings, TopicFilterRules } from "@shared/types.ts";
import { supabase } from "@/lib/supabase";

const FILTERS_KEY = ["filters"] as const;

export function useFilters() {
  return useQuery({
    queryKey: FILTERS_KEY,
    queryFn: async (): Promise<FilterSettings> => {
      const { data, error } = await supabase
        .from("filter_settings")
        .select("min_duration_seconds, exclude_live, blocked_keywords")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return {
        minDurationSeconds: data.min_duration_seconds,
        excludeLive: data.exclude_live,
        blockedKeywords: data.blocked_keywords,
      };
    },
  });
}

export function useSaveFilters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (filters: FilterSettings) => {
      const { error } = await supabase
        .from("filter_settings")
        .update({
          min_duration_seconds: filters.minDurationSeconds,
          exclude_live: filters.excludeLive,
          blocked_keywords: normalizeKeywords(filters.blockedKeywords),
        })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FILTERS_KEY }),
  });
}

/** Saves the per-topic overrides of the given topics. */
export function useSaveTopicRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: { slug: string; rules: TopicFilterRules }[]) => {
      for (const { slug, rules } of changes) {
        const { error } = await supabase
          .from("topics")
          .update({
            min_duration_seconds: rules.minDurationSeconds,
            allow_live_recordings: rules.allowLiveRecordings,
            allowed_keywords: normalizeKeywords(rules.allowedKeywords),
            extra_blocked_keywords: normalizeKeywords(rules.extraBlockedKeywords),
          })
          .eq("slug", slug);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["topics"] }),
  });
}
