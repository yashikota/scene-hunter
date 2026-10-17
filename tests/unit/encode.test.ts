import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { encodeJpeg, fitWithin } from '../../src/client/photo/encode';

describe('fitWithin', () => {
  it('縮めるのは長辺が上限を超えるときだけ', () => {
    expect(fitWithin(4000, 3000)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ w: 960, h: 1280 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(1280, 1280)).toEqual({ w: 1280, h: 1280 });
  });
});

describe('encodeJpeg', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubCanvas(sizeAt: (q: number) => number) {
    const qualities: number[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob) => void, type: string, q: number) => {
        qualities.push(q);
        expect(type).toBe('image/jpeg');
        cb(new Blob([new Uint8Array(sizeAt(q))]));
      },
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    return { canvas, qualities };
  }

  it('既定の品質 0.8 で指定の大きさに描く', async () => {
    const { canvas, qualities } = stubCanvas(() => 1000);
    const blob = await encodeJpeg({} as CanvasImageSource, 1280, 960);
    expect(blob.size).toBe(1000);
    expect(qualities).toEqual([0.8]);
    expect([canvas.width, canvas.height]).toEqual([1280, 960]);
  });

  it('1 MiB を超えるときは品質を下げて作り直す', async () => {
    const { qualities } = stubCanvas((q) => (q > 0.65 ? 2_000_000 : 500_000));
    const blob = await encodeJpeg({} as CanvasImageSource, 1280, 960);
    expect(blob.size).toBe(500_000);
    expect(qualities[0]).toBe(0.8);
    expect(qualities.length).toBeGreaterThan(1);
  });
});
