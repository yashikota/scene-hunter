// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useWakeLock } from '../../src/client/ui/useWakeLock';

function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const s = {
      released: false,
      release: vi.fn(async () => {
        s.released = true;
      }),
    };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, sentinels };
}

let visibility: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
const setVisible = (v: DocumentVisibilityState) => {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
};

afterEach(() => {
  cleanup();
  visibility = 'visible';
  Reflect.deleteProperty(navigator, 'wakeLock');
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('useWakeLock', () => {
  it('active の間だけ画面の消灯を止め、タブが戻ったら取り直し、外したら手放す', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender, unmount } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: false },
    });
    await settle();
    expect(request).not.toHaveBeenCalled();

    rerender({ on: true });
    await settle();
    expect(request).toHaveBeenCalledWith('screen');
    expect(request).toHaveBeenCalledTimes(1);

    // タブが隠れるとブラウザが外す。見えるようになったら取り直す
    sentinels[0]!.released = true;
    setVisible('hidden');
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    setVisible('visible');
    await settle();
    expect(request).toHaveBeenCalledTimes(2);

    rerender({ on: false });
    await settle();
    expect(sentinels[1]!.release).toHaveBeenCalled();
    unmount();
  });

  it('対応していない、または断られても何も起きない', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await settle();
    unmount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const again = renderHook(() => useWakeLock(true));
    await settle();
    expect(request).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    again.unmount();
    warn.mockRestore();
  });
});
