export const LOCALES = [
  'ja',
  'en',
  'zh-Hans',
  'zh-Hant',
  'ko',
  'es',
  'fr',
  'de',
  'pt-BR',
  'id',
  'vi',
] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

const HANS_REGIONS = new Set(['CN', 'SG']);
const HANT_REGIONS = new Set(['TW', 'HK', 'MO']);

function matchOne(tag: string): Locale | undefined {
  const parts = tag.split(/[-_]/);
  const lang = parts[0]?.toLowerCase() ?? '';
  const rest = parts.slice(1);

  const exact = LOCALES.find((l) => l.toLowerCase() === tag.replace('_', '-').toLowerCase());
  if (exact) return exact;

  if (lang === 'zh') {
    const script = rest.find((p) => /^(hans|hant)$/i.test(p))?.toLowerCase();
    if (script === 'hant') return 'zh-Hant';
    if (script === 'hans') return 'zh-Hans';
    const region = rest.find((p) => /^[a-z]{2}$/i.test(p))?.toUpperCase();
    if (region && HANT_REGIONS.has(region)) return 'zh-Hant';
    if (region && HANS_REGIONS.has(region)) return 'zh-Hans';
    return 'zh-Hans';
  }
  if (lang === 'pt') return 'pt-BR';
  return LOCALES.find((l) => l === lang);
}

/** ブラウザの言語設定（優先順）から、対応言語の中で最も近いものを選ぶ。無ければ英語。 */
export function matchLocale(prefs: readonly string[]): Locale {
  for (const tag of prefs) {
    const hit = matchOne(tag);
    if (hit) return hit;
  }
  return 'en';
}
