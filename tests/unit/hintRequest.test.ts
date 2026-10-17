import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { initialGmState, type GmState } from '../../src/client/game/gmMachine';
import {
  HINTS_TIMEOUT_MS,
  hintsToResume,
  requestHintsAction,
} from '../../src/client/game/hintRequest';

afterEach(() => vi.useRealTimers());

const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
const httpError = (status: number) => Object.assign(new Error(`http ${status}`), { status });

describe('requestHintsAction', () => {
  it('ヒントが届けば hintsReady', async () => {
    const a = await requestHintsAction(
      async () => ({ ok: true, hints: ['a', 'b', 'c', 'd', 'e'] }),
      () => 42,
    );
    expect(a).toEqual({ type: 'hintsReady', hints: ['a', 'b', 'c', 'd', 'e'], at: 42 });
  });

  it('やり直せる失敗も、それ以外の status（400 / 401 / 404 / 500）も、通信の失敗も hintsFailed', async () => {
    const warn = quiet();
    try {
      expect(
        await requestHintsAction(async () => ({ ok: false, reason: 'rate_limited' }), Date.now),
      ).toEqual({ type: 'hintsFailed' });
      for (const status of [400, 401, 404, 500]) {
        expect(await requestHintsAction(() => Promise.reject(httpError(status)), Date.now)).toEqual(
          { type: 'hintsFailed' },
        );
      }
      expect(
        await requestHintsAction(() => Promise.reject(new TypeError('fetch failed')), Date.now),
      ).toEqual({ type: 'hintsFailed' });
    } finally {
      warn.mockRestore();
    }
  });

  it('応答が無いまま HINTS_TIMEOUT_MS 経てば hintsFailed', async () => {
    vi.useFakeTimers();
    const warn = quiet();
    try {
      const p = requestHintsAction(() => new Promise(() => {}), Date.now);
      await vi.advanceTimersByTimeAsync(HINTS_TIMEOUT_MS - 1);
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p).toEqual({ type: 'hintsFailed' });
    } finally {
      warn.mockRestore();
    }
  });
});

describe('hintsToResume', () => {
  const base = initialGmState({
    room: '111111',
    gmPid: 'gm',
    locale: 'ja',
    rounds: 3,
    limitSec: 60,
  });
  it('保存から戻った状態が hinting なら、お題の写真のキーで頼み直す', () => {
    const s: GmState = { ...base, phase: 'hinting', round: 1, gameId: 'g', gmPhotoKey: 'k1' };
    expect(hintsToResume(s)).toBe('k1');
  });
  it('ほかの段階や、キーが無ければ頼まない', () => {
    expect(hintsToResume(base)).toBeNull();
    expect(hintsToResume({ ...base, phase: 'hintError', gmPhotoKey: 'k1' })).toBeNull();
    expect(hintsToResume({ ...base, phase: 'hinting', gmPhotoKey: null })).toBeNull();
  });
});
