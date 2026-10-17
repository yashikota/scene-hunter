import type { GmState } from './gmMachine';

// GM がページを再読み込みしても同じラウンドを続けられるよう、状態を丸ごと保存する。

const keyOf = (room: string) => `sh:gm:${room}`;

export function saveGm(room: string, s: GmState): void {
  localStorage.setItem(keyOf(room), JSON.stringify(s));
}

/** 無い、または壊れていれば null。 */
export function loadGm(room: string): GmState | null {
  const raw = localStorage.getItem(keyOf(room));
  if (raw === null) return null;
  try {
    const s: unknown = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    const o = s as Partial<GmState>;
    if (typeof o.phase !== 'string' || typeof o.players !== 'object' || o.players === null) return null;
    return s as GmState;
  } catch {
    return null;
  }
}
