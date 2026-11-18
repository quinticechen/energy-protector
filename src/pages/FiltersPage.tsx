import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { FilterSettings, TopicFilterRules } from "@shared/types.ts";
import { FilterPreview } from "@/components/FilterPreview";
import { IconButton } from "@/components/IconButton";
import { KeywordEditor } from "@/components/KeywordEditor";
import { TopicRulesCard } from "@/components/TopicRulesCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFilters, useSaveFilters, useSaveTopicRules } from "@/hooks/useFilters";
import { useTopics } from "@/hooks/useSources";
import { sameRules } from "@/lib/topicRules";

const MAX_MINUTES = 120;

function sameFilters(a: FilterSettings, b: FilterSettings): boolean {
  return (
    a.minDurationSeconds === b.minDurationSeconds &&
    a.excludeLive === b.excludeLive &&
    a.blockedKeywords.join("\u0000") === b.blockedKeywords.join("\u0000")
  );
}

export function FiltersPage() {
  const { t } = useTranslation();
  const saved = useFilters();
  const topics = useTopics();
  const saveFilters = useSaveFilters();
  const saveTopicRules = useSaveTopicRules();
  const [draft, setDraft] = useState<FilterSettings | null>(null);
  const [topicDraft, setTopicDraft] = useState<Record<string, TopicFilterRules> | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [previewTopic, setPreviewTopic] = useState<string | null>(null);

  const savedTopicRules = useMemo(
    () => (topics.data ? Object.fromEntries(topics.data.map((topic) => [topic.slug, topic.rules])) : null),
    [topics.data],
  );

  useEffect(() => {
    if (saved.data) setDraft(saved.data);
  }, [saved.data]);
  useEffect(() => {
    if (savedTopicRules) setTopicDraft(savedTopicRules);
  }, [savedTopicRules]);
  useEffect(() => {
    if (!selectedTopic && topics.data?.[0]) setSelectedTopic(topics.data[0].slug);
  }, [topics.data, selectedTopic]);

  const error = saved.error ?? topics.error;
  if (error) return <p className="text-destructive">{t("common.loadError", { message: error.message })}</p>;
  if (!draft || !saved.data || !topicDraft || !savedTopicRules || !topics.data || !selectedTopic) {
    return <Skeleton className="h-96 w-full" />;
  }

  const globalDirty = !sameFilters(draft, saved.data);
  const changedTopics = topics.data
    .filter((topic) => !sameRules(topicDraft[topic.slug], savedTopicRules[topic.slug]))
    .map((topic) => ({ slug: topic.slug, rules: topicDraft[topic.slug] }));
  const dirty = globalDirty || changedTopics.length > 0;
  const saving = saveFilters.isPending || saveTopicRules.isPending;
  const minutes = draft.minDurationSeconds / 60;

  const onSave = async () => {
    try {
      if (globalDirty) await saveFilters.mutateAsync(draft);
      if (changedTopics.length > 0) await saveTopicRules.mutateAsync(changedTopics);
      toast.success(t("filters.saved"));
    } catch (saveError) {
      toast.error(t("filters.saveError", { message: saveError instanceof Error ? saveError.message : String(saveError) }));
    }
  };

  const onRevert = () => {
    setDraft(saved.data);
    setTopicDraft(savedTopicRules);
  };

  const selectTopic = (slug: string) => {
    setSelectedTopic(slug);
    // Show the topic being edited in the preview.
    setPreviewTopic(slug);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>{t("filters.title")}</CardTitle>
              <CardDescription>{t("filters.description")}</CardDescription>
            </div>
            <div className="flex shrink-0 gap-1">
              <IconButton icon={RotateCcw} label={t("actions.reset")} disabled={!dirty || saving} onClick={onRevert} />
              <IconButton icon={Save} label={t("actions.save")} variant="default" disabled={!dirty} loading={saving} onClick={() => void onSave()} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {dirty && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("filters.unsaved")}</p>}

            <div className="space-y-2">
              <Label htmlFor="min-duration">{t("filters.minDuration")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="min-duration"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_MINUTES}
                  step={0.5}
                  className="w-24"
                  value={minutes}
                  onChange={(event) => {
                    const value = Math.min(MAX_MINUTES, Math.max(0, Number(event.target.value) || 0));
                    setDraft({ ...draft, minDurationSeconds: Math.round(value * 60) });
                  }}
                />
                <span className="text-sm text-muted-foreground">{t("filters.minutes")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("filters.minDurationHint", { minutes })}</p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="exclude-live">{t("filters.excludeLive")}</Label>
                <p className="text-sm text-muted-foreground">{t("filters.excludeLiveHint")}</p>
              </div>
              <Switch id="exclude-live" checked={draft.excludeLive} onCheckedChange={(excludeLive) => setDraft({ ...draft, excludeLive })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">{t("filters.keywords")}</Label>
              <p className="text-sm text-muted-foreground">{t("filters.keywordsHint")}</p>
              <KeywordEditor id="keywords" keywords={draft.blockedKeywords} onChange={(blockedKeywords) => setDraft({ ...draft, blockedKeywords })} />
            </div>
          </CardContent>
        </Card>

        <TopicRulesCard
          topics={topics.data}
          rules={topicDraft}
          global={draft}
          selected={selectedTopic}
          onSelect={selectTopic}
          onChange={(slug, rules) => setTopicDraft({ ...topicDraft, [slug]: rules })}
        />
      </div>

      <div className="lg:sticky lg:top-20 lg:h-fit">
        <FilterPreview
          filters={draft}
          topics={topics.data}
          topicRules={topicDraft}
          topicSlug={previewTopic}
          onTopicChange={setPreviewTopic}
        />
      </div>
    </div>
  );
}
