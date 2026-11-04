import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { FilterSettings } from "@shared/types.ts";
import { FilterPreview } from "@/components/FilterPreview";
import { IconButton } from "@/components/IconButton";
import { KeywordEditor } from "@/components/KeywordEditor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useFilters, useSaveFilters } from "@/hooks/useFilters";

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
  const save = useSaveFilters();
  const [draft, setDraft] = useState<FilterSettings | null>(null);

  useEffect(() => {
    if (saved.data) setDraft(saved.data);
  }, [saved.data]);

  if (saved.isError) return <p className="text-destructive">{t("common.loadError", { message: saved.error.message })}</p>;
  if (!draft || !saved.data) return <Skeleton className="h-96 w-full" />;

  const dirty = !sameFilters(draft, saved.data);
  const minutes = draft.minDurationSeconds / 60;

  const onSave = () =>
    save.mutate(draft, {
      onSuccess: () => toast.success(t("filters.saved")),
      onError: (error) => toast.error(t("filters.saveError", { message: error.message })),
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t("filters.title")}</CardTitle>
            <CardDescription>{t("filters.description")}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton icon={RotateCcw} label={t("actions.reset")} disabled={!dirty || save.isPending} onClick={() => setDraft(saved.data)} />
            <IconButton icon={Save} label={t("actions.save")} variant="default" disabled={!dirty} loading={save.isPending} onClick={onSave} />
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

      <FilterPreview filters={draft} />
    </div>
  );
}
