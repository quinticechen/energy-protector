/** 185 → "3:05", 3723 → "1:02:03". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(iso));
}

export function youtubeUrl(kind: "channel" | "playlist" | "video", id: string): string {
  if (kind === "channel") return `https://www.youtube.com/channel/${id}`;
  if (kind === "playlist") return `https://www.youtube.com/playlist?list=${id}`;
  return `https://www.youtube.com/watch?v=${id}`;
}
