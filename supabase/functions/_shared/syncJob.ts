import { evaluateVideo, filtersBySource } from "./filters.ts";
import {
  addDays,
  dateInTimeZone,
  DAILY_NO_REPEAT_DAYS,
  diffPlaylist,
  selectDaily,
  selectSeries,
  selectTopic,
} from "./selection.ts";
import type { SubscriptionSyncSummary } from "./subscriptionSync.ts";
import type { FilterSettings, ManagedPlaylist, Source, Topic, VideoRecord } from "./types.ts";
import { QUOTA_COST, uploadsPlaylistId, YouTubeError, type YouTubeApi } from "./youtubeClient.ts";

export const DAILY_PLAYLIST_TITLE = "今日精選";
export const SERIES_TITLE_PREFIX = "好劇｜";
const PLAYLIST_DESCRIPTION = "由 Energy Protector 每天自動更新，只收錄家人挑選的頻道。";
const CHANNEL_FETCH_LIMIT = 50;
const SERIES_FETCH_LIMIT = 500;

/** Database access the sync job needs. Implemented with PostgREST in the Edge Function. */
export interface SyncStore {
  getFilters(): Promise<FilterSettings>;
  getEnabledSources(): Promise<Source[]>;
  getTopics(): Promise<Topic[]>;
  getVideos(sourceIds: string[]): Promise<VideoRecord[]>;
  upsertVideos(videos: VideoRecord[]): Promise<void>;
  getManagedPlaylists(): Promise<ManagedPlaylist[]>;
  saveManagedPlaylist(playlist: ManagedPlaylist): Promise<void>;
  /** Video IDs picked for 今日精選 on dates in [fromDate, toDate], inclusive. */
  getDailyPicks(fromDate: string, toDate: string): Promise<string[]>;
  replaceDailyPicks(date: string, videoIds: string[]): Promise<void>;
}

export interface SyncOptions {
  yt: YouTubeApi;
  store: SyncStore;
  now: Date;
  timeZone: string;
  /** Stop writing once this many quota units are used in the run. */
  quotaBudget: number;
  /** Stop writing after this many milliseconds (Edge Functions are killed at 150 s). */
  timeBudgetMs?: number;
  /** Milliseconds clock; injectable for tests. */
  clock?: () => number;
}

export interface PlaylistResult {
  key: string;
  title: string;
  created: boolean;
  inserted: number;
  deleted: number;
  /** Writes left undone because the quota budget ran out. */
  pending: number;
}

export interface SyncSummary {
  fetchedVideos: number;
  playlists: PlaylistResult[];
  errors: string[];
  /** Expected, harmless conditions (shown in run history, never emailed). */
  notices: string[];
  quotaUsed: number;
  budgetExhausted: boolean;
  /** True when the run stopped writing because it ran out of time. */
  timeExhausted: boolean;
  /** Filled by the Edge Function, which syncs subscriptions before the playlists. */
  subscriptions?: SubscriptionSyncSummary | null;
}

interface PlaylistPlan {
  key: string;
  title: string;
  target: string[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchSourceVideos(yt: YouTubeApi, source: Source): Promise<VideoRecord[]> {
  const isSeries = source.kind === "playlist";
  const playlistId = isSeries ? source.youtubeId : uploadsPlaylistId(source.youtubeId);
  const entries = await yt.listPlaylistItems(playlistId, isSeries ? SERIES_FETCH_LIMIT : CHANNEL_FETCH_LIMIT);
  const positions = new Map(entries.map((entry) => [entry.videoId, entry.position]));
  // Deleted and private videos are missing from the details response and are skipped.
  const details = await yt.listVideos([...positions.keys()]);
  return details.map((video) => ({
    sourceId: source.id,
    youtubeId: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    liveStatus: video.liveStatus,
    wasLive: video.wasLive,
    seriesPosition: isSeries ? positions.get(video.id) ?? null : null,
  }));
}

/** Builds the target content of every managed playlist, in write-priority order. */
export function planPlaylists(input: {
  sources: Source[];
  topics: Topic[];
  kept: VideoRecord[];
  recentlyPicked: Set<string>;
  now: Date;
}): PlaylistPlan[] {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const channelVideos = input.kept.filter((video) => sourceById.get(video.sourceId)?.kind === "channel");

  const plans: PlaylistPlan[] = [
    {
      key: "daily",
      title: DAILY_PLAYLIST_TITLE,
      target: selectDaily({ candidates: channelVideos, recentlyPicked: input.recentlyPicked, now: input.now }),
    },
  ];

  for (const topic of [...input.topics].sort((a, b) => a.sort - b.sort)) {
    const hasChannel = input.sources.some((source) => source.kind === "channel" && source.topicSlug === topic.slug);
    if (!hasChannel) continue;
    const videos = channelVideos.filter((video) => sourceById.get(video.sourceId)?.topicSlug === topic.slug);
    plans.push({ key: `topic:${topic.slug}`, title: topic.name, target: selectTopic(videos) });
  }

  for (const source of input.sources.filter((item) => item.kind === "playlist")) {
    const videos = input.kept.filter((video) => video.sourceId === source.id);
    plans.push({ key: `series:${source.id}`, title: `${SERIES_TITLE_PREFIX}${source.title}`, target: selectSeries(videos) });
  }

  return plans;
}

/** One daily run: fetch whitelist videos, filter, select, and sync the managed playlists. */
export async function runSync({ yt, store, now, timeZone, quotaBudget, timeBudgetMs = Infinity, clock = Date.now }: SyncOptions): Promise<SyncSummary> {
  const errors: string[] = [];
  const notices: string[] = [];
  const deadline = clock() + timeBudgetMs;
  const [filters, sources, topics, managed] = await Promise.all([
    store.getFilters(),
    store.getEnabledSources(),
    store.getTopics(),
    store.getManagedPlaylists(),
  ]);

  // 1. Fetch. A source that fails falls back to the videos stored on earlier runs.
  const fresh: VideoRecord[] = [];
  const failedSourceIds: string[] = [];
  for (const source of sources) {
    try {
      fresh.push(...(await fetchSourceVideos(yt, source)));
    } catch (error) {
      // Auto-generated "- Topic" music channels can have no uploads playlist at all.
      if (source.kind === "channel" && error instanceof YouTubeError && error.status === 404) {
        notices.push(`「${source.title}」沒有上傳影片清單（YouTube 自動產生的頻道常見），略過。`);
        continue;
      }
      failedSourceIds.push(source.id);
      errors.push(`抓取來源「${source.title}」失敗：${describe(error)}`);
    }
  }
  if (fresh.length > 0) await store.upsertVideos(fresh);
  const stored = failedSourceIds.length > 0 ? await store.getVideos(failedSourceIds) : [];

  // 2. Filter and plan.
  const filtersFor = filtersBySource(filters, sources, topics);
  const kept = [...fresh, ...stored].filter((video) => evaluateVideo(video, filtersFor(video.sourceId)).kept);
  const today = dateInTimeZone(now, timeZone);
  const recentlyPicked = new Set(await store.getDailyPicks(addDays(today, -DAILY_NO_REPEAT_DAYS), addDays(today, -1)));
  const plans = planPlaylists({ sources, topics, kept, recentlyPicked, now });

  // 3. Write, in priority order, until the quota budget runs out.
  const managedByKey = new Map(managed.map((playlist) => [playlist.key, playlist]));
  const results: PlaylistResult[] = [];
  let budgetExhausted = false;
  let timeExhausted = false;
  const canWrite = () => {
    if (yt.quotaUsed() + QUOTA_COST.write > quotaBudget) budgetExhausted = true;
    if (clock() >= deadline) timeExhausted = true;
    return !budgetExhausted && !timeExhausted;
  };

  for (const plan of plans) {
    const result: PlaylistResult = { key: plan.key, title: plan.title, created: false, inserted: 0, deleted: 0, pending: 0 };
    results.push(result);
    try {
      let playlist = managedByKey.get(plan.key);
      let current: { itemId: string; videoId: string }[] = [];
      if (playlist) {
        try {
          current = await yt.listPlaylistItems(playlist.youtubePlaylistId, 5000);
        } catch (error) {
          // The playlist was deleted on YouTube: create it again.
          if (!(error instanceof YouTubeError && error.status === 404)) throw error;
          playlist = undefined;
        }
      }
      if (!playlist) {
        if (!canWrite()) {
          result.pending = plan.target.length + 1;
          continue;
        }
        const youtubePlaylistId = await yt.createPlaylist(plan.title, PLAYLIST_DESCRIPTION);
        playlist = { key: plan.key, youtubePlaylistId, title: plan.title };
        await store.saveManagedPlaylist(playlist);
        result.created = true;
      }

      const diff = diffPlaylist(current, plan.target);
      const present = new Set(current.map((item) => item.videoId));
      for (const item of diff.deletes) {
        if (!canWrite()) break;
        try {
          await yt.deletePlaylistItem(item.itemId);
          result.deleted += 1;
          present.delete(item.videoId);
        } catch (error) {
          errors.push(`「${plan.title}」移除影片 ${item.videoId} 失敗：${describe(error)}`);
        }
      }
      // Inserting at target positions is only safe once every stale item is gone.
      const deletesDone = result.deleted === diff.deletes.length;
      let failedInserts = 0;
      for (const insert of diff.inserts) {
        if (!canWrite()) break;
        try {
          await yt.insertPlaylistItem(playlist.youtubePlaylistId, insert.videoId, deletesDone ? insert.position - failedInserts : undefined);
          result.inserted += 1;
          present.add(insert.videoId);
        } catch (error) {
          // Skip videos that became private or were removed; later positions shift up by one.
          failedInserts += 1;
          errors.push(`「${plan.title}」加入影片 ${insert.videoId} 失敗：${describe(error)}`);
        }
      }
      result.pending = diff.deletes.length - result.deleted + diff.inserts.length - result.inserted - failedInserts;

      if (plan.key === "daily") {
        await store.replaceDailyPicks(today, plan.target.filter((videoId) => present.has(videoId)));
      }
    } catch (error) {
      errors.push(`更新播放清單「${plan.title}」失敗：${describe(error)}`);
    }
  }

  return { fetchedVideos: fresh.length, playlists: results, errors, notices, quotaUsed: yt.quotaUsed(), budgetExhausted, timeExhausted };
}
