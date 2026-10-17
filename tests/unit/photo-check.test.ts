import { describe, expect, it, vi } from 'vite-plus/test';
import {
  gmReduce,
  initialGmState,
  type GmAction,
  type GmState,
} from '../../src/client/game/gmMachine';
import {
  checkRoundPhotos,
  PHOTO_TIMEOUT_MS,
  type PhotoCheckDeps,
} from '../../src/client/game/photoCheck';
import { sha256Hex } from '../../src/shared/crypto';

const enc = (s: string) => new TextEncoder().encode(s);

/** 2 人（a は正しい写真、b は申告と違う写真）が提出した picking の状態。 */
async function pickingState(): Promise<GmState> {
  let s = initialGmState({ room: '482913', gmPid: 'gm', locale: 'ja', rounds: 3, limitSec: 60 });
  const step = (a: GmAction) => (s = gmReduce(s, a).state);
  step({ type: 'playerJoined', pid: 'a', name: 'A', at: 0 });
  step({ type: 'playerJoined', pid: 'b', name: 'B', at: 0 });
  step({ type: 'start', gameId: 'g1' });
  step({ type: 'gmPhotoUploaded', key: 'rooms/482913/g1/1/gm-0' });
  step({ type: 'hintsReady', hints: ['1', '2', '3', '4', '5'], at: 1000 });
  step({ type: 'shutter', round: 1, pid: 'a', hash: await sha256Hex(enc('photo-a')), at: 2000 });
  step({ type: 'shutter', round: 1, pid: 'b', hash: await sha256Hex(enc('photo-b')), at: 3000 });
  step({ type: 'submit', round: 1, pid: 'a', key: 'rooms/482913/g1/1/a-1', at: 4000 });
  step({ type: 'submit', round: 1, pid: 'b', key: 'rooms/482913/g1/1/b-1', at: 5000 });
  expect(s.phase).toBe('picking');
  return s;
}

const LIST = [
  { pid: 'gm', key: 'rooms/482913/g1/1/gm-0', url: 'u:gm' },
  { pid: 'a', key: 'rooms/482913/g1/1/a-1', url: 'u:a' },
  { pid: 'a', key: 'rooms/482913/g1/1/a-0', url: 'u:a-old' },
  { pid: 'b', key: 'rooms/482913/g1/1/b-1', url: 'u:b' },
];

function deps(over: Partial<PhotoCheckDeps> = {}) {
  const dispatched: GmAction[] = [];
  const d: PhotoCheckDeps = {
    listPhotos: async () => LIST,
    fetchBytes: async (url) => enc(url === 'u:a' ? 'photo-a' : 'tampered'),
    sha256Hex,
    dispatch: (a) => void dispatched.push(a),
    stopped: () => false,
    sleep: async () => {},
    ...over,
  };
  return { d, dispatched };
}

describe('checkRoundPhotos', () => {
  it('ハッシュが合わない写真は無効にし、全員の判定のあとに results を送る', async () => {
    const { d, dispatched } = deps();
    await checkRoundPhotos(await pickingState(), d);
    const checks = dispatched.filter((a) => a.type === 'photoChecked');
    expect(checks).toHaveLength(2);
    expect(checks).toContainEqual({ type: 'photoChecked', pid: 'a', valid: true });
    expect(checks).toContainEqual({ type: 'photoChecked', pid: 'b', valid: false });
    // results は最後。GM の写真と、提出のキーと同じ写真だけを渡す（古い a-0 は使わない）
    expect(dispatched.at(-1)).toEqual({
      type: 'resultsReady',
      gmPhotoUrl: 'u:gm',
      photos: [
        { pid: 'a', url: 'u:a' },
        { pid: 'b', url: 'u:b' },
      ],
    });
  });

  it('一覧は取れるまでやり直し、写真を取得できないときは無効にする', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listPhotos = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(LIST);
    const sleeps: number[] = [];
    const { d, dispatched } = deps({
      listPhotos,
      fetchBytes: async () => {
        throw new Error('network');
      },
      sleep: async (ms) => void sleeps.push(ms),
    });
    await checkRoundPhotos(await pickingState(), d);
    expect(listPhotos).toHaveBeenCalledTimes(2);
    expect(
      dispatched
        .filter((a) => a.type === 'photoChecked')
        .every((a) => a.type === 'photoChecked' && !a.valid),
    ).toBe(true);
    expect(dispatched.at(-1)?.type).toBe('resultsReady');
    expect(sleeps[0]).toBe(1000);
    vi.restoreAllMocks();
  });

  it('止められたら何も送らない', async () => {
    const { d, dispatched } = deps({ stopped: () => true });
    await checkRoundPhotos(await pickingState(), d);
    expect(dispatched).toEqual([]);
  });

  it('写真の取得が応答なしで止まっても、時間切れのあとに無効として results を送る', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { d, dispatched } = deps({ fetchBytes: () => new Promise(() => {}) });
    const done = checkRoundPhotos(await pickingState(), d);
    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS * 3 + 100);
    await done;
    const checks = dispatched.filter((a) => a.type === 'photoChecked');
    expect(checks).toHaveLength(2);
    expect(checks.every((a) => a.type === 'photoChecked' && !a.valid)).toBe(true);
    expect(dispatched.at(-1)?.type).toBe('resultsReady');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('一覧の取得が応答なしで止まっても、時間切れのあとにやり直す', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const listPhotos = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(LIST);
    const { d, dispatched } = deps({ listPhotos });
    const done = checkRoundPhotos(await pickingState(), d);
    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS + 100);
    await done;
    expect(listPhotos).toHaveBeenCalledTimes(2);
    expect(dispatched.at(-1)?.type).toBe('resultsReady');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('GM の機械に通すと photoChecked の無効が results に入り、選べなくなる', async () => {
    const s0 = await pickingState();
    const { d, dispatched } = deps();
    await checkRoundPhotos(s0, d);
    const s = dispatched.reduce((st, a) => gmReduce(st, a).state, s0);
    expect([...(s.results?.photos ?? [])].sort((x, y) => (x.pid < y.pid ? -1 : 1))).toEqual([
      { pid: 'a', url: 'u:a', valid: true },
      { pid: 'b', url: 'u:b', valid: false },
    ]);
    expect(gmReduce(s, { type: 'togglePick', pid: 'b' }).state.picks).toEqual([]);
  });
});
