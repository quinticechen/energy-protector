import { useQuery } from "@tanstack/react-query";
import type { LiveStatus, VideoRecord } from "@shared/types.ts";
import { supabase } from "@/lib/supabase";

export interface PreviewVideo extends VideoRecord {
  sourceTitle: string;
}

/** The most recently published fetched videos, for the filter preview. */
export function usePreviewVideos(limit = 150) {
  return useQuery({
    queryKey: ["preview-videos", limit],
    queryFn: async (): Promise<PreviewVideo[]> => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, sources(title)")
        .order("published_at", { ascending: false })
        .limit(limit);
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
        sourceTitle: row.sources?.title ?? "",
      }));
    },
  });
}
