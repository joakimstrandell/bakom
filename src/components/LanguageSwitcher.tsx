import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "sv" ? "en" : "sv";
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/10 bg-white/50 hover:bg-white/80 transition-colors text-xs font-medium text-muted-foreground hover:text-foreground"
      title={i18n.language === "sv" ? "Switch to English" : "Byt till svenska"}
    >
      <Globe className="size-3.5" />
      <span>{i18n.language === "sv" ? "EN" : "SV"}</span>
    </button>
  );
}
