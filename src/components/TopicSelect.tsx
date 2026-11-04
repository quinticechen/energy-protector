import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTopics } from "@/hooks/useSources";

interface TopicSelectProps {
  value: string | null;
  onChange: (slug: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function TopicSelect({ value, onChange, disabled, className, ...props }: TopicSelectProps) {
  const { t } = useTranslation();
  const topics = useTopics();
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || topics.isPending}>
      <SelectTrigger className={className} aria-label={props["aria-label"] ?? t("sources.topicPlaceholder")}>
        <SelectValue placeholder={t("sources.topicPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {(topics.data ?? []).map((topic) => (
          <SelectItem key={topic.slug} value={topic.slug}>
            {topic.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
