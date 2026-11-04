// Domain types shared by the Edge Functions, the CLI, the admin UI and tests.

export type SourceKind = "channel" | "playlist";

/** "subscription": imported from the parents' subscriptions; "manual": added by link. */
export type SourceOrigin = "subscription" | "manual";

export type LiveStatus = "none" | "live" | "upcoming";

export interface FilterSettings {
  minDurationSeconds: number;
  excludeLive: boolean;
  blockedKeywords: string[];
}

export interface Topic {
  slug: string;
  name: string;
  sort: number;
}

export interface Source {
  id: string;
  kind: SourceKind;
  youtubeId: string;
  title: string;
  thumbnailUrl: string | null;
  topicSlug: string | null;
  enabled: boolean;
  origin: SourceOrigin;
  /** Whether the parents' account currently subscribes to this channel. */
  subscribed: boolean;
}

export interface VideoRecord {
  sourceId: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number | null;
  liveStatus: LiveStatus;
  wasLive: boolean;
  /** Position inside a series playlist; null for channel uploads. */
  seriesPosition: number | null;
}

export type DropReason =
  | { code: "too_short"; durationSeconds: number | null }
  | { code: "live" }
  | { code: "blocked_keyword"; keyword: string };

export interface FilterVerdict {
  kept: boolean;
  reasons: DropReason[];
}

export interface ManagedPlaylist {
  key: string;
  youtubePlaylistId: string;
  title: string;
}

export interface PlaylistItem {
  itemId: string;
  videoId: string;
}
