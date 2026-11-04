import type { SourceKind } from "./types.ts";
import type { YouTubeApi } from "./youtubeClient.ts";
import { parseYouTubeUrl } from "./youtubeUrl.ts";

export interface ResolvedSource {
  kind: SourceKind;
  youtubeId: string;
  title: string;
  thumbnailUrl: string | null;
}

export type ResolveResult = { ok: true; source: ResolvedSource } | { ok: false; error: "invalid_url" | "not_found" };

/**
 * Turns a pasted link into a whitelist source. A video link adds the video's channel;
 * a playlist link adds the playlist (a drama series).
 */
export async function resolveSource(yt: YouTubeApi, input: string): Promise<ResolveResult> {
  const ref = parseYouTubeUrl(input);
  if (!ref) return { ok: false, error: "invalid_url" };

  if (ref.type === "playlist") {
    const playlist = await yt.getPlaylist(ref.playlistId);
    return playlist
      ? { ok: true, source: { kind: "playlist", youtubeId: playlist.id, title: playlist.title, thumbnailUrl: playlist.thumbnailUrl } }
      : { ok: false, error: "not_found" };
  }

  let lookup: { id: string } | { handle: string };
  if (ref.type === "channel") lookup = { id: ref.channelId };
  else if (ref.type === "handle") lookup = { handle: ref.handle };
  else {
    const channelId = await yt.getVideoChannelId(ref.videoId);
    if (!channelId) return { ok: false, error: "not_found" };
    lookup = { id: channelId };
  }

  const channel = await yt.getChannel(lookup);
  return channel
    ? { ok: true, source: { kind: "channel", youtubeId: channel.id, title: channel.title, thumbnailUrl: channel.thumbnailUrl } }
    : { ok: false, error: "not_found" };
}
