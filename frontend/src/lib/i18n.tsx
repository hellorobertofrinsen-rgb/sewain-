import React, { createContext, useCallback, useContext, useState } from "react";
import { View } from "react-native";
import { EN } from "./i18n.en";

// Two languages. Indonesian is the source text; English lives in i18n.en.ts keyed by
// the Indonesian string, so t("Tambah Unit") reads naturally in the code and falls
// back to Indonesian if a translation is missing.
//   t("{n} prospek aktif", { n: 3 })

export type Lang = "id" | "en";
const LANG_KEY = "sewain_lang";

// Read synchronously on the web so the first paint is already in the right language.
function initialLang(): Lang {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_KEY) : null;
    return v === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

let current: Lang = initialLang();

export function getLang(): Lang {
  return current;
}

export function t(id: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = current === "en" ? (EN[id] ?? id) : id;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : s;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "id", setLang: () => {} });

export function useLang() {
  return useContext(LangCtx);
}

/** Holds the language. Put <LangBoundary> below the providers whose state should survive a switch. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = useCallback((l: Lang) => {
    if (l === current) return;
    current = l;
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // native / private mode: the account setting still carries it
    }
  }, []);
  return (
    <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>
  );
}

/** Re-mounts its children when the language changes so every string re-renders. */
export function LangBoundary({ children }: { children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <View key={lang} style={{ flex: 1 }}>
      {children}
    </View>
  );
}
