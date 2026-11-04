import { useTranslation } from "react-i18next";
import type { DropReason } from "@shared/types.ts";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/format";

export function DropReasonBadge({ reason }: { reason: DropReason }) {
  const { t } = useTranslation();
  let text: string;
  if (reason.code === "too_short") {
    text =
      reason.durationSeconds === null
        ? t("preview.reasons.too_short_unknown")
        : t("preview.reasons.too_short", { duration: formatDuration(reason.durationSeconds) });
  } else if (reason.code === "live") {
    text = t("preview.reasons.live");
  } else {
    text = t("preview.reasons.blocked_keyword", { keyword: reason.keyword });
  }
  return (
    <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
      {text}
    </Badge>
  );
}
