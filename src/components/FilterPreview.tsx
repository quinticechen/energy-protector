import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { effectiveFilters, evaluateVideo } from "@shared/filters.ts";
import type { FilterSettings, Topic, TopicFilterRules } from "@shared/types.ts";
import { DropReasonBadge } from "@/components/DropReasonBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewVideos } from "@/hooks/usePreviewVideos";
import { formatDate, formatDuration, youtubeUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL_TOPICS = "__all__";

interface FilterPreviewProps {
  filters: FilterSettings;
  topics: Topic[];
  topicRules: Record<string, TopicFilterRules>;
  /** Topic to preview, or null for all. */
  topicSlug: string | null;
  onTopicChange: (slug: string | null) => void;
}

export function FilterPreview({ filters, topics, topicRules, topicSlug, onTopicChange }: FilterPreviewProps) {
  const { t, i18n } = useTranslation();
  const videos = usePreviewVideos(topicSlug);
  const [droppedOnly, setDroppedOnly] = useState(false);

  // Same rule merge as the daily job: a channel's topic rules on top of the global filters.
  const evaluated = useMemo(() => {
    const cache = new Map<string, FilterSettings>();
    const forTopic = (slug: string | null) => {
      const key = slug ?? "";
      if (!cache.has(key)) cache.set(key, effectiveFilters(filters, slug ? topicRules[slug] : undefined));
      return cache.get(key)!;
    };
    return (videos.data ?? []).map((video) => ({ video, verdict: evaluateVideo(video, forTopic(video.topicSlug)) }));
  }, [videos.data, filters, topicRules]);
  const droppedCount = evaluated.filter((item) => !item.verdict.kept).length;
  const shown = droppedOnly ? evaluated.filter((item) => !item.verdict.kept) : evaluated;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t("preview.title")}</CardTitle>
            <CardDescription>{t("preview.description", { count: evaluated.length })}</CardDescription>
          </div>
          <Select value={topicSlug ?? ALL_TOPICS} onValueChange={(value) => onTopicChange(value === ALL_TOPICS ? null : value)}>
            <SelectTrigger className="w-40" aria-label={t("preview.topicFilter")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TOPICS}>{t("preview.allTopics")}</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.slug} value={topic.slug}>
                  {topic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {evaluated.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">{t("preview.kept", { count: evaluated.length - droppedCount })}</span>
            <span className="rounded-md bg-red-50 px-2 py-1 text-red-800">{t("preview.dropped", { count: droppedCount })}</span>
            <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => setDroppedOnly((value) => !value)}>
              {droppedOnly ? t("preview.showAll") : t("preview.showDropped")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {videos.isPending && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        )}
        {videos.isError && <p className="text-sm text-destructive">{t("common.loadError", { message: videos.error.message })}</p>}
        {videos.isSuccess && evaluated.length === 0 && <p className="text-sm text-muted-foreground">{t("preview.empty")}</p>}
        <ul className="max-h-[70vh] divide-y overflow-y-auto">
          {shown.map(({ video, verdict }) => (
            <li key={`${video.sourceId}/${video.youtubeId}`} className={cn("flex gap-3 py-2.5", !verdict.kept && "opacity-70")}>
              <a href={youtubeUrl("video", video.youtubeId)} target="_blank" rel="noreferrer" className="shrink-0" title={t("actions.openOnYouTube")}>
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" loading="lazy" className={cn("h-14 w-24 rounded object-cover", !verdict.kept && "grayscale")} />
                ) : (
                  <div className="h-14 w-24 rounded bg-muted" />
                )}
              </a>
              <div className="min-w-0 flex-1 space-y-1">
                <p className={cn("line-clamp-2 text-sm leading-snug", !verdict.kept && "line-through decoration-muted-foreground/50")}>{video.title}</p>
                <p className="text-xs text-muted-foreground">
                  {video.sourceTitle} · {formatDate(video.publishedAt, i18n.language)}
                  {video.durationSeconds !== null && ` · ${formatDuration(video.durationSeconds)}`}
                </p>
                {!verdict.kept && (
                  <div className="flex flex-wrap gap-1">
                    {verdict.reasons.map((reason) => (
                      <DropReasonBadge key={reason.code === "blocked_keyword" ? `kw-${reason.keyword}` : reason.code} reason={reason} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
