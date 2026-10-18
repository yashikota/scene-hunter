import type { GmState } from "./gmMachine";

// GM がページを再読み込みしても同じラウンドを続けられるよう、状態を丸ごと保存する。

const keyOf = (room: string) => `sh:gm:${room}`;

/** 保存できなくても（容量超過、ストレージ無効など）ゲームは止めない。 */
export function saveGm(room: string, s: GmState): void {
  try {
    localStorage.setItem(keyOf(room), JSON.stringify(s));
  } catch {
    // 再読み込みからの復元ができなくなるだけなので握りつぶす。
  }
}

/** 無い、または壊れていれば null。 */
export function loadGm(room: string): GmState | null {
  try {
    const raw = localStorage.getItem(keyOf(room));
    if (raw === null) return null;
    const s: unknown = JSON.parse(raw);
    if (typeof s !== "object" || s === null) return null;
    const o = s as Partial<GmState>;
    if (typeof o.phase !== "string" || typeof o.players !== "object" || o.players === null)
      return null;
    return s as GmState;
  } catch {
    return null;
  }
}

/** 解散や GM の交代の後に、保存した状態を消す。 */
export function clearGm(room: string): void {
  try {
    localStorage.removeItem(keyOf(room));
  } catch {
    // 消せなくても、次に GM になったときは gmPid の違いで使わない。
  }
}
