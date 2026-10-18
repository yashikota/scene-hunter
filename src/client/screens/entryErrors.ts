import { m } from "../paraglide/messages";

/** 部屋の番号は 6 桁の数字。 */
export const CODE_RE = /^\d{6}$/;
export const NAME_MAX = 12;

/** API の失敗を、画面に出す文言にする。 */
export function errorMessage(e: unknown): string {
  const status = e instanceof Error ? (e as { status?: number }).status : undefined;
  if (status === 404) return m.error_not_found();
  if (status === 429) return m.error_rate_limited();
  return m.error_failed();
}

/** 名前を前後の空白を除いて 1〜12 文字にそろえる。合わなければ null。 */
export function cleanName(raw: string): string | null {
  const n = raw.trim();
  const len = [...n].length;
  return len < 1 || len > NAME_MAX ? null : n;
}
