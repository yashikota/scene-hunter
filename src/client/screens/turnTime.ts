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

/**
 * ヒント index（0 始まり）の公開までの進み（0〜1）。公開の直前の 10 秒で 0 から 1 まで伸びる
 * （次に出るヒントのバーだけが動き、その先のヒントは 0 のまま待つ）。
 */
export function hintProgress(index: number, startedAt: number | null, now: number): number {
  const p = (elapsedSec(startedAt, now) - (index - 1) * HINT_INTERVAL_SEC) / HINT_INTERVAL_SEC;
  return Math.min(1, Math.max(0, p));
}
