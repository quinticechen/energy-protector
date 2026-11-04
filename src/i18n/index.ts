import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";

/** Add a language: create locales/<code>.json and list it here. */
export const LANGUAGES = [
  { code: "zh-TW", label: "繁體中文" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const STORAGE_KEY = "handpicked.language";
const DEFAULT_LANGUAGE: LanguageCode = "zh-TW";

function initialLanguage(): LanguageCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return LANGUAGES.some((language) => language.code === saved) ? (saved as LanguageCode) : DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: { "zh-TW": { translation: zhTW }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language === "zh-TW" ? "zh-Hant" : language;
});

export default i18n;
