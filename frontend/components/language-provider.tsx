"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { english } from "@/lib/translations";

type Language = "en" | "th";
const STORAGE_KEY = "snappromo-language";
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "en", setLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "th") updateLanguage(saved);
    } catch {
      // Language switching still works when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(next: Language) {
    updateLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the preference for this visit even in restricted browsers.
    }
  }

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  function t<T>(value: T): T {
    if (typeof value !== "string" || context.language === "th") return value;
    const key = value.replace(/\s+/g, " ").trim();
    const translated = english[key];
    if (translated === undefined) return value;
    return (value.replace(/\S[\s\S]*\S|\S/, translated)) as T;
  }
  return { ...context, t };
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <div role="group" aria-label={language === "en" ? "Website language" : "ภาษาเว็บไซต์"} className="flex shrink-0 items-center rounded-full border p-0.5 text-sm">
      {(["en", "th"] as const).map((value) => (
        <button key={value} type="button" lang={value} aria-pressed={language === value}
          onClick={() => setLanguage(value)}
          className={`min-h-9 min-w-10 rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${language === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {value === "en" ? "EN" : "ไทย"}
        </button>
      ))}
    </div>
  );
}
