"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { english } from "@/lib/translations";

type Language = "en" | "th";
const STORAGE_KEY = "snappromo-language";
const LANGUAGE_CHANGE = "snappromo-language-change";
let sessionLanguage: Language | undefined;
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "en", setLanguage: () => {} });

function readLanguage(): Language {
  if (sessionLanguage) return sessionLanguage;
  try {
    return localStorage.getItem(STORAGE_KEY) === "th" ? "th" : "en";
  } catch {
    return "en";
  }
}

function subscribeLanguage(notify: () => void) {
  window.addEventListener(LANGUAGE_CHANGE, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGE, notify);
    window.removeEventListener("storage", notify);
  };
}

function setLanguage(next: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
    sessionLanguage = undefined;
  } catch {
    sessionLanguage = next;
  }
  window.dispatchEvent(new Event(LANGUAGE_CHANGE));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore<Language>(subscribeLanguage, readLanguage, () => "en");
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
