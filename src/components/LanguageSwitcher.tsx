import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { LANGUAGES } from "@/i18n";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <Select value={i18n.language} onValueChange={(code) => void i18n.changeLanguage(code)}>
      <SelectTrigger className="h-9 w-9 justify-center border-none px-0 shadow-none [&>svg:last-child]:hidden" aria-label={t("actions.language")} title={t("actions.language")}>
        <Languages className="h-4 w-4" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGES.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            {language.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
