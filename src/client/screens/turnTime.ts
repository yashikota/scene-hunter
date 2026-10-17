// ターン中の残り時間とヒントの公開時刻。どちらもターンの起点（端末の時計）から計算する。

export const HINT_COUNT = 5;
/** ヒント i（0 始まり）は起点から i × 10 秒で公開される（gmMachine と同じ）。 */
export const HINT_INTERVAL_SEC = 10;
/** GM のターンの目安。 */
export const GM_TURN_SEC = 60;

const elapsedSec = (startedAt: number | null, now: number): number =>
  startedAt === null ? 0 : Math.max(0, (now - startedAt) / 1000);

export function remainingSec(startedAt: number | null, limitSec: number, now: number): number {
  return Math.max(0, Math.ceil(limitSec - elapsedSec(startedAt, now)));
}

/** ヒント index（0 始まり）が公開されるまでの秒数。通信の遅れで過ぎていても 1 秒以上で返す。 */
export function hintWaitSec(index: number, startedAt: number | null, now: number): number {
  return Math.max(1, Math.ceil(index * HINT_INTERVAL_SEC - elapsedSec(startedAt, now)));
}
