import type { RelayApi } from '../relay';

const RELAY_PREFIX = 'sh-';
const DEFAULT_MAX_AGE_MS = 43_200_000;

/**
 * `sh-` で始まる Relay のうち、作成から maxAgeMs を過ぎたものを消す。
 * 1 件の削除が失敗しても残りは続け、実際に消せた uid だけを返す。
 */
export async function cleanupExpiredRelays(
  relay: RelayApi,
  nowMs: number,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): Promise<string[]> {
  const relays = await relay.list();
  const expired = relays.filter(
    (r) => r.name.startsWith(RELAY_PREFIX) && nowMs - Date.parse(r.created) > maxAgeMs,
  );
  const deleted: string[] = [];
  for (const r of expired) {
    try {
      await relay.delete(r.uid);
      deleted.push(r.uid);
    } catch (e) {
      console.error(`failed to delete relay ${r.uid}`, e);
    }
  }
  return deleted;
}
