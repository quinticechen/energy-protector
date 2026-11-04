import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/IconButton";
import { useRunSync } from "@/hooks/useRuns";

export function RunNowButton() {
  const { t } = useTranslation();
  const runSync = useRunSync();

  const run = () => {
    const toastId = toast.loading(t("runs.running"));
    runSync.mutate(undefined, {
      onSuccess: (summary) => {
        if (summary.errors.length > 0) toast.warning(t("runs.doneWithErrors", { count: summary.errors.length }), { id: toastId });
        else toast.success(t("runs.done", { count: summary.playlists.length }), { id: toastId });
      },
      onError: (error) => toast.error(t("runs.failed", { message: error.message }), { id: toastId }),
    });
  };

  return <IconButton icon={RefreshCw} label={t("actions.runNow")} variant="default" loading={runSync.isPending} onClick={run} />;
}
