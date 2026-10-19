import { useState } from "react";
import { isLocale, matchLocale, type Locale } from "../../shared/locales";
import { setLocale } from "../paraglide/runtime";
import { applyLocaleFonts } from "./fonts";

/** 画面の言語を切り替える（文言、フォント、<html lang>）。ページは読み込み直さない。 */
export function switchLocale(locale: Locale): void {
  setLocale(locale, { reload: false });
  applyLocaleFonts(locale);
  document.documentElement.lang = locale;
}

const LOCALE_KEY = "sh:locale";

/** 前に選んだ言語。選んでいなければ、または読めなければ null。 */
export function loadSavedLocale(): Locale | null {
  try {
    const l = localStorage.getItem(LOCALE_KEY);
    return isLocale(l) ? l : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // 覚えられなくても、次はブラウザの言語設定から選ぶだけ。
  }
}

/**
 * 画面の言語。前に選んだ言語があればそれ、無ければブラウザの言語設定に最も近い対応言語。
 * 初回の描画の前に画面をその言語にする。選び直した言語は覚えておき、次に開いたときも使う。
 */
export function useBrowserLocale(): [Locale, (l: Locale) => void] {
  const [locale, set] = useState<Locale>(() => {
    const l = loadSavedLocale() ?? matchLocale(navigator.languages ?? []);
    switchLocale(l);
    return l;
  });
  return [
    locale,
    (l) => {
      switchLocale(l);
      saveLocale(l);
      set(l);
    },
  ];
}

/** WebTransport が使えるブラウザか（Chrome 系だけ）。 */
export const isSupportedBrowser = (): boolean => typeof WebTransport !== "undefined";
