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

// Only use browser language detector on the client — it accesses localStorage
// and navigator which aren't available during SSR and cause hydration mismatches.
if (typeof window !== "undefined") {
  i18n.use(LanguageDetector);
}

i18n.use(initReactI18next).init({
  resources,
  lng: "sv", // Default language (matches primary audience; overridden by detector on client)
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
