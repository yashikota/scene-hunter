import { m } from "../paraglide/messages";

/** API の失敗を、画面に出す文言にする。 */
export function errorMessage(e: unknown): string {
  const status = e instanceof Error ? (e as { status?: number }).status : undefined;
  if (status === 404) return m.error_not_found();
  if (status === 429) return m.error_rate_limited();
  return m.error_failed();
}
