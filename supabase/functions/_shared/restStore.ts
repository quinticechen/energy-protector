import type { SourcePatch, SubscriptionStore } from "./subscriptionSync.ts";
import type { SyncStore, SyncSummary } from "./syncJob.ts";
import type { FilterSettings, LiveStatus, ManagedPlaylist, Source, SourceKind, SourceOrigin, Topic, VideoRecord } from "./types.ts";
import type { FetchFn } from "./youtubeClient.ts";

interface SourceRow {
  id: string;
  kind: SourceKind;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  topic_slug: string | null;
  enabled: boolean;
  origin: SourceOrigin;
  subscribed: boolean;
}

interface VideoRow {
  source_id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  duration_seconds: number | null;
  live_status: LiveStatus;
  was_live: boolean;
  series_position: number | null;
}

export interface TopicRow {
  slug: string;
  name: string;
  sort: number;
  min_duration_seconds: number | null;
  allow_live_recordings: boolean;
  allowed_keywords: string[];
  extra_blocked_keywords: string[];
}

export function topicFromRow(row: TopicRow): Topic {
  return {
    slug: row.slug,
    name: row.name,
    sort: row.sort,
    rules: {
      minDurationSeconds: row.min_duration_seconds,
      allowLiveRecordings: row.allow_live_recordings,
      allowedKeywords: row.allowed_keywords,
      extraBlockedKeywords: row.extra_blocked_keywords,
    },
  };
}

export function sourceFromRow(row: SourceRow): Source {
  return {
    id: row.id,
    kind: row.kind,
    youtubeId: row.youtube_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    topicSlug: row.topic_slug,
    enabled: row.enabled,
    origin: row.origin,
    subscribed: row.subscribed,
  };
}

export function videoFromRow(row: VideoRow): VideoRecord {
  return {
    sourceId: row.source_id,
    youtubeId: row.youtube_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    durationSeconds: row.duration_seconds,
    liveStatus: row.live_status,
    wasLive: row.was_live,
    seriesPosition: row.series_position,
  };
}

function videoToRow(video: VideoRecord): VideoRow & { fetched_at: string } {
  return {
    source_id: video.sourceId,
    youtube_id: video.youtubeId,
    title: video.title,
    thumbnail_url: video.thumbnailUrl,
    published_at: video.publishedAt,
    duration_seconds: video.durationSeconds,
    live_status: video.liveStatus,
    was_live: video.wasLive,
    series_position: video.seriesPosition,
    fetched_at: new Date().toISOString(),
  };
}

export interface RestStore extends SyncStore, SubscriptionStore {
  isAdmin(email: string): Promise<boolean>;
  startRun(trigger: "cron" | "manual"): Promise<number>;
  /** Marks runs stuck in 'running' (the function was killed) as failed. */
  failStaleRuns(olderThan: Date): Promise<void>;
  finishRun(id: number, result: { summary?: SyncSummary; error?: string }): Promise<void>;
}

/** Supabase PostgREST client using the service role key (bypasses RLS). Server-side only. */
export function createRestStore(options: { url: string; serviceKey: string; fetchFn?: FetchFn }): RestStore {
  const fetchFn = options.fetchFn ?? fetch;
  const base = `${options.url.replace(/\/$/, "")}/rest/v1`;

  async function request<T>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    const response = await fetchFn(`${base}/${path}`, {
      method,
      headers: {
        apikey: options.serviceKey,
        authorization: `Bearer ${options.serviceKey}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Database ${method} ${path.split("?")[0]} failed (${response.status}): ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  const inList = (values: string[]) => `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;

  return {
    async getFilters(): Promise<FilterSettings> {
      const [row] = await request<{ min_duration_seconds: number; exclude_live: boolean; blocked_keywords: string[] }[]>(
        "GET",
        "filter_settings?id=eq.1&select=min_duration_seconds,exclude_live,blocked_keywords",
      );
      if (!row) throw new Error("filter_settings row is missing; apply the migration first");
      return { minDurationSeconds: row.min_duration_seconds, excludeLive: row.exclude_live, blockedKeywords: row.blocked_keywords };
    },

    async getEnabledSources() {
      const rows = await request<SourceRow[]>("GET", "sources?enabled=eq.true&select=*&order=created_at");
      return rows.map(sourceFromRow);
    },

    async getTopics(): Promise<Topic[]> {
      const rows = await request<TopicRow[]>("GET", "topics?select=*&order=sort");
      return rows.map(topicFromRow);
    },

    async getVideos(sourceIds) {
      if (sourceIds.length === 0) return [];
      const rows = await request<VideoRow[]>("GET", `videos?source_id=in.${inList(sourceIds)}&select=*`);
      return rows.map(videoFromRow);
    },

    async upsertVideos(videos) {
      for (let i = 0; i < videos.length; i += 500) {
        await request(
          "POST",
          "videos?on_conflict=source_id,youtube_id",
          videos.slice(i, i + 500).map(videoToRow),
          "resolution=merge-duplicates,return=minimal",
        );
      }
    },

    async getManagedPlaylists(): Promise<ManagedPlaylist[]> {
      const rows = await request<{ key: string; youtube_playlist_id: string; title: string }[]>(
        "GET",
        "managed_playlists?select=key,youtube_playlist_id,title",
      );
      return rows.map((row) => ({ key: row.key, youtubePlaylistId: row.youtube_playlist_id, title: row.title }));
    },

    async saveManagedPlaylist(playlist) {
      await request(
        "POST",
        "managed_playlists?on_conflict=key",
        { key: playlist.key, youtube_playlist_id: playlist.youtubePlaylistId, title: playlist.title },
        "resolution=merge-duplicates,return=minimal",
      );
    },

    async getDailyPicks(fromDate, toDate) {
      const rows = await request<{ video_id: string }[]>(
        "GET",
        `daily_picks?picked_on=gte.${fromDate}&picked_on=lte.${toDate}&select=video_id`,
      );
      return rows.map((row) => row.video_id);
    },

    async replaceDailyPicks(date, videoIds) {
      await request("DELETE", `daily_picks?picked_on=eq.${date}`);
      if (videoIds.length > 0) {
        await request("POST", "daily_picks", videoIds.map((video_id) => ({ picked_on: date, video_id })), "return=minimal");
      }
    },

    async isAdmin(email) {
      const rows = await request<{ email: string }[]>("GET", `admins?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email`);
      return rows.length > 0;
    },

    async upsertSources(sources, upsertOptions) {
      if (sources.length === 0) return [];
      const rows = await request<SourceRow[]>(
        "POST",
        "sources?on_conflict=youtube_id",
        sources.map((source) => ({
          kind: source.kind,
          youtube_id: source.youtubeId,
          title: source.title,
          thumbnail_url: source.thumbnailUrl,
          topic_slug: source.topicSlug,
          enabled: source.enabled,
          origin: source.origin,
          subscribed: source.subscribed,
        })),
        `resolution=${upsertOptions?.ignoreExisting ? "ignore" : "merge"}-duplicates,return=representation`,
      );
      return rows.map(sourceFromRow);
    },

    async getAllSources() {
      const rows = await request<SourceRow[]>("GET", "sources?select=*&order=created_at");
      return rows.map(sourceFromRow);
    },

    async patchSources(patches: SourcePatch[]) {
      for (const { id, subscribed, enabled, title, thumbnailUrl, topicSlug } of patches) {
        const body = {
          ...(topicSlug === undefined ? {} : { topic_slug: topicSlug }),
          ...(subscribed === undefined ? {} : { subscribed }),
          ...(enabled === undefined ? {} : { enabled }),
          ...(title === undefined ? {} : { title }),
          ...(thumbnailUrl === undefined ? {} : { thumbnail_url: thumbnailUrl }),
        };
        await request("PATCH", `sources?id=eq.${encodeURIComponent(id)}`, body, "return=minimal");
      }
    },

    async failStaleRuns(olderThan) {
      await request(
        "PATCH",
        `sync_runs?status=eq.running&started_at=lt.${encodeURIComponent(olderThan.toISOString())}`,
        { status: "failed", finished_at: new Date().toISOString(), error: "執行逾時被中止（超過 150 秒）；下次執行會接著完成。" },
        "return=minimal",
      );
    },

    async startRun(trigger) {
      const [row] = await request<{ id: number }[]>("POST", "sync_runs?select=id", { trigger }, "return=representation");
      return row.id;
    },

    async finishRun(id, result) {
      const summary = result.summary;
      const status = result.error ? "failed" : summary && summary.errors.length > 0 ? "partial" : "success";
      await request(
        "PATCH",
        `sync_runs?id=eq.${id}`,
        {
          status,
          finished_at: new Date().toISOString(),
          quota_used: summary?.quotaUsed ?? null,
          summary: summary ?? null,
          error: result.error ?? null,
        },
        "return=minimal",
      );
    },
  };
}
