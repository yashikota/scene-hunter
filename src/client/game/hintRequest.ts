import type { HintsResult } from '../api';
import type { GmAction, GmState } from './gmMachine';

/**
 * ヒントの生成を待つ上限。サーバーは 1 回 6.7〜78 秒かかる生成を 3 回まで試すので、それより長くする。
 * 応答が無いまま待ち続けて hinting から抜けられなくならないように。
 */
export const HINTS_TIMEOUT_MS = 300_000;

/**
 * ヒントを頼み、結果を GM のアクションにする。どんな失敗（どの status でも、通信の失敗でも、時間切れでも）も
 * hintsFailed にして、GM の画面にやり直しのボタンを出す。
 */
export async function requestHintsAction(
  request: () => Promise<HintsResult>,
  now: () => number,
  timeoutMs = HINTS_TIMEOUT_MS,
): Promise<GmAction> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('hint request timed out')), timeoutMs);
      }),
    ]);
    return r.ok ? { type: 'hintsReady', hints: r.hints, at: now() } : { type: 'hintsFailed' };
  } catch (e) {
    console.warn('ヒントを作れなかった', e);
    return { type: 'hintsFailed' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 再読み込みで戻った GM が hinting のままなら、頼み直すお題の写真のキー。
 * ヒントの依頼は再読み込みで消えるので、頼み直さないとこの段階から抜けられない。
 */
export function hintsToResume(s: GmState): string | null {
  return s.phase === 'hinting' && s.gmPhotoKey ? s.gmPhotoKey : null;
}
