import { useQuery } from "@tanstack/react-query";
import type { LiveStatus, SourceKind, VideoRecord } from "@shared/types.ts";
import { supabase } from "@/lib/supabase";

export interface PreviewVideo extends VideoRecord {
  sourceTitle: string;
  sourceKind: SourceKind;
  /** The source's topic (channels only). */
  topicSlug: string | null;
}

/** The most recently published fetched videos, optionally only one topic's, for the filter preview. */
export function usePreviewVideos(topicSlug: string | null, limit = 150) {
  return useQuery({
    queryKey: ["preview-videos", topicSlug, limit],
    queryFn: async (): Promise<PreviewVideo[]> => {
      let query = supabase
        .from("videos")
        .select("*, sources!inner(title, kind, topic_slug)")
        .order("published_at", { ascending: false })
        .limit(limit);
      if (topicSlug) query = query.eq("sources.topic_slug", topicSlug);
      const { data, error } = await query;
      if (error) throw error;
      return data.map((row) => ({
        sourceId: row.source_id,
        youtubeId: row.youtube_id,
        title: row.title,
        thumbnailUrl: row.thumbnail_url,
        publishedAt: row.published_at,
        durationSeconds: row.duration_seconds,
        liveStatus: row.live_status as LiveStatus,
        wasLive: row.was_live,
        seriesPosition: row.series_position,
        sourceTitle: row.sources.title,
        sourceKind: row.sources.kind as SourceKind,
        topicSlug: row.sources.kind === "channel" ? row.sources.topic_slug : null,
      }));
    },
  });
}
