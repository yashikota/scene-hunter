import type { Locale } from '../../shared/locales';

type FontSet = { display: string; body: string; css2: string };

const MOCHIY = 'Mochiy Pop One';
const MPLUS = 'M PLUS Rounded 1c';
const latin: FontSet = {
  display: MOCHIY,
  body: MPLUS,
  css2: 'family=Mochiy+Pop+One&family=M+PLUS+Rounded+1c:wght@400;700',
};

/** 設計書「フォント」の表。css2 は Google Fonts CSS2 の family= クエリ。 */
export const LOCALE_FONTS: Record<Locale, FontSet> = {
  ja: latin,
  en: latin,
  es: latin,
  fr: latin,
  de: latin,
  'pt-BR': latin,
  id: latin,
  vi: { display: MPLUS, body: MPLUS, css2: 'family=M+PLUS+Rounded+1c:wght@400;700;800' },
  ko: { display: 'Jua', body: 'Gowun Dodum', css2: 'family=Jua&family=Gowun+Dodum' },
  'zh-Hans': { display: 'ZCOOL KuaiLe', body: 'Noto Sans SC', css2: 'family=ZCOOL+KuaiLe&family=Noto+Sans+SC:wght@400;700' },
  'zh-Hant': { display: 'Chiron GoRound TC', body: 'Chiron GoRound TC', css2: 'family=Chiron+GoRound+TC:wght@400;700' },
};

const LINK_ID = 'locale-fonts';

export function applyLocaleFonts(locale: Locale): void {
  const f = LOCALE_FONTS[locale];
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = `https://fonts.googleapis.com/css2?${f.css2}&display=swap`;
  const root = document.documentElement.style;
  root.setProperty('--font-display', `'${f.display}', sans-serif`);
  root.setProperty('--font-body', `'${f.body}', sans-serif`);
}
