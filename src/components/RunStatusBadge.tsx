import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/hooks/useRuns";
import { cn } from "@/lib/utils";

const STYLES: Record<RunStatus, string> = {
  running: "bg-sky-50 text-sky-800 border-sky-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-amber-50 text-amber-900 border-amber-200",
  failed: "bg-red-50 text-red-800 border-red-200",
};

const LABEL_KEYS: Record<RunStatus, string> = {
  running: "runs.statusRunning",
  success: "runs.statusSuccess",
  partial: "runs.statusPartial",
  failed: "runs.statusFailed",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("font-normal", STYLES[status])}>
      {t(LABEL_KEYS[status])}
    </Badge>
  );
}
