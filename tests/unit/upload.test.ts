import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  checkRoom,
  claim,
  closeRoom,
  joinRoom,
  listPhotos,
  requestHints,
  transfer,
} from '../../src/client/api';
import { uploadPhoto } from '../../src/client/photo/upload';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('uploadPhoto', () => {
  const blob = new Blob([new Uint8Array(1234)], { type: 'image/jpeg' });
  const meta = { gameId: 'g1', round: 2 };

  it('1 回目の PUT が失敗したら URL を取り直し、2 回目の URL に PUT する', async () => {
    const requestUpload = vi
      .fn()
      .mockResolvedValueOnce({ key: 'k1', url: 'https://r2/one' })
      .mockResolvedValueOnce({ key: 'k2', url: 'https://r2/two' });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await uploadPhoto({ requestUpload }, blob, meta)).toBe('k2');
    expect(requestUpload).toHaveBeenCalledTimes(2);
    expect(requestUpload).toHaveBeenCalledWith({ ...meta, size: 1234 });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://r2/one', 'https://r2/two']);
    const init = fetchMock.mock.calls[1][1];
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(init.body).toBe(blob);
  });

  it('通信エラーも失敗として扱い、2 回目も失敗なら投げる', async () => {
    const requestUpload = vi.fn().mockResolvedValue({ key: 'k', url: 'https://r2/x' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    await expect(uploadPhoto({ requestUpload }, blob, meta)).rejects.toThrow();
    expect(requestUpload).toHaveBeenCalledTimes(2);
  });

  it('1 回目で成功すれば取り直さない', async () => {
    const requestUpload = vi.fn().mockResolvedValue({ key: 'k', url: 'https://r2/x' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    expect(await uploadPhoto({ requestUpload }, blob, meta)).toBe('k');
    expect(requestUpload).toHaveBeenCalledTimes(1);
  });
});

describe('joinRoom', () => {
  const joined = { code: 'ABCD', pid: 'p1', roomToken: 't' };

  it('404 を 2 回返した後に 200 なら成功し、そのたびに onWaiting を呼ぶ', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => json({ error: 'not_found' }, 404))
      .mockImplementationOnce(async () => json({ error: 'not_found' }, 404))
      .mockImplementationOnce(async () => json(joined));
    vi.stubGlobal('fetch', fetchMock);
    const onWaiting = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const r = await joinRoom('ABCD', { name: 'a', pubkey: 'k' }, { onWaiting, sleep });
    expect(r).toMatchObject(joined);
    expect(onWaiting).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('60 秒たっても 404 なら投げる', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: 'not_found' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(joinRoom('ABCD', { name: 'a', pubkey: 'k' }, { sleep })).rejects.toMatchObject({
      status: 404,
    });
    expect(sleep).toHaveBeenCalledTimes(20);
  });

  it('404 以外はすぐ投げる', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: 'rate_limited' }, 429));
    vi.stubGlobal('fetch', fetchMock);
    const onWaiting = vi.fn();
    await expect(joinRoom('ABCD', { name: 'a', pubkey: 'k' }, { onWaiting })).rejects.toMatchObject(
      { status: 429 },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe('checkRoom', () => {
  it('200 なら終わる', async () => {
    const fetchMock = vi.fn(async (..._a: unknown[]) => json({ exists: true }));
    vi.stubGlobal('fetch', fetchMock);
    await checkRoom('482913');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/rooms/482913');
  });

  it('exists: false なら 3 秒おきに 2 回だけ確かめ直し、それでも無ければ 404 を投げる（打ち間違いはすぐ知らせる）', async () => {
    const fetchMock = vi.fn(async () => json({ exists: false }));
    vi.stubGlobal('fetch', fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(checkRoom('482913', { sleep })).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[3000], [3000]]);
  });

  it('できた直後で exists: false でも、確かめ直しで見えれば終わる', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => json({ exists: false }))
      .mockImplementationOnce(async () => json({ exists: true }));
    vi.stubGlobal('fetch', fetchMock);
    await checkRoom('482913', { sleep: async () => {} });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('SPA の index.html（200 の HTML）は、あるとみなさず失敗にする', async () => {
    const html = () =>
      new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    const fetchMock = vi.fn(async () => html());
    vi.stubGlobal('fetch', fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(checkRoom('482913', { sleep })).rejects.toThrow();
    // 部屋が無いとは言い切れないので確かめ直さない（打ち間違いの 404 とは区別する）
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('404 以外はすぐ投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'rate_limited' }, 429)),
    );
    await expect(checkRoom('482913')).rejects.toMatchObject({ status: 429 });
  });
});

describe('listPhotos', () => {
  it('SPA の index.html（GET の 404 の差し替え）は失敗として投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    await expect(listPhotos('482913', 'tok', { gameId: 'g', round: 1 })).rejects.toThrow();
  });
});

describe('requestHints', () => {
  const call = () => requestHints('ABCD', 'tok', 'key1');
  const stub = (res: () => Promise<Response>) => {
    const f = vi.fn((..._a: unknown[]) => res());
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('成功すればヒントと、Bearer ヘッダーを送る', async () => {
    const f = stub(async () => json({ hints: ['a', 'b', 'c'] }));
    expect(await call()).toEqual({ ok: true, hints: ['a', 'b', 'c'] });
    const req = f.mock.calls[0]!;
    const headers = new Headers((req[1] as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer tok');
    expect(String(req[0])).toContain('/api/rooms/ABCD/hints');
  });

  it.each([
    [502, 'failed'],
    [413, 'too_large'],
    [429, 'rate_limited'],
  ])('%i は %s', async (status, reason) => {
    stub(async () => json({ error: 'x' }, status));
    expect(await call()).toEqual({ ok: false, reason });
  });

  it('通信エラーは failed', async () => {
    stub(() => Promise.reject(new TypeError('network')));
    expect(await call()).toEqual({ ok: false, reason: 'failed' });
  });

  it('400 や 401 は投げる', async () => {
    stub(async () => json({ error: 'unauthorized' }, 401));
    await expect(call()).rejects.toMatchObject({ status: 401 });
  });
});

describe('そのほかの呼び出し', () => {
  it('listPhotos は query を送り photos を返す', async () => {
    const f = vi.fn(async (..._a: unknown[]) =>
      json({ photos: [{ pid: 'p', key: 'k', url: 'u' }] }),
    );
    vi.stubGlobal('fetch', f);
    expect(await listPhotos('ABCD', 'tok', { gameId: 'g', round: 3 })).toEqual([
      { pid: 'p', key: 'k', url: 'u' },
    ]);
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/gameId=g&round=3/);
  });

  it('transfer は to、claim は交代証を送り、closeRoom は完了する', async () => {
    const f = vi.fn(async (..._a: unknown[]) => json({ ok: true }));
    vi.stubGlobal('fetch', f);
    await transfer('ABCD', 'tok', 'p2');
    expect(JSON.parse(String((f.mock.calls[0] as any)[1].body))).toEqual({ to: 'p2' });
    const cert = { body: { room: 'ABCD', from: 'a', to: 'b', iat: 1, exp: 2 }, sig: 's' };
    await claim('ABCD', 'tok', { transfer: cert, pubkey: 'k', name: 'n' });
    expect(JSON.parse(String((f.mock.calls[1] as any)[1].body))).toEqual({
      transfer: cert,
      pubkey: 'k',
      name: 'n',
    });
    await closeRoom('ABCD', 'tok');
    expect(String((f.mock.calls[2] as unknown[])[0])).toContain('/api/rooms/ABCD/close');
  });
});
