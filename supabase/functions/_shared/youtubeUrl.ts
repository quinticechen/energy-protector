export type YouTubeRef =
  | { type: "channel"; channelId: string }
  | { type: "handle"; handle: string }
  | { type: "video"; videoId: string }
  | { type: "playlist"; playlistId: string };

const CHANNEL_ID = /^UC[\w-]{22}$/;
const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^(PL|OL|UU|FL|RD)[\w-]{10,}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

/**
 * Parses a pasted YouTube link (or a bare channel ID / @handle) into what it points to.
 * A watch URL with a `list` parameter is treated as a playlist, because that is how
 * people usually share a series.
 */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  const text = input.trim();
  if (!text) return null;
  if (CHANNEL_ID.test(text)) return { type: "channel", channelId: text };
  if (/^@[\w.\-·　-鿿]+$/u.test(text)) return { type: "handle", handle: text };
  if (PLAYLIST_ID.test(text) && text.length > 11) return { type: "playlist", playlistId: text };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const list = url.searchParams.get("list");

  if (host === "youtu.be") {
    if (list) return { type: "playlist", playlistId: list };
    return segments[0] && VIDEO_ID.test(segments[0]) ? { type: "video", videoId: segments[0] } : null;
  }

  const [first, second] = segments;
  if (first === "playlist" && list) return { type: "playlist", playlistId: list };
  if (first === "watch") {
    if (list) return { type: "playlist", playlistId: list };
    const v = url.searchParams.get("v");
    return v && VIDEO_ID.test(v) ? { type: "video", videoId: v } : null;
  }
  if ((first === "shorts" || first === "live" || first === "embed") && second && VIDEO_ID.test(second)) {
    return { type: "video", videoId: second };
  }
  if (first === "channel" && second && CHANNEL_ID.test(second)) return { type: "channel", channelId: second };
  if (first?.startsWith("@")) return { type: "handle", handle: first };
  return null;
}
