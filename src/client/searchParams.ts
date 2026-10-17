import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';

/**
 * 検索文字列の読み取り。ルーターの既定は値を JSON として読むので、?code=1e5 が数の 100000 に、
 * ?code=000123 が 123 になる。部屋番号は文字列のまま検証したいので、code だけ生の文字列で返す。
 */
export function parseSearch(searchStr: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = defaultParseSearch(searchStr);
  const raw = new URLSearchParams(searchStr).get('code');
  if (raw !== null) parsed.code = raw;
  return parsed;
}

/** parseSearch と対になる書き出し。code は JSON にせず、生の文字列のまま ?code=123456 にする。 */
export function stringifySearch(search: Record<string, unknown>): string {
  const { code, ...rest } = search;
  const base = defaultStringifySearch(rest);
  if (typeof code !== 'string') return base;
  const params = new URLSearchParams(base.replace(/^\?/, ''));
  params.set('code', code);
  return `?${params.toString()}`;
}
