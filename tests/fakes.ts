import type { NewSource, SourcePatch, SubscriptionStore } from "../supabase/functions/_shared/subscriptionSync.ts";
import type { SyncStore } from "../supabase/functions/_shared/syncJob.ts";
import type { FilterSettings, ManagedPlaylist, Source, Topic, VideoRecord } from "../supabase/functions/_shared/types.ts";
import {
  QUOTA_COST,
  YouTubeError,
  type ChannelDetails,
  type PlaylistDetails,
  type PlaylistEntry,
  type VideoDetails,
  type YouTubeApi,
} from "../supabase/functions/_shared/youtubeClient.ts";
import { DEFAULT_FILTERS, NO_TOPIC_RULES } from "../supabase/functions/_shared/filters.ts";

export interface FakeVideo extends VideoDetails {
  channelId: string;
}

/** In-memory YouTube with the same quota costs and insert-at-position semantics as the real API. */
export class FakeYouTube implements YouTubeApi {
  videos = new Map<string, FakeVideo>();
  /** Any playlist, including channel uploads ("UU…") and series playlists. Item order = position. */
  playlists = new Map<string, { title: string; items: { itemId: string; videoId: string }[] }>();
  channels = new Map<string, ChannelDetails & { handle?: string }>();
  failingPlaylists = new Set<string>();
  /** Videos the API refuses to add (e.g. turned private after being fetched). */
  rejectInserts = new Set<string>();
  writes: string[] = [];
  private quota = 0;
  private nextId = 1;

  quotaUsed(): number {
    return this.quota;
  }

  resetQuota(): void {
    this.quota = 0;
    this.writes = [];
  }

  addVideo(video: Partial<FakeVideo> & { id: string; channelId: string; publishedAt: string }): void {
    this.videos.set(video.id, {
      title: `影片 ${video.id}`,
      thumbnailUrl: null,
      durationSeconds: 600,
      liveStatus: "none",
      wasLive: false,
      ...video,
    });
  }

  /** Puts video IDs into a playlist (e.g. an uploads or series playlist), in order. */
  setPlaylist(id: string, videoIds: string[], title = id): void {
    this.playlists.set(id, { title, items: videoIds.map((videoId) => ({ itemId: `item-${this.nextId++}`, videoId })) });
  }

  itemsOf(playlistId: string): string[] {
    return this.playlists.get(playlistId)?.items.map((item) => item.videoId) ?? [];
  }

  async listPlaylistItems(playlistId: string, maxItems: number): Promise<PlaylistEntry[]> {
    const playlist = this.playlists.get(playlistId);
    if (this.failingPlaylists.has(playlistId)) throw new YouTubeError(500, "backendError", "boom");
    if (!playlist) throw new YouTubeError(404, "playlistNotFound", `no playlist ${playlistId}`);
    this.quota += Math.max(1, Math.ceil(Math.min(playlist.items.length, maxItems) / 50)) * QUOTA_COST.read;
    return playlist.items.slice(0, maxItems).map((item, position) => ({ ...item, position }));
  }

  async listVideos(ids: string[]): Promise<VideoDetails[]> {
    this.quota += Math.max(1, Math.ceil(ids.length / 50)) * QUOTA_COST.read;
    return ids.flatMap((id) => {
      const video = this.videos.get(id);
      return video ? [video] : [];
    });
  }

  async createPlaylist(title: string): Promise<string> {
    this.quota += QUOTA_COST.write;
    const id = `PLmanaged${this.nextId++}`;
    this.playlists.set(id, { title, items: [] });
    this.writes.push(`create ${title}`);
    return id;
  }

  async insertPlaylistItem(playlistId: string, videoId: string, position?: number): Promise<void> {
    this.quota += QUOTA_COST.write;
    const playlist = this.playlists.get(playlistId);
    if (!playlist) throw new YouTubeError(404, "playlistNotFound", "missing");
    if (!this.videos.has(videoId) || this.rejectInserts.has(videoId)) throw new YouTubeError(404, "videoNotFound", `no video ${videoId}`);
    if (position !== undefined && position > playlist.items.length) throw new YouTubeError(400, "invalidPlaylistItemPosition", "bad position");
    const item = { itemId: `item-${this.nextId++}`, videoId };
    if (position === undefined) playlist.items.push(item);
    else playlist.items.splice(position, 0, item);
    this.writes.push(`insert ${videoId}`);
  }

  async deletePlaylistItem(itemId: string): Promise<void> {
    this.quota += QUOTA_COST.write;
    for (const playlist of this.playlists.values()) {
      const index = playlist.items.findIndex((item) => item.itemId === itemId);
      if (index >= 0) {
        playlist.items.splice(index, 1);
        this.writes.push(`delete ${itemId}`);
        return;
      }
    }
    throw new YouTubeError(404, "playlistItemNotFound", "missing");
  }

  async getChannel(lookup: { id: string } | { handle: string }): Promise<ChannelDetails | null> {
    this.quota += QUOTA_COST.read;
    for (const channel of this.channels.values()) {
      if ("id" in lookup ? channel.id === lookup.id : channel.handle === lookup.handle) {
        return { id: channel.id, title: channel.title, thumbnailUrl: channel.thumbnailUrl };
      }
    }
    return null;
  }

  async getPlaylist(id: string): Promise<PlaylistDetails | null> {
    this.quota += QUOTA_COST.read;
    const playlist = this.playlists.get(id);
    return playlist ? { id, title: playlist.title, thumbnailUrl: null } : null;
  }

  async getVideoChannelId(videoId: string): Promise<string | null> {
    this.quota += QUOTA_COST.read;
    return this.videos.get(videoId)?.channelId ?? null;
  }

  async listSubscriptions(): Promise<ChannelDetails[]> {
    this.quota += QUOTA_COST.read;
    return [...this.channels.values()];
  }
}

export class FakeStore implements SyncStore, SubscriptionStore {
  filters: FilterSettings = { ...DEFAULT_FILTERS, blockedKeywords: [...DEFAULT_FILTERS.blockedKeywords] };
  sources: Source[] = [];
  topics: Topic[] = [
    { slug: "health", name: "健康", sort: 1, rules: { ...NO_TOPIC_RULES } },
    { slug: "travel", name: "旅遊", sort: 2, rules: { ...NO_TOPIC_RULES } },
  ];
  videos = new Map<string, VideoRecord>();
  managed: ManagedPlaylist[] = [];
  dailyPicks = new Map<string, string[]>();

  async getFilters() {
    return this.filters;
  }
  async getEnabledSources() {
    return this.sources.filter((source) => source.enabled);
  }
  async getAllSources() {
    return this.sources;
  }
  async upsertSources(sources: NewSource[], options?: { ignoreExisting?: boolean }) {
    const created: Source[] = [];
    for (const source of sources) {
      const index = this.sources.findIndex((item) => item.youtubeId === source.youtubeId);
      if (index >= 0 && options?.ignoreExisting) continue;
      const row: Source = { ...source, id: index >= 0 ? this.sources[index].id : `src-${this.sources.length + 1}` };
      if (index >= 0) this.sources[index] = row;
      else this.sources.push(row);
      created.push(row);
    }
    return created;
  }
  async patchSources(patches: SourcePatch[]) {
    for (const { id, ...patch } of patches) {
      this.sources = this.sources.map((source) => (source.id === id ? { ...source, ...patch } : source));
    }
  }
  async getTopics() {
    return this.topics;
  }
  async getVideos(sourceIds: string[]) {
    return [...this.videos.values()].filter((video) => sourceIds.includes(video.sourceId));
  }
  async upsertVideos(videos: VideoRecord[]) {
    for (const video of videos) this.videos.set(`${video.sourceId}/${video.youtubeId}`, video);
  }
  async getManagedPlaylists() {
    return this.managed;
  }
  async saveManagedPlaylist(playlist: ManagedPlaylist) {
    this.managed = [...this.managed.filter((item) => item.key !== playlist.key), playlist];
  }
  async getDailyPicks(fromDate: string, toDate: string) {
    return [...this.dailyPicks.entries()].filter(([date]) => date >= fromDate && date <= toDate).flatMap(([, ids]) => ids);
  }
  async replaceDailyPicks(date: string, videoIds: string[]) {
    this.dailyPicks.set(date, videoIds);
  }
}

export function channelSource(id: string, channelId: string, topicSlug: string): Source {
  return { id, kind: "channel", youtubeId: channelId, title: `頻道 ${id}`, thumbnailUrl: null, topicSlug, enabled: true, origin: "subscription", subscribed: true };
}

export function seriesSource(id: string, playlistId: string, title: string): Source {
  return { id, kind: "playlist", youtubeId: playlistId, title, thumbnailUrl: null, topicSlug: null, enabled: true, origin: "manual", subscribed: false };
}

export function video(overrides: Partial<VideoRecord> & { youtubeId: string }): VideoRecord {
  return {
    sourceId: "s1",
    title: `影片 ${overrides.youtubeId}`,
    thumbnailUrl: null,
    publishedAt: "2026-11-01T00:00:00Z",
    durationSeconds: 600,
    liveStatus: "none",
    wasLive: false,
    seriesPosition: null,
    ...overrides,
  };
}
