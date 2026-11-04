import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface KeywordEditorProps {
  id: string;
  keywords: string[];
  onChange: (keywords: string[]) => void;
}

export function KeywordEditor({ id, keywords, onChange }: KeywordEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  const add = () => {
    // Allow pasting several at once: "政論, 算命、預言".
    const incoming = draft.split(/[,，、\n]/).map((word) => word.trim()).filter(Boolean);
    const existing = new Set(keywords.map((word) => word.toLocaleLowerCase()));
    const fresh = incoming.filter((word) => !existing.has(word.toLocaleLowerCase()));
    if (fresh.length > 0) onChange([...keywords, ...fresh]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      add();
    } else if (event.key === "Backspace" && draft === "" && keywords.length > 0) {
      onChange(keywords.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input id={id} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={t("filters.keywordPlaceholder")} />
        <IconButton icon={Plus} label={t("actions.add")} variant="outline" onClick={add} disabled={!draft.trim()} />
      </div>
      {keywords.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li key={keyword}>
              <Badge variant="secondary" className="gap-1 py-0.5 pl-2.5 pr-1 text-sm font-normal">
                {keyword}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={t("actions.removeKeyword", { keyword })}
                  title={t("actions.removeKeyword", { keyword })}
                  onClick={() => onChange(keywords.filter((item) => item !== keyword))}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
