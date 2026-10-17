import { describe, expect, it } from 'vite-plus/test';
import { createRoomStore, randomRoomCode, type RoomRecord } from '../../src/server/roomStore';

const rec = (o: Partial<RoomRecord> = {}): RoomRecord => ({
  code: '012345',
  relayUid: 'r1',
  moqToken: 'tok',
  locale: 'ja',
  rounds: 3,
  limitSec: 60,
  createdAt: 1,
  ...o,
});

function fakeKv(overwriteOnPut?: (v: string) => string) {
  const m = new Map<string, string>();
  const puts: { key: string; opts: unknown }[] = [];
  const kv = {
    async get(key: string, type?: string) {
      const v = m.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key: string, value: string, opts?: unknown) {
      puts.push({ key, opts });
      m.set(key, overwriteOnPut ? overwriteOnPut(value) : value);
    },
    async delete(key: string) {
      m.delete(key);
    },
  };
  return { kv: kv as never, m, puts };
}

describe('roomStore', () => {
  it('round-trips with ttl 43200', async () => {
    const { kv, puts } = fakeKv();
    const s = createRoomStore(kv);
    expect(await s.put(rec())).toBe(true);
    expect(await s.get('012345')).toEqual(rec());
    expect(puts[0]).toEqual({ key: 'room:012345', opts: { expirationTtl: 43200 } });
  });

  it('returns false when another relayUid is read back', async () => {
    const { kv } = fakeKv((v) => JSON.stringify({ ...JSON.parse(v), relayUid: 'other' }));
    expect(await createRoomStore(kv).put(rec())).toBe(false);
  });

  it('get of missing is null; delete removes', async () => {
    const { kv } = fakeKv();
    const s = createRoomStore(kv);
    expect(await s.get('999999')).toBeNull();
    await s.put(rec());
    await s.delete('012345');
    expect(await s.get('012345')).toBeNull();
  });
});

describe('randomRoomCode', () => {
  it('keeps leading zeros and range', () => {
    expect(randomRoomCode(() => 0)).toBe('000000');
    expect(randomRoomCode(() => 0.9999999)).toBe('999999');
  });

  it('default CSPRNG path yields 6 digits', () => {
    for (let i = 0; i < 200; i++) expect(randomRoomCode()).toMatch(/^\d{6}$/);
  });

  it('store methods work when destructured', async () => {
    const { kv } = fakeKv();
    const { put, get } = createRoomStore(kv);
    expect(await put(rec())).toBe(true);
    expect(await get('012345')).toEqual(rec());
  });
});
