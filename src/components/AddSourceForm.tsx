import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { parseYouTubeUrl } from "@shared/youtubeUrl.ts";
import { IconButton } from "@/components/IconButton";
import { TopicSelect } from "@/components/TopicSelect";
import { Input } from "@/components/ui/input";
import { AddSourceError, useAddSource } from "@/hooks/useSources";

export function AddSourceForm() {
  const { t } = useTranslation();
  const addSource = useAddSource();
  const [url, setUrl] = useState("");
  const [topicSlug, setTopicSlug] = useState<string | null>(null);

  const ref = parseYouTubeUrl(url);
  const isPlaylist = ref?.type === "playlist";
  const needsTopic = ref !== null && !isPlaylist && !topicSlug;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ref) {
      toast.error(t("sources.errors.invalid_url"));
      return;
    }
    if (needsTopic) {
      toast.error(t("sources.errors.topic_required"));
      return;
    }
    addSource.mutate(
      { url, topicSlug: isPlaylist ? null : topicSlug },
      {
        onSuccess: (source) => {
          toast.success(t("sources.added", { title: source.title }));
          setUrl("");
        },
        onError: (error) => {
          const code = error instanceof AddSourceError ? error.code : "generic";
          toast.error(t(`sources.errors.${code}`, { message: error.message }));
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t("sources.urlPlaceholder")}
          aria-label={t("sources.addTitle")}
          className="flex-1"
        />
        {isPlaylist ? (
          <span className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground sm:w-44">{t("sources.seriesTopic")}</span>
        ) : (
          <TopicSelect value={topicSlug} onChange={setTopicSlug} className="sm:w-44" />
        )}
        <IconButton icon={Plus} type="submit" label={t("actions.add")} variant="default" loading={addSource.isPending} disabled={!url.trim()} />
      </div>
      <p className="text-sm text-muted-foreground">{t("sources.addHint")}</p>
    </form>
  );
}
