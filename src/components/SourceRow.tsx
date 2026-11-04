import { useTranslation } from "react-i18next";
import { ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Source } from "@shared/types.ts";
import { IconButton } from "@/components/IconButton";
import { TopicSelect } from "@/components/TopicSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { useDeleteSource, useUpdateSource } from "@/hooks/useSources";
import { youtubeUrl } from "@/lib/format";

export function SourceRow({ source }: { source: Source }) {
  const { t } = useTranslation();
  const update = useUpdateSource();
  const remove = useDeleteSource();
  const isChannel = source.kind === "channel";
  // The database requires a topic before a channel can be enabled.
  const canEnable = !isChannel || source.topicSlug !== null;

  const onError = (error: Error) => toast.error(t("sources.errors.generic", { message: error.message }));

  return (
    <TableRow className={source.enabled ? undefined : "text-muted-foreground"}>
      <TableCell className="w-14">
        {source.thumbnailUrl ? (
          <img src={source.thumbnailUrl} alt="" loading="lazy" className={isChannel ? "h-10 w-10 rounded-full object-cover" : "h-10 w-16 rounded object-cover"} />
        ) : (
          <div className="h-10 w-10 rounded-full bg-muted" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{source.title}</span>
          <Badge variant={isChannel ? "outline" : "secondary"} className="font-normal">
            {isChannel ? t("sources.kindChannel") : t("sources.kindPlaylist")}
          </Badge>
          {isChannel && source.origin === "subscription" && !source.subscribed && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 font-normal text-amber-900" title={t("sources.unsubscribedHint")}>
              {t("sources.unsubscribed")}
            </Badge>
          )}
          {source.origin === "manual" && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {t("sources.manual")}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="w-48">
        {isChannel ? (
          <TopicSelect
            value={source.topicSlug}
            onChange={(topicSlug) => update.mutate({ id: source.id, topicSlug }, { onError })}
            className="h-9"
            aria-label={`${source.title} · ${t("sources.topicPlaceholder")}`}
          />
        ) : (
          <span className="text-sm">{t("sources.seriesTopic")}</span>
        )}
      </TableCell>
      <TableCell className="w-20">
        <Switch
          checked={source.enabled}
          disabled={!canEnable || update.isPending}
          onCheckedChange={(enabled) => update.mutate({ id: source.id, enabled }, { onError })}
          aria-label={`${source.title} · ${t("sources.enabled")}`}
          title={canEnable ? t("sources.enabled") : t("sources.topicRequired")}
        />
      </TableCell>
      <TableCell className="w-24">
        <div className="flex justify-end gap-1">
        <IconButton
          icon={ExternalLink}
          label={t("actions.openOnYouTube")}
          onClick={() => window.open(youtubeUrl(source.kind, source.youtubeId), "_blank", "noreferrer")}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <IconButton icon={Trash2} label={t("actions.delete")} className="text-destructive hover:text-destructive" loading={remove.isPending} />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("sources.deleteTitle", { title: source.title })}</AlertDialogTitle>
              <AlertDialogDescription>{t("sources.deleteBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => remove.mutate(source.id, { onSuccess: () => toast.success(t("sources.deleted")), onError })}
              >
                {t("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
