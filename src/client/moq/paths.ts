// MoQ の broadcast のパスと Track の名前（設計書「パスと Track」）。

export const GM_PREFIX = "gm/";

/** GM の broadcast。再接続のたびに epoch を 1 つ上げる。 */
export function gmPath(epoch: number): string {
  return `${GM_PREFIX}${epoch}`;
}

/** プレイヤーの broadcast。 */
export function playerPath(pid: string): string {
  return `p/${pid}`;
}

/** イベントを 1 つの開いたグループに追記していく Track。 */
export const EVENTS_TRACK = "events";
/** 状態のスナップショットを 1 グループ 1 フレームで送る Track（GM のみ）。 */
export const STATE_TRACK = "state";
