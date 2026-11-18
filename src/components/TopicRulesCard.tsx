import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import type { FilterSettings, Topic, TopicFilterRules } from "@shared/types.ts";
import { IconButton } from "@/components/IconButton";
import { KeywordEditor } from "@/components/KeywordEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isCustomized, resetRules } from "@/lib/topicRules";
import { cn } from "@/lib/utils";

const MAX_MINUTES = 120;

interface TopicRulesCardProps {
  topics: Topic[];
  rules: Record<string, TopicFilterRules>;
  global: FilterSettings;
  selected: string;
  onSelect: (slug: string) => void;
  onChange: (slug: string, rules: TopicFilterRules) => void;
}

export function TopicRulesCard({ topics, rules, global, selected, onSelect, onChange }: TopicRulesCardProps) {
  const { t } = useTranslation();
  const current = rules[selected];
  const customizedNames = topics.filter((topic) => isCustomized(rules[topic.slug], global.blockedKeywords)).map((topic) => topic.name);
  const globalMinutes = global.minDurationSeconds / 60;

  const update = (patch: Partial<TopicFilterRules>) => onChange(selected, { ...current, ...patch });
  const allowed = new Set(current?.allowedKeywords.map((word) => word.toLocaleLowerCase()) ?? []);
  const toggleKeyword = (keyword: string) => {
    const lower = keyword.toLocaleLowerCase();
    update({
      allowedKeywords: allowed.has(lower)
        ? current.allowedKeywords.filter((word) => word.toLocaleLowerCase() !== lower)
        : [...current.allowedKeywords, keyword],
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle>{t("topicRules.title")}</CardTitle>
        <CardDescription>{t("topicRules.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="topic-rules-topic">{t("topicRules.topic")}</Label>
            <Select value={selected} onValueChange={onSelect}>
              <SelectTrigger id="topic-rules-topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.slug} value={topic.slug}>
                    {topic.name}
                    {isCustomized(rules[topic.slug], global.blockedKeywords) ? ` · ${t("topicRules.customized")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <IconButton
            icon={RotateCcw}
            label={t("topicRules.resetTopic")}
            variant="outline"
            disabled={!current || !isCustomized(current, global.blockedKeywords)}
            onClick={() => onChange(selected, resetRules())}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {customizedNames.length > 0 ? t("topicRules.customizedList", { names: customizedNames.join("、") }) : t("topicRules.noneCustomized")}
        </p>

        {current && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="topic-min-duration-custom">{t("topicRules.minDuration")}</Label>
                <Switch
                  id="topic-min-duration-custom"
                  checked={current.minDurationSeconds !== null}
                  onCheckedChange={(custom) => update({ minDurationSeconds: custom ? global.minDurationSeconds : null })}
                />
              </div>
              {current.minDurationSeconds === null ? (
                <p className="text-sm text-muted-foreground">{t("topicRules.minDurationGlobal", { minutes: globalMinutes })}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_MINUTES}
                    step={0.5}
                    className="w-24"
                    aria-label={t("topicRules.minDuration")}
                    value={current.minDurationSeconds / 60}
                    onChange={(event) => {
                      const value = Math.min(MAX_MINUTES, Math.max(0, Number(event.target.value) || 0));
                      update({ minDurationSeconds: Math.round(value * 60) });
                    }}
                  />
                  <span className="text-sm text-muted-foreground">{t("filters.minutes")}</span>
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="topic-live-recordings">{t("topicRules.liveRecordings")}</Label>
                <p className="text-sm text-muted-foreground">
                  {global.excludeLive ? t("topicRules.liveRecordingsHint") : t("topicRules.liveRecordingsNoEffect")}
                </p>
              </div>
              <Switch
                id="topic-live-recordings"
                checked={current.allowLiveRecordings}
                onCheckedChange={(allowLiveRecordings) => update({ allowLiveRecordings })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("topicRules.allowedKeywords")}</Label>
              <p className="text-sm text-muted-foreground">
                {global.blockedKeywords.length > 0 ? t("topicRules.allowedKeywordsHint") : t("topicRules.noGlobalKeywords")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {global.blockedKeywords.map((keyword) => {
                  const isAllowed = allowed.has(keyword.toLocaleLowerCase());
                  const state = isAllowed ? t("topicRules.keywordAllowed") : t("topicRules.keywordBlocked");
                  return (
                    <button
                      key={keyword}
                      type="button"
                      aria-pressed={isAllowed}
                      title={t("topicRules.keywordToggle", { keyword, state })}
                      onClick={() => toggleKeyword(keyword)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-sm transition-colors",
                        isAllowed
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 line-through decoration-emerald-700/60"
                          : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
                      )}
                    >
                      {keyword}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topic-extra-keywords">{t("topicRules.extraKeywords")}</Label>
              <p className="text-sm text-muted-foreground">{t("topicRules.extraKeywordsHint")}</p>
              <KeywordEditor
                id="topic-extra-keywords"
                keywords={current.extraBlockedKeywords}
                onChange={(extraBlockedKeywords) => update({ extraBlockedKeywords })}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
