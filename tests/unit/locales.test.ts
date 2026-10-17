import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { LOCALE_FONTS } from '../../src/client/ui/fonts';
import { LOCALES, matchLocale } from '../../src/shared/locales';

const load = (l: string): Record<string, string> =>
  JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'));

describe('locales', () => {
  it.each([
    [['ja-JP'], 'ja'], [['en-US'], 'en'], [['zh-CN'], 'zh-Hans'], [['zh-SG'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hant'], [['zh-HK'], 'zh-Hant'], [['zh'], 'zh-Hans'], [['pt-PT'], 'pt-BR'],
    [['ko-KR'], 'ko'], [['th-TH', 'fr-CA'], 'fr'], [['ar'], 'en'], [[], 'en'],
    [['zh-Hant-TW'], 'zh-Hant'], [['zh-MO'], 'zh-Hant'], [['pt-BR'], 'pt-BR'],
  ])('matchLocale(%j) = %s', (prefs, want) => expect(matchLocale(prefs)).toBe(want));

  it('every locale file has exactly the keys of ja.json', () => {
    const ja = Object.keys(load('ja')).sort();
    for (const l of LOCALES) expect(Object.keys(load(l)).sort()).toEqual(ja);
  });

  it('every locale has fonts', () => {
    for (const l of LOCALES) expect(LOCALE_FONTS[l].display).toBeTruthy();
    expect(LOCALE_FONTS.ko.display).toBe('Jua');
    expect(LOCALE_FONTS['zh-Hans'].body).toBe('Noto Sans SC');
  });
});
