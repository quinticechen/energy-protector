import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useSyncSubscriptions } from "@/hooks/useSources";
import { cn } from "@/lib/utils";

/** Syncs the parents' YouTube subscriptions when the page opens, and on demand. */
export function SubscriptionSyncStatus() {
  const { t } = useTranslation();
  const sync = useSyncSubscriptions();
  const started = useRef(false);

  useEffect(() => {
    // Once per page visit (StrictMode mounts effects twice in development).
    if (started.current) return;
    started.current = true;
    sync.mutate();
  }, [sync]);

  let message: string;
  let tone = "text-muted-foreground";
  if (sync.isPending) message = t("sources.syncing");
  else if (sync.isError) {
    message = t("sources.syncError", { message: sync.error.message });
    tone = "text-destructive";
  } else if (sync.data?.skipped) {
    message = t("sources.syncSkipped");
    tone = "text-amber-800";
  } else if (sync.data && (sync.data.added.length > 0 || sync.data.unsubscribed.length > 0)) {
    message = t("sources.synced", {
      added: sync.data.added.length,
      unsubscribed: sync.data.unsubscribed.length,
      disabled: sync.data.disabled.length,
    });
    tone = "text-foreground";
  } else message = t("sources.syncedNoChange");

  return (
    <div className="flex items-center gap-2 text-sm" role="status">
      {sync.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
      <span className={cn("flex-1", tone)}>{message}</span>
      <IconButton icon={RefreshCw} label={t("sources.syncNow")} disabled={sync.isPending} onClick={() => sync.mutate()} />
    </div>
  );
}
