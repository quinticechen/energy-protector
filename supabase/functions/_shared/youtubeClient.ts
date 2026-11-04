import { parseIsoDuration } from "./duration.ts";
import type { LiveStatus } from "./types.ts";

const API = "https://www.googleapis.com/youtube/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Approximate quota cost per call (YouTube Data API v3). */
export const QUOTA_COST = { read: 1, write: 50 } as const;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class YouTubeError extends Error {
  readonly status: number;
  readonly reason: string | null;
  constructor(status: number, reason: string | null, message: string) {
    super(message);
    this.name = "YouTubeError";
    this.status = status;
    this.reason = reason;
  }
}

export interface PlaylistEntry {
  itemId: string;
  videoId: string;
  position: number;
}

export interface VideoDetails {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  liveStatus: LiveStatus;
  wasLive: boolean;
}

export interface ChannelDetails {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface PlaylistDetails {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface YouTubeApi {
  listPlaylistItems(playlistId: string, maxItems: number): Promise<PlaylistEntry[]>;
  listVideos(ids: string[]): Promise<VideoDetails[]>;
  createPlaylist(title: string, description: string): Promise<string>;
  insertPlaylistItem(playlistId: string, videoId: string, position?: number): Promise<void>;
  deletePlaylistItem(itemId: string): Promise<void>;
  getChannel(lookup: { id: string } | { handle: string }): Promise<ChannelDetails | null>;
  getPlaylist(id: string): Promise<PlaylistDetails | null>;
  getVideoChannelId(videoId: string): Promise<string | null>;
  listSubscriptions(): Promise<ChannelDetails[]>;
  quotaUsed(): number;
}

/** Channel uploads playlist: "UCxxxx" → "UUxxxx". */
export function uploadsPlaylistId(channelId: string): string {
  return `UU${channelId.slice(2)}`;
}

export async function refreshAccessToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchFn?: FetchFn;
}): Promise<string> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    // "invalid_grant" means the parents' authorization was revoked or expired: run `ep link` again.
    throw new YouTubeError(response.status, body.error ?? null, `OAuth refresh failed: ${body.error_description ?? body.error ?? response.status}`);
  }
  return body.access_token;
}

interface Thumbnails {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}

function pickThumbnail(thumbnails: Thumbnails | undefined): string | null {
  return thumbnails?.medium?.url ?? thumbnails?.high?.url ?? thumbnails?.default?.url ?? null;
}

export function createYouTubeClient(options: { accessToken: string; fetchFn?: FetchFn }): YouTubeApi {
  const fetchFn = options.fetchFn ?? fetch;
  let quota = 0;

  async function call<T>(method: string, path: string, params: Record<string, string>, cost: number, body?: unknown): Promise<T> {
    quota += cost;
    const url = `${API}/${path}?${new URLSearchParams(params).toString()}`;
    const response = await fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return undefined as T;
    const json = (await response.json()) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
    if (!response.ok) {
      const reason = json.error?.errors?.[0]?.reason ?? null;
      throw new YouTubeError(response.status, reason, `YouTube ${method} ${path} failed (${response.status}${reason ? ` ${reason}` : ""}): ${json.error?.message ?? ""}`);
    }
    return json;
  }

  async function paged<T>(path: string, params: Record<string, string>, maxItems: number): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    do {
      const page = await call<{ items?: T[]; nextPageToken?: string }>(
        "GET",
        path,
        { ...params, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
        QUOTA_COST.read,
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken && items.length < maxItems);
    return items.slice(0, maxItems);
  }

  return {
    quotaUsed: () => quota,

    async listPlaylistItems(playlistId, maxItems) {
      const items = await paged<{ id: string; snippet: { position: number }; contentDetails: { videoId: string } }>(
        "playlistItems",
        { part: "snippet,contentDetails", playlistId },
        maxItems,
      );
      return items.map((item) => ({ itemId: item.id, videoId: item.contentDetails.videoId, position: item.snippet.position }));
    },

    async listVideos(ids) {
      const result: VideoDetails[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const page = await call<{
          items?: {
            id: string;
            snippet: { title: string; publishedAt: string; liveBroadcastContent: string; thumbnails?: Thumbnails };
            contentDetails?: { duration?: string };
            liveStreamingDetails?: unknown;
          }[];
        }>("GET", "videos", { part: "snippet,contentDetails,liveStreamingDetails", id: ids.slice(i, i + 50).join(",") }, QUOTA_COST.read);
        for (const item of page.items ?? []) {
          const live = item.snippet.liveBroadcastContent;
          result.push({
            id: item.id,
            title: item.snippet.title,
            thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
            publishedAt: item.snippet.publishedAt,
            durationSeconds: parseIsoDuration(item.contentDetails?.duration),
            liveStatus: live === "live" || live === "upcoming" ? live : "none",
            wasLive: item.liveStreamingDetails !== undefined,
          });
        }
      }
      return result;
    },

    async createPlaylist(title, description) {
      const created = await call<{ id: string }>(
        "POST",
        "playlists",
        { part: "snippet,status" },
        QUOTA_COST.write,
        { snippet: { title, description }, status: { privacyStatus: "private" } },
      );
      return created.id;
    },

    async insertPlaylistItem(playlistId, videoId, position) {
      await call("POST", "playlistItems", { part: "snippet" }, QUOTA_COST.write, {
        snippet: { playlistId, resourceId: { kind: "youtube#video", videoId }, ...(position === undefined ? {} : { position }) },
      });
    },

    async deletePlaylistItem(itemId) {
      await call("DELETE", "playlistItems", { id: itemId }, QUOTA_COST.write);
    },

    async getChannel(lookup) {
      const params: Record<string, string> = "id" in lookup ? { id: lookup.id } : { forHandle: lookup.handle };
      const page = await call<{ items?: { id: string; snippet: { title: string; thumbnails?: Thumbnails } }[] }>(
        "GET",
        "channels",
        { part: "snippet", ...params },
        QUOTA_COST.read,
      );
      const item = page.items?.[0];
      return item ? { id: item.id, title: item.snippet.title, thumbnailUrl: pickThumbnail(item.snippet.thumbnails) } : null;
    },

    async getPlaylist(id) {
      const page = await call<{ items?: { id: string; snippet: { title: string; thumbnails?: Thumbnails } }[] }>(
        "GET",
        "playlists",
        { part: "snippet", id },
        QUOTA_COST.read,
      );
      const item = page.items?.[0];
      return item ? { id: item.id, title: item.snippet.title, thumbnailUrl: pickThumbnail(item.snippet.thumbnails) } : null;
    },

    async getVideoChannelId(videoId) {
      const page = await call<{ items?: { snippet: { channelId: string } }[] }>("GET", "videos", { part: "snippet", id: videoId }, QUOTA_COST.read);
      return page.items?.[0]?.snippet.channelId ?? null;
    },

    async listSubscriptions() {
      const items = await paged<{ snippet: { title: string; thumbnails?: Thumbnails; resourceId: { channelId: string } } }>(
        "subscriptions",
        { part: "snippet", mine: "true" },
        1000,
      );
      return items.map((item) => ({
        id: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnailUrl: pickThumbnail(item.snippet.thumbnails),
      }));
    },
  };
}
