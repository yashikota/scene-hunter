import { defaultParseSearch } from '@tanstack/react-router';

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
