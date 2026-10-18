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

/** 最後のヒントが出るまでの秒数（ヒント 1 は起点で出るので、残りの 4 つ × 10 秒）。 */
export const HINT_TIMELINE_SEC = (HINT_COUNT - 1) * HINT_INTERVAL_SEC;

/** 起点から最後のヒントの公開までの進み（0〜1）。1 本のバーで、10 秒ごとの目盛りに次のヒントが出る。 */
export function hintTimeline(startedAt: number | null, now: number): number {
  return Math.min(1, elapsedSec(startedAt, now) / HINT_TIMELINE_SEC);
}
