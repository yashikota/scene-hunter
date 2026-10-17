import { useState } from 'react';
import { matchLocale, type Locale } from '../../shared/locales';
import { setLocale } from '../paraglide/runtime';
import { applyLocaleFonts } from './fonts';

/** 画面の言語を切り替える（文言、フォント、<html lang>）。ページは読み込み直さない。 */
export function switchLocale(locale: Locale): void {
  setLocale(locale, { reload: false });
  applyLocaleFonts(locale);
  document.documentElement.lang = locale;
}

/** ブラウザの言語設定に最も近い対応言語。初回の描画の前に画面をその言語にする。 */
export function useBrowserLocale(): [Locale, (l: Locale) => void] {
  const [locale, set] = useState<Locale>(() => {
    const l = matchLocale(navigator.languages ?? []);
    switchLocale(l);
    return l;
  });
  return [
    locale,
    (l) => {
      switchLocale(l);
      set(l);
    },
  ];
}

/** WebTransport が使えるブラウザか（Chrome 系だけ）。 */
export const isSupportedBrowser = (): boolean => typeof WebTransport !== 'undefined';
