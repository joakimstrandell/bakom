import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import sv from "./locales/sv.json";

export const defaultNS = "translation";
export const resources = {
  en: { translation: en },
  sv: { translation: sv },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Detection order: localStorage first, then browser language
      order: ["localStorage", "navigator"],
      // Cache the user's language selection
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
